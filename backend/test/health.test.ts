import RedisMock from "ioredis-mock";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("GET /health", () => {
  it("returns ok", async () => {
    const app = createApp(new RedisMock() as any);
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("GET /api/sale", () => {
  it("returns sale status seeded from config", async () => {
    const redis = new RedisMock();
    await redis.setnx("sale:flash-sale-1:stock", 100);
    const app = createApp(redis as any);
    const res = await request(app).get("/api/sale");
    expect(res.status).toBe(200);
    expect(res.body.stock).toBe(100);
    expect(["upcoming", "active", "ended"]).toContain(res.body.status);
  });
});
