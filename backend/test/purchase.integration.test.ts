import { Redis } from "ioredis";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { saleKeys } from "../src/services/sale.keys.js";
import { seedStock } from "../src/services/sale.service.js";

const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://localhost:6379/15";
const keys = saleKeys(env.sale.id);
const startsAt = new Date(env.sale.startsAt).getTime();
const endsAt = new Date(env.sale.endsAt).getTime();

let redis: Redis;

function appAt(ms: number) {
  return createApp(redis, { clock: () => new Date(ms) });
}

const insideWindow = () => appAt(startsAt + 1000);

beforeAll(() => {
  redis = new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: 1, retryStrategy: () => null });
});

beforeEach(async () => {
  await redis.flushdb();
  await seedStock(redis);
});

afterAll(async () => {
  await redis.quit();
});

async function stockNow() {
  return Number(await redis.get(keys.stock));
}

describe("input validation", () => {
  it.each([
    ["missing userId", {}],
    ["null userId", { userId: null }],
    ["numeric userId", { userId: 123 }],
    ["empty userId", { userId: "" }],
    ["blank userId", { userId: "   " }],
  ])("rejects %s with 400 and leaves stock untouched", async (_name, body) => {
    const res = await request(insideWindow()).post("/api/purchase").send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "INVALID_USER_ID" });
    expect(await stockNow()).toBe(env.sale.stock);
  });

  it("rejects malformed JSON with a JSON 400", async () => {
    const res = await request(insideWindow())
      .post("/api/purchase")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "INVALID_JSON" });
  });
});

describe("sale window", () => {
  it("rejects before the sale starts", async () => {
    const res = await request(appAt(startsAt - 1)).post("/api/purchase").send({ userId: "u1" });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "SALE_NOT_STARTED" });
    expect(await stockNow()).toBe(env.sale.stock);
  });

  it("allows a purchase exactly at startsAt (inclusive)", async () => {
    const res = await request(appAt(startsAt)).post("/api/purchase").send({ userId: "u1" });
    expect(res.status).toBe(201);
  });

  it("allows a purchase just before endsAt", async () => {
    const res = await request(appAt(endsAt - 1)).post("/api/purchase").send({ userId: "u1" });
    expect(res.status).toBe(201);
  });

  it("rejects exactly at endsAt (exclusive)", async () => {
    const res = await request(appAt(endsAt)).post("/api/purchase").send({ userId: "u1" });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "SALE_ENDED" });
    expect(await stockNow()).toBe(env.sale.stock);
  });
});

describe("purchase logic", () => {
  it("first purchase succeeds, decrements stock and records the buyer", async () => {
    const res = await request(insideWindow()).post("/api/purchase").send({ userId: "u1" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ status: "purchased", saleId: env.sale.id, userId: "u1" });
    expect(await stockNow()).toBe(env.sale.stock - 1);
    expect(await redis.sismember(keys.buyers, "u1")).toBe(1);
  });

  it("second purchase by the same user is rejected and does not consume stock", async () => {
    await request(insideWindow()).post("/api/purchase").send({ userId: "u1" });
    const res = await request(insideWindow()).post("/api/purchase").send({ userId: "u1" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "ALREADY_PURCHASED" });
    expect(await stockNow()).toBe(env.sale.stock - 1);
  });

  it("different users each get one item", async () => {
    const a = await request(insideWindow()).post("/api/purchase").send({ userId: "u1" });
    const b = await request(insideWindow()).post("/api/purchase").send({ userId: "u2" });
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(await stockNow()).toBe(env.sale.stock - 2);
    expect(await redis.scard(keys.buyers)).toBe(2);
  });

  it("returns SOLD_OUT at zero stock and does not record the user", async () => {
    await redis.set(keys.stock, 0);
    const res = await request(insideWindow()).post("/api/purchase").send({ userId: "u1" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "SOLD_OUT" });
    expect(await redis.sismember(keys.buyers, "u1")).toBe(0);
    expect(await stockNow()).toBe(0);
  });

  it("treats negative stock as sold out and never decrements further", async () => {
    await redis.set(keys.stock, -1);
    const res = await request(insideWindow()).post("/api/purchase").send({ userId: "u1" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "SOLD_OUT" });
    expect(await stockNow()).toBe(-1);
  });

  it("prefers ALREADY_PURCHASED over SOLD_OUT", async () => {
    await redis.set(keys.stock, 1);
    await request(insideWindow()).post("/api/purchase").send({ userId: "u1" });
    expect(await stockNow()).toBe(0);
    const res = await request(insideWindow()).post("/api/purchase").send({ userId: "u1" });
    expect(res.body).toEqual({ error: "ALREADY_PURCHASED" });
  });

  it("returns 503 when the stock key is missing", async () => {
    await redis.del(keys.stock);
    const res = await request(insideWindow()).post("/api/purchase").send({ userId: "u1" });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "SALE_NOT_INITIALIZED" });
    expect(await redis.sismember(keys.buyers, "u1")).toBe(0);
  });
});

describe("seeding", () => {
  it("does not overwrite existing stock", async () => {
    await redis.set(keys.stock, 7);
    await seedStock(redis);
    expect(await stockNow()).toBe(7);
  });
});
