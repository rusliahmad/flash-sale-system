import http from "node:http";
import { Redis } from "ioredis";
import { env } from "../src/config/env.js";
import { saleKeys } from "../src/services/sale.keys.js";

const BASE_URL = process.env.STRESS_BASE_URL ?? `http://localhost:${env.port}`;
const MAX_CONNECTIONS = Number(process.env.STRESS_CONNECTIONS ?? 100);
const keys = saleKeys(env.sale.id);
const redis = new Redis(env.redisUrl);
const agent = new http.Agent({ keepAlive: true, maxSockets: MAX_CONNECTIONS });

interface Sample {
  status: number;
  ms: number;
}

function post(userId: string): Promise<Sample> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const body = JSON.stringify({ userId });
    const req = http.request(
      `${BASE_URL}/api/purchase`,
      {
        method: "POST",
        agent,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        res.resume();
        res.on("end", () =>
          resolve({ status: res.statusCode as number, ms: performance.now() - started }),
        );
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

async function fireAll(n: number, userFor: (i: number) => string): Promise<Sample[]> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const jobs = Array.from({ length: n }, (_, i) => gate.then(() => post(userFor(i))));
  release();
  return Promise.all(jobs);
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

interface Scenario {
  name: string;
  stock: number;
  requests: number;
  userFor: (i: number) => string;
  expectedCreated: number;
}

const scenarios: Scenario[] = [
  {
    name: "1. 1000 distinct users compete for 100 items",
    stock: 100,
    requests: 1000,
    userFor: (i) => `user-${i}`,
    expectedCreated: 100,
  },
  {
    name: "2. one user sends 200 requests, stock is plentiful",
    stock: 100,
    requests: 200,
    userFor: () => "same-user",
    expectedCreated: 1,
  },
  {
    name: "3. 500 users x 3 requests each for 50 items",
    stock: 50,
    requests: 1500,
    userFor: (i) => `user-${i % 500}`,
    expectedCreated: 50,
  },
];

async function run(): Promise<boolean> {
  let allPassed = true;
  console.log(`Target: ${BASE_URL}  |  max connections: ${MAX_CONNECTIONS}\n`);

  for (const s of scenarios) {
    await redis.flushdb();
    await redis.set(keys.stock, s.stock);

    const started = performance.now();
    const samples = await fireAll(s.requests, s.userFor);
    const seconds = (performance.now() - started) / 1000;

    const counts: Record<number, number> = {};
    for (const x of samples) counts[x.status] = (counts[x.status] ?? 0) + 1;
    const created = counts[201] ?? 0;
    const stockLeft = Number(await redis.get(keys.stock));
    const buyers = await redis.scard(keys.buyers);
    const latencies = samples.map((x) => x.ms).sort((a, b) => a - b);

    const checks: [string, boolean][] = [
      [`created = ${s.expectedCreated}`, created === s.expectedCreated],
      ["created = stock drop", created === s.stock - stockLeft],
      ["created = buyers set size", created === buyers],
      ["stock never negative", stockLeft >= 0],
      ["only 201/409 returned", Object.keys(counts).every((c) => c === "201" || c === "409")],
    ];
    const passed = checks.every(([, ok]) => ok);
    allPassed &&= passed;

    console.log(`Scenario ${s.name}`);
    console.log(`  statuses: ${JSON.stringify(counts)}  stock left: ${stockLeft}  buyers: ${buyers}`);
    console.log(
      `  ${s.requests} requests in ${seconds.toFixed(2)}s  (${(s.requests / seconds).toFixed(0)} req/s)` +
        `  p50 ${percentile(latencies, 50).toFixed(1)}ms  p95 ${percentile(latencies, 95).toFixed(1)}ms`,
    );
    for (const [label, ok] of checks) console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}`);
    console.log();
  }

  console.log(allPassed ? "RESULT: all invariants held" : "RESULT: INVARIANT VIOLATION");
  return allPassed;
}

run()
  .then((ok) => {
    agent.destroy();
    return redis.quit().then(() => process.exit(ok ? 0 : 1));
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
