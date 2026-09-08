import cors from "cors";
import express, { type Express } from "express";
import { getStore } from "./db.js";
import { alertsRouter } from "./routes/alerts.js";
import { fraudRouter } from "./routes/fraud.js";
import { hermesRouter } from "./routes/hermes.js";

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", storeMode: getStore().mode });
  });

  app.use("/api/v1/fraud", fraudRouter);
  app.use("/api/v1/alerts", alertsRouter);
  app.use("/api/v1/hermes", hermesRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[server] Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
