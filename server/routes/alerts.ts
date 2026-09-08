import { Router, type Request, type Response } from "express";
import { DEMO_ORG_ID, getStore } from "../db.js";
import { dashboardEvents, publishDashboardEvent } from "../lib/eventBus.js";
import type { AlertStatus } from "../types.js";

export const alertsRouter = Router();

const VALID_STATUSES: AlertStatus[] = ["OPEN", "RESOLVED_APPROVED", "RESOLVED_BLOCKED"];

/** GET /api/v1/alerts?status=OPEN — list alerts for the analyst workspace. */
alertsRouter.get("/", async (req: Request, res: Response) => {
  const orgId = typeof req.query.orgId === "string" ? req.query.orgId : DEMO_ORG_ID;
  const statusParam = req.query.status;
  const status =
    typeof statusParam === "string" && (VALID_STATUSES as string[]).includes(statusParam)
      ? (statusParam as AlertStatus)
      : undefined;

  const alerts = await getStore().listAlerts(orgId, status);
  res.json({ alerts });
});

/** GET /api/v1/alerts/:id — investigation view detail. */
alertsRouter.get("/:id", async (req: Request, res: Response) => {
  const alert = await getStore().getAlert(req.params.id);
  if (!alert) {
    res.status(404).json({ error: `Alert ${req.params.id} not found` });
    return;
  }
  res.json({ alert });
});

/**
 * POST /api/v1/alerts/:id/resolve — the human-in-the-loop decision point.
 * This is the ONLY place an OPEN alert's transaction is ever moved to a
 * final APPROVED/BLOCKED state; it always requires an explicit analyst
 * decision in the request body, never an automated one.
 */
alertsRouter.post("/:id/resolve", async (req: Request, res: Response) => {
  const decision = req.body?.decision;
  if (decision !== "APPROVE" && decision !== "BLOCK") {
    res.status(400).json({ error: "decision must be 'APPROVE' or 'BLOCK'" });
    return;
  }

  const analystId = req.header("x-user-id") ?? null;
  const status = decision === "APPROVE" ? "RESOLVED_APPROVED" : "RESOLVED_BLOCKED";

  const alert = await getStore().resolveAlert(req.params.id, status, analystId);
  if (!alert) {
    res.status(404).json({ error: `Alert ${req.params.id} not found` });
    return;
  }

  publishDashboardEvent({ type: "alert.resolved", alert });
  res.json({ alert });
});

/**
 * GET /api/v1/alerts/stream — Server-Sent Events feed used by the dashboard
 * when running against the in-memory fallback store (no Supabase Realtime
 * available). When Supabase is configured the frontend subscribes to
 * postgres_changes directly instead; this endpoint stays harmless either way.
 */
alertsRouter.get("/stream/live", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const onEvent = (event: unknown) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  dashboardEvents.on("event", onEvent);

  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    dashboardEvents.off("event", onEvent);
  });
});
