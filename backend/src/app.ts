import cors from "cors";
import express, { type Express } from "express";
import type { Redis } from "ioredis";
import { saleRouter } from "./routes/sale.routes.js";

export function createApp(redis: Redis): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", saleRouter(redis));

  return app;
}
