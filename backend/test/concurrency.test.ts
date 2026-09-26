import { Redis } from "ioredis";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { purchase } from "../src/services/purchase.service.js";
import { saleKeys } from "../src/services/sale.keys.js";
import { seedStock } from "../src/services/sale.service.js";

const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://localhost:6379/15";
const keys = saleKeys(env.sale.id);

let redis: Redis;
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  redis = new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: 1, retryStrategy: () => null });
  await new Promise<void>((resolve) => {
    server = createApp(redis).listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  await redis.flushdb();
  await seedStock(redis);
});

afterAll(async () => {
  agent.destroy();
  await new Promise((resolve) => server.close(resolve));
  await redis.quit();
});

async function fireAll<T>(n: number, task: (i: number) => Promise<T>): Promise<T[]> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const jobs = Array.from({ length: n }, (_, i) => gate.then(() => task(i)));
  release();
  return Promise.all(jobs);
}

const agent = new http.Agent({ keepAlive: true, maxSockets: 100 });

function post(userId: string, base: string = baseUrl): Promise<number> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ userId });
    const req = http.request(
      `${base}/api/purchase`,
      {
        method: "POST",
        agent,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode as number));
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

function tally(statuses: number[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const s of statuses) counts[s] = (counts[s] ?? 0) + 1;
  return counts;
}

async function expectConsistent(initialStock: number, created: number) {
  const stock = Number(await redis.get(keys.stock));
  expect(stock).toBeGreaterThanOrEqual(0);
  expect(created).toBe(initialStock - stock);
  expect(await redis.scard(keys.buyers)).toBe(created);
}

describe("atomic purchase under concurrent load (Lua script, via HTTP)", () => {
  it("scenario 1: 1000 distinct users compete for 100 items", async () => {
    await redis.set(keys.stock, 100);
    const statuses = await fireAll(1000, (i) => post(`user-${i}`));
    const counts = tally(statuses);
    expect(counts[201]).toBe(100);
    expect(counts[409]).toBe(900);
    expect(Object.keys(counts).sort()).toEqual(["201", "409"]);
    expect(Number(await redis.get(keys.stock))).toBe(0);
    await expectConsistent(100, 100);
  }, 30_000);

  it("scenario 2: one user fires 200 requests, stock is plentiful", async () => {
    await redis.set(keys.stock, 100);
    const statuses = await fireAll(200, () => post("same-user"));
    const counts = tally(statuses);
    expect(counts[201]).toBe(1);
    expect(counts[409]).toBe(199);
    expect(Number(await redis.get(keys.stock))).toBe(99);
    await expectConsistent(100, 1);
  }, 30_000);

  it("scenario 3: 500 users x 3 requests each for 50 items", async () => {
    await redis.set(keys.stock, 50);
    const statuses = await fireAll(1500, (i) => post(`user-${i % 500}`));
    const counts = tally(statuses);
    expect(counts[201]).toBe(50);
    expect(Object.keys(counts).sort()).toEqual(["201", "409"]);
    await expectConsistent(50, 50);
  }, 30_000);

  it("repeats the contested-stock scenario to rule out lucky timing", async () => {
    for (let round = 0; round < 10; round++) {
      await redis.flushdb();
      await redis.set(keys.stock, 20);
      const statuses = await fireAll(200, (i) => post(`round-${round}-user-${i}`));
      expect(tally(statuses)[201]).toBe(20);
      await expectConsistent(20, 20);
    }
  }, 60_000);
});

async function naivePurchase(userId: string): Promise<"OK" | "ALREADY_PURCHASED" | "SOLD_OUT"> {
  const stock = Number(await redis.get(keys.stock));
  if (stock <= 0) return "SOLD_OUT";
  if ((await redis.sismember(keys.buyers, userId)) === 1) return "ALREADY_PURCHASED";
  await redis.decr(keys.stock);
  await redis.sadd(keys.buyers, userId);
  return "OK";
}

describe("negative control through the same HTTP path", () => {
  let naiveServer: Server;
  let naiveUrl: string;

  beforeAll(async () => {
    const app = createApp(redis, { purchase: (_redis, userId) => naivePurchase(userId) });
    await new Promise<void>((resolve) => {
      naiveServer = app.listen(0, resolve);
    });
    naiveUrl = `http://127.0.0.1:${(naiveServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => naiveServer.close(resolve));
  });

  it("naive check-then-act oversells over HTTP under identical load", async () => {
    await redis.set(keys.stock, 100);
    const statuses = await fireAll(1000, (i) => post(`user-${i}`, naiveUrl));
    expect(tally(statuses)[201]).toBeGreaterThan(100);
    expect(Number(await redis.get(keys.stock))).toBeLessThan(0);
  }, 30_000);

  it("naive version lets one user buy many times over HTTP", async () => {
    await redis.set(keys.stock, 100);
    const statuses = await fireAll(200, () => post("same-user", naiveUrl));
    expect(tally(statuses)[201]).toBeGreaterThan(1);
  }, 30_000);
});

describe("negative control: the same load against a naive check-then-act version", () => {
  it("oversells stock (proves these tests can fail)", async () => {
    await redis.set(keys.stock, 100);
    const results = await fireAll(1000, (i) => naivePurchase(`user-${i}`));
    const sold = results.filter((r) => r === "OK").length;
    expect(sold).toBeGreaterThan(100);
    expect(Number(await redis.get(keys.stock))).toBeLessThan(0);
  }, 30_000);

  it("lets one user buy many times", async () => {
    await redis.set(keys.stock, 100);
    const results = await fireAll(200, () => naivePurchase("same-user"));
    expect(results.filter((r) => r === "OK").length).toBeGreaterThan(1);
  }, 30_000);

  it("the Lua version under the identical direct load stays exact", async () => {
    await redis.set(keys.stock, 100);
    const results = await fireAll(1000, (i) => purchase(redis, `user-${i}`));
    expect(results.filter((r) => r === "OK").length).toBe(100);
    await expectConsistent(100, 100);
  }, 30_000);
});
