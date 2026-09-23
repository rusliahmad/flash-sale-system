import { Router } from "express";
import type { Redis } from "ioredis";
import { getSaleStatus } from "../services/sale.service.js";

export function saleRouter(redis: Redis): Router {
  const router = Router();

  router.get("/sale", async (_req, res) => {
    const status = await getSaleStatus(redis);
    res.json(status);
  });

  router.post("/purchase", async (_req, res) => {
    res.status(501).json({ error: "not implemented yet" });
  });

  return router;
}
