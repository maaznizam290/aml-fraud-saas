/**
 * Thin, consistent wrapper around OrchestrationStore.insertAuditLog. Every
 * step of an investigation is meant to be reconstructable later (task
 * section 14) via `correlationId` — this is what makes that possible: one
 * call site, one shape, per meaningful event.
 *
 * Extends the standard action vocabulary documented in docs/DATABASE.md
 * (alert_created, investigation_started, evidence_collected,
 * ml_prediction_generated, ai_recommendation_generated,
 * analyst_decision_recorded, case_created, case_updated, case_resolved)
 * with the events specific to this branch (webhook/Claude/notification).
 */
import type { AuditLog, Json } from "../supabase/types.js";
import type { OrchestrationStore } from "./store.js";

export type AuditAction =
  | "webhook_received"
  | "webhook_rejected"
  | "investigation_started"
  | "evidence_collected"
  | "evidence_collection_failed"
  | "ml_prediction_generated"
  | "ml_prediction_failed"
  | "claude_request_sent"
  | "claude_response_received"
  | "claude_request_failed"
  | "claude_parse_failed"
  | "ai_recommendation_generated"
  | "analyst_decision_recorded"
  | "case_created"
  | "case_updated"
  | "case_resolved"
  | "notification_sent"
  | "notification_failed";

export interface AuditContext {
  organizationId: string;
  actorId: string | null;
  actorRole: string | null;
  correlationId: string;
}

export async function recordAudit(
  store: OrchestrationStore,
  ctx: AuditContext,
  action: AuditAction,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, Json> = {}
): Promise<AuditLog> {
  return store.insertAuditLog({
    organization_id: ctx.organizationId,
    actor_id: ctx.actorId,
    actor_role: ctx.actorRole,
    action,
    entity_type: entityType,
    entity_id: entityId,
    correlation_id: ctx.correlationId,
    metadata,
  });
}
