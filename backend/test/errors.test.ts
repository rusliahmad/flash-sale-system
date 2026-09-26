import type { Redis } from "ioredis";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";

const insideWindow = () => new Date(new Date(env.sale.startsAt).getTime() + 1000);

const brokenRedis = {
  get: () => Promise.reject(new Error("connection lost")),
  eval: () => Promise.reject(new Error("connection lost")),
} as unknown as Redis;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("when Redis fails", () => {
  it("POST /api/purchase returns 503 SERVICE_UNAVAILABLE instead of hanging", async () => {
    const app = createApp(brokenRedis, { clock: insideWindow });
    const res = await request(app).post("/api/purchase").send({ userId: "u1" });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "SERVICE_UNAVAILABLE" });
  });

  it("GET /api/sale returns 503 SERVICE_UNAVAILABLE", async () => {
    const app = createApp(brokenRedis, { clock: insideWindow });
    const res = await request(app).get("/api/sale");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "SERVICE_UNAVAILABLE" });
  });

  it("a Redis command error (for example a script bug) is a 500, not a 503", async () => {
    const replyError = Object.assign(new Error("ERR script failed"), { name: "ReplyError" });
    const scriptBugRedis = { eval: () => Promise.reject(replyError) } as unknown as Redis;
    const app = createApp(scriptBugRedis, { clock: insideWindow });
    const res = await request(app).post("/api/purchase").send({ userId: "u1" });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "INTERNAL_ERROR" });
  });

  it("requests rejected before reaching Redis are unaffected", async () => {
    const app = createApp(brokenRedis, { clock: insideWindow });
    const res = await request(app).post("/api/purchase").send({});
    expect(res.status).toBe(400);
  });
});

describe("malformed input", () => {
  it("returns a JSON 400 for malformed JSON", async () => {
    const app = createApp(brokenRedis, { clock: insideWindow });
    const res = await request(app)
      .post("/api/purchase")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: "INVALID_JSON" });
  });

  it("returns a JSON 413 for an oversized body", async () => {
    const app = createApp(brokenRedis, { clock: insideWindow });
    const res = await request(app)
      .post("/api/purchase")
      .send({ userId: "x".repeat(200_000) });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "PAYLOAD_TOO_LARGE" });
  });
});

describe("unexpected errors", () => {
  it("returns a JSON 500 (not 503) for a bug outside the store", async () => {
    const app = createApp(brokenRedis, {
      clock: insideWindow,
      purchase: async () => {
        throw new Error("programming bug");
      },
    });
    const res = await request(app).post("/api/purchase").send({ userId: "u1" });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "INTERNAL_ERROR" });
  });
});
