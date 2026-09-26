import cors from "cors";
import express, { type Express } from "express";
import type { Redis } from "ioredis";
import { errorHandler } from "./errors.js";
import { saleRouter } from "./routes/sale.routes.js";
import { purchase, type PurchaseFn } from "./services/purchase.service.js";

export type Clock = () => Date;

export interface AppDeps {
  clock?: Clock;
  purchase?: PurchaseFn;
}

export function createApp(redis: Redis, deps: AppDeps = {}): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(
    "/api",
    saleRouter(redis, {
      clock: deps.clock ?? (() => new Date()),
      purchase: deps.purchase ?? purchase,
    }),
  );

  app.use(errorHandler);

  return app;
}
