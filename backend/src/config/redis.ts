import { Redis } from "ioredis";
import { env } from "./env.js";

export function createRedisClient(): Redis {
  const client = new Redis(env.redisUrl, { maxRetriesPerRequest: 2, commandTimeout: 2000 });
  client.on("error", (err) => console.error("redis error:", err.message));
  return client;
}
