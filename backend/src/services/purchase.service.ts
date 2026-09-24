import type { Redis } from "ioredis";
import { env } from "../config/env.js";
import { PURCHASE_SCRIPT, type PurchaseResult } from "./purchase.script.js";
import { saleKeys } from "./sale.keys.js";

export async function purchase(redis: Redis, userId: string): Promise<PurchaseResult> {
  const { stock, buyers } = saleKeys(env.sale.id);
  return (await redis.eval(PURCHASE_SCRIPT, 2, stock, buyers, userId)) as PurchaseResult;
}
