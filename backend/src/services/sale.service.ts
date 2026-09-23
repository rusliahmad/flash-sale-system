import type { Redis } from "ioredis";
import { env } from "../config/env.js";
import { saleKeys } from "./sale.keys.js";

export type SaleWindowStatus = "upcoming" | "active" | "ended";

export interface SaleStatus {
  saleId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  stock: number;
  status: SaleWindowStatus;
}

function windowStatus(startsAt: string, endsAt: string, now: Date): SaleWindowStatus {
  if (now < new Date(startsAt)) return "upcoming";
  if (now > new Date(endsAt)) return "ended";
  return "active";
}

export async function seedStock(redis: Redis): Promise<void> {
  const { stock } = saleKeys(env.sale.id);
  await redis.setnx(stock, env.sale.stock);
}

export async function getSaleStatus(redis: Redis, now = new Date()): Promise<SaleStatus> {
  const { stock } = saleKeys(env.sale.id);
  const remaining = Number((await redis.get(stock)) ?? 0);
  return {
    saleId: env.sale.id,
    name: env.sale.name,
    startsAt: env.sale.startsAt,
    endsAt: env.sale.endsAt,
    stock: remaining,
    status: windowStatus(env.sale.startsAt, env.sale.endsAt, now),
  };
}
