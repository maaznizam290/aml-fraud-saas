import { EventEmitter } from "node:events";
import type { Alert, HermesRule } from "../types.js";

export type DashboardEvent =
  | { type: "alert.created"; alert: Alert }
  | { type: "alert.resolved"; alert: Alert }
  | { type: "hermes_rule.created"; rule: HermesRule }
  | { type: "hermes_rule.promoted"; rule: HermesRule };

/**
 * In-process pub/sub used to push real-time dashboard updates over
 * Server-Sent Events when running against the in-memory fallback store
 * (no Supabase configured). When Supabase IS configured, the frontend
 * subscribes to Postgres changes directly instead and this bus is unused
 * by clients, though routes still publish to it at no cost.
 */
export const dashboardEvents = new EventEmitter();
dashboardEvents.setMaxListeners(50);

export function publishDashboardEvent(event: DashboardEvent): void {
  dashboardEvents.emit("event", event);
}
