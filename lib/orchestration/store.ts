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
  AnalystDecision,
  AuditLog,
  Case,
  CaseEvent,
  Customer,
  CustomerProfile,
  InvestigationState,
  MlPrediction,
  Notification,
  RiskSignal,
  Transaction,
} from "../supabase/types.js";

export interface OrchestrationStore {
  getAlert(alertId: string): Promise<Alert | null>;
  updateAlertStatus(alertId: string, status: InvestigationState, patch?: Partial<Alert>): Promise<Alert>;

  getTransaction(transactionId: string): Promise<Transaction | null>;
  getRecentTransactions(customerId: string, beforeIso: string, limit: number): Promise<Transaction[]>;

  getCustomer(customerId: string): Promise<Customer | null>;
  getCustomerProfile(customerId: string): Promise<CustomerProfile | null>;

  insertRiskSignals(
    signals: Array<Omit<RiskSignal, "id" | "created_at" | "detected_at">>
  ): Promise<RiskSignal[]>;
  insertMlPrediction(prediction: Omit<MlPrediction, "id" | "created_at">): Promise<MlPrediction>;
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
  updateCase(caseId: string, patch: Partial<Case>): Promise<Case>;
  insertCaseEvent(event: Omit<CaseEvent, "id" | "created_at" | "occurred_at">): Promise<CaseEvent>;

  insertAuditLog(log: Omit<AuditLog, "id" | "created_at">): Promise<AuditLog>;
  insertNotification(notification: Omit<Notification, "id" | "created_at">): Promise<Notification>;

  /** Idempotency check for the webhook entry point: has this alert already
   * had a recommendation generated? If so, the webhook handler short-circuits
   * rather than re-running the (costly, side-effecting) investigation. */
  findRecommendationByAlertId(alertId: string): Promise<AiRecommendation | null>;
}
