import { Router } from "express";
import type { Redis } from "ioredis";
import { env } from "../config/env.js";
import { purchase } from "../services/purchase.service.js";
import { getSaleStatus, windowStatus } from "../services/sale.service.js";

export function saleRouter(redis: Redis): Router {
  const router = Router();

  router.get("/sale", async (_req, res) => {
    const status = await getSaleStatus(redis);
    res.json(status);
  });

  router.post("/purchase", async (req, res) => {
    const userId = req.body?.userId;
    if (typeof userId !== "string" || userId.trim() === "") {
      return res.status(400).json({ error: "INVALID_USER_ID" });
    }

    const window = windowStatus(env.sale.startsAt, env.sale.endsAt, new Date());
    if (window === "upcoming") return res.status(403).json({ error: "SALE_NOT_STARTED" });
    if (window === "ended") return res.status(403).json({ error: "SALE_ENDED" });

    const result = await purchase(redis, userId);
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
