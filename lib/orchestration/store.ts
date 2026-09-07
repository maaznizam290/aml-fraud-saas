/**
 * Persistence abstraction for the orchestration layer. Two implementations:
 * `InMemoryOrchestrationStore` (DEMO mode + tests — no live Supabase needed)
 * and `SupabaseOrchestrationStore` (REAL mode, using the service-role client
 * from feature/supabase-schema). Nothing in investigationService.ts or
 * humanReview.ts talks to Supabase directly — everything goes through this
 * interface, which is what makes both DEMO mode and the test suite possible
 * without a live database.
 */
import type {
  AiRecommendation,
  Alert,
  AlertSeverity,
  AnalystDecision,
  AuditLog,
  Case,
  CasePriority,
  CaseStatus,
  CaseEvent,
  Customer,
  CustomerProfile,
  InvestigationState,
  MlPrediction,
  Notification,
  RiskSignal,
  Transaction,
} from "../supabase/types.js";

export interface AlertListItem extends Alert {
  transactionAmount: number | null;
}

export interface AlertListFilter {
  status?: InvestigationState;
  severity?: AlertSeverity;
  minRiskScore?: number;
  /** Case-insensitive substring match against alert id or customer id —
   * a simple, honest search, not a full-text index. */
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CaseListFilter {
  status?: CaseStatus;
  priority?: CasePriority;
  limit?: number;
  offset?: number;
}

export interface AuditLogFilter {
  limit?: number;
  /** ISO timestamp cursor — only rows strictly before this. */
  before?: string;
  entityType?: string;
  /** Every orchestration audit row for one investigation shares its
   * alert's id as `correlation_id` — pass the alertId here to scope the
   * trail to a single investigation. */
  correlationId?: string;
}

export interface OrchestrationStore {
  getAlert(alertId: string): Promise<Alert | null>;
  updateAlertStatus(alertId: string, status: InvestigationState, patch?: Partial<Alert>): Promise<Alert>;
  /** Dashboard/Alert Center listing — org-scoped, paginated. Each item
   * includes its primary transaction's amount (a small join purely for
   * table display — the Alert Center's required "amount" column), never
   * the full transaction. */
  listAlerts(organizationId: string, filter?: AlertListFilter): Promise<{ items: AlertListItem[]; total: number }>;

  getTransaction(transactionId: string): Promise<Transaction | null>;
  getRecentTransactions(customerId: string, beforeIso: string, limit: number): Promise<Transaction[]>;

  getCustomer(customerId: string): Promise<Customer | null>;
  getCustomerProfile(customerId: string): Promise<CustomerProfile | null>;

  insertRiskSignals(
    signals: Array<Omit<RiskSignal, "id" | "created_at" | "detected_at">>
  ): Promise<RiskSignal[]>;
  /** Read-only counterpart to insertRiskSignals, for the Hermes tool
   * boundary (lib/hermes/tools) and any other read-only consumer. */
  getRiskSignalsForAlert(alertId: string): Promise<RiskSignal[]>;
  insertMlPrediction(prediction: Omit<MlPrediction, "id" | "created_at">): Promise<MlPrediction>;
  /** Most recent ML prediction recorded for this alert, if any. */
  getLatestMlPredictionForAlert(alertId: string): Promise<MlPrediction | null>;
  insertRecommendation(
    recommendation: Omit<AiRecommendation, "id" | "created_at">
  ): Promise<AiRecommendation>;
  insertAnalystDecision(
    decision: Omit<AnalystDecision, "id" | "created_at" | "decided_at">
  ): Promise<AnalystDecision>;

  /** Idempotent: returns the existing case for this alert if one was
   * already created (see docs/ORCHESTRATION.md "Idempotency"), otherwise
   * creates one. */
  getOrCreateCase(input: {
    organizationId: string;
    alertId: string;
    customerId: string;
    priority: Case["priority"];
  }): Promise<{ case: Case; created: boolean }>;
  getCase(caseId: string): Promise<Case | null>;
  /** Read-only lookup, unlike getOrCreateCase — for display-only contexts
   * (the investigation workspace) that must never create a case as a side
   * effect of a GET request. */
  getCaseByAlertId(alertId: string): Promise<Case | null>;
  /** Cases page listing — org-scoped, paginated. */
  listCases(organizationId: string, filter?: CaseListFilter): Promise<{ items: Case[]; total: number }>;
  updateCase(caseId: string, patch: Partial<Case>): Promise<Case>;
  insertCaseEvent(event: Omit<CaseEvent, "id" | "created_at" | "occurred_at">): Promise<CaseEvent>;
  /** Case history, oldest first — used by the Hermes tool boundary's
   * "case history" tool (lib/hermes/tools) and available to any other
   * read-only consumer. */
  getCaseEvents(caseId: string): Promise<CaseEvent[]>;
  getAnalystDecisionsForAlert(alertId: string): Promise<AnalystDecision[]>;

  insertAuditLog(log: Omit<AuditLog, "id" | "created_at">): Promise<AuditLog>;
  /** Audit Trail page — org-scoped, newest first, cursor-paginated. Reads
   * the same `audit_logs` table every layer (webhook intake, human review,
   * case resolution, notifications, Hermes learning events) already writes
   * to — this is a reader, not a second audit system. */
  listAuditLogs(organizationId: string, filter?: AuditLogFilter): Promise<AuditLog[]>;
  insertNotification(notification: Omit<Notification, "id" | "created_at">): Promise<Notification>;

  /** Idempotency check for the webhook entry point: has this alert already
   * had a recommendation generated? If so, the webhook handler short-circuits
   * rather than re-running the (costly, side-effecting) investigation. */
  findRecommendationByAlertId(alertId: string): Promise<AiRecommendation | null>;
}
