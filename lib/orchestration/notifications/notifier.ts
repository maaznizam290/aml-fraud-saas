/**
 * Fans a notification out to every configured provider (Slack, Resend, ...)
 * and always persists an in-app `notifications` row when there's a known
 * recipient. This is the one guarantee the rest of the system depends on:
 * `notify*` methods NEVER throw — "do not make notification failure
 * destroy the core investigation" (task section 10) is enforced here, once,
 * rather than trusted to every call site.
 */
import type { Alert, RecommendationDisposition, RiskLevel } from "../../supabase/types.js";
import { recordAudit, type AuditContext } from "../audit.js";
import type { OrchestrationStore } from "../store.js";
import type { NotificationPayload, NotificationProvider } from "./provider.js";

export class NotificationDispatcher {
  constructor(private readonly providers: NotificationProvider[]) {}

  async notifyRecommendationReady(
    store: OrchestrationStore,
    ctx: AuditContext,
    info: { alert: Alert; caseId: string; disposition: RecommendationDisposition; riskLevel: RiskLevel; summary: string }
  ): Promise<void> {
    await this.dispatch(store, ctx, {
      title: `Recommendation ready: ${info.alert.alert_type} (${info.riskLevel})`,
      body: `Case ${info.caseId} — AI recommends ${info.disposition}. ${info.summary}\nHuman review required before any action.`,
      metadata: { alertId: info.alert.id, caseId: info.caseId, disposition: info.disposition },
      recipientId: info.alert.assigned_analyst_id,
      organizationId: info.alert.organization_id,
      notificationType: "RECOMMENDATION_READY",
      entityId: info.caseId,
    });
  }

  async notifyHumanReviewRequired(
    store: OrchestrationStore,
    ctx: AuditContext,
    info: { alert: Alert; caseId: string }
  ): Promise<void> {
    await this.dispatch(store, ctx, {
      title: `Human review required: ${info.alert.alert_type}`,
      body: `Case ${info.caseId} is awaiting analyst review.`,
      metadata: { alertId: info.alert.id, caseId: info.caseId },
      recipientId: info.alert.assigned_analyst_id,
      organizationId: info.alert.organization_id,
      notificationType: "CASE_ASSIGNED",
      entityId: info.caseId,
    });
  }

  async notifyCaseResolved(
    store: OrchestrationStore,
    ctx: AuditContext,
    info: { organizationId: string; caseId: string; analystId: string; disposition: string; recipientId: string | null }
  ): Promise<void> {
    await this.dispatch(store, ctx, {
      title: `Case resolved: ${info.caseId}`,
      body: `Resolved as ${info.disposition} by analyst ${info.analystId}.`,
      metadata: { caseId: info.caseId, disposition: info.disposition },
      recipientId: info.recipientId,
      organizationId: info.organizationId,
      notificationType: "CASE_RESOLVED",
      entityId: info.caseId,
    });
  }

  private async dispatch(
    store: OrchestrationStore,
    ctx: AuditContext,
    input: NotificationPayload & {
      recipientId: string | null;
      organizationId: string;
      notificationType: "ALERT_ASSIGNED" | "CASE_ASSIGNED" | "RECOMMENDATION_READY" | "CASE_RESOLVED" | "MENTION" | "SYSTEM";
      entityId: string;
    }
  ): Promise<void> {
    if (input.recipientId) {
      try {
        await store.insertNotification({
          organization_id: input.organizationId,
          recipient_id: input.recipientId,
          type: input.notificationType,
          title: input.title,
          body: input.body,
          entity_type: "case",
          entity_id: input.entityId,
          is_read: false,
          read_at: null,
          metadata: input.metadata ?? {},
        });
      } catch (err) {
        await recordAudit(store, ctx, "notification_failed", "notification", null, {
          channel: "in_app",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    for (const provider of this.providers) {
      try {
        await provider.send({ title: input.title, body: input.body, metadata: input.metadata });
        await recordAudit(store, ctx, "notification_sent", "notification", input.entityId, {
          channel: provider.channelName,
        });
      } catch (err) {
        // Exactly the guarantee this class exists to provide: swallow and
        // audit, never throw — a Slack outage must never fail an investigation.
        await recordAudit(store, ctx, "notification_failed", "notification", input.entityId, {
          channel: provider.channelName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

/** DEMO mode / tests: no external calls, in-app notification row only. */
export function createNoopNotifier(): NotificationDispatcher {
  return new NotificationDispatcher([]);
}
