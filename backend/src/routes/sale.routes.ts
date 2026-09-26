import { Router } from "express";
import type { Redis } from "ioredis";
import type { Clock } from "../app.js";
import { env } from "../config/env.js";
import type { PurchaseFn } from "../services/purchase.service.js";
import { getSaleStatus, windowStatus } from "../services/sale.service.js";

export interface SaleRouterDeps {
  clock: Clock;
  purchase: PurchaseFn;
}

export function saleRouter(redis: Redis, deps: SaleRouterDeps): Router {
  const router = Router();

  router.get("/sale", async (_req, res) => {
    const status = await getSaleStatus(redis, deps.clock());
    res.json(status);
  });

  router.post("/purchase", async (req, res) => {
    const userId = req.body?.userId;
    if (typeof userId !== "string" || userId.trim() === "") {
      return res.status(400).json({ error: "INVALID_USER_ID" });
    }

    const window = windowStatus(env.sale.startsAt, env.sale.endsAt, deps.clock());
    if (window === "upcoming") return res.status(403).json({ error: "SALE_NOT_STARTED" });
    if (window === "ended") return res.status(403).json({ error: "SALE_ENDED" });

    const result = await deps.purchase(redis, userId);
    switch (result) {
      case "OK":
        return res.status(201).json({ status: "purchased", saleId: env.sale.id, userId });
      case "ALREADY_PURCHASED":
      case "SOLD_OUT":
        return res.status(409).json({ error: result });
      case "NOT_INITIALIZED":
        return res.status(503).json({ error: "SALE_NOT_INITIALIZED" });
    }
  });

  return router;
}
