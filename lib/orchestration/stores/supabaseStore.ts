/**
 * Real (REAL mode) OrchestrationStore backed by Supabase, using the
 * service-role client from feature/supabase-schema
 * (lib/supabase/serviceClient.ts). This bypasses RLS by design — the
 * orchestration service runs as a trusted backend process, not as any
 * individual analyst, so it is solely responsible for scoping every query
 * to the right organization_id itself (RLS won't do it here).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AiRecommendation,
  Alert,
  AnalystDecision,
  AuditLog,
  Case,
  CaseEvent,
  CustomerProfile,
  Customer as CustomerRow,
  Database,
  InvestigationState,
  MlPrediction,
  Notification,
  RiskSignal,
  Transaction,
} from "../../supabase/types.js";
import type { AlertListFilter, AlertListItem, AuditLogFilter, CaseListFilter, OrchestrationStore } from "../store.js";

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, context: string): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${context}: no row returned`);
  return result.data;
}

export class SupabaseOrchestrationStore implements OrchestrationStore {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getAlert(alertId: string): Promise<Alert | null> {
    const { data, error } = await this.client.from("alerts").select("*").eq("id", alertId).maybeSingle();
    if (error) throw new Error(`getAlert: ${error.message}`);
    return data;
  }

  async updateAlertStatus(alertId: string, status: InvestigationState, patch: Partial<Alert> = {}): Promise<Alert> {
    const result = await this.client
      .from("alerts")
      .update({ ...patch, status })
      .eq("id", alertId)
      .select("*")
      .single();
    return unwrap(result, "updateAlertStatus");
  }

  async listAlerts(
    organizationId: string,
    filter: AlertListFilter = {}
  ): Promise<{ items: AlertListItem[]; total: number }> {
    let query = this.client
      .from("alerts")
      .select("*", { count: "exact" })
      .eq("organization_id", organizationId);
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.severity) query = query.eq("severity", filter.severity);
    if (filter.minRiskScore !== undefined) query = query.gte("risk_score", filter.minRiskScore);
    if (filter.search) query = query.or(`id.ilike.%${filter.search}%,customer_id.ilike.%${filter.search}%`);
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 50;
    query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    const { data, error, count } = await query;
    if (error) throw new Error(`listAlerts: ${error.message}`);

    const alerts = data ?? [];
    const transactionIds = alerts.map((a) => a.transaction_id).filter((id): id is string => Boolean(id));
    const amountById = new Map<string, number>();
    if (transactionIds.length > 0) {
      const { data: transactions, error: txnError } = await this.client
        .from("transactions")
        .select("id, amount")
        .in("id", transactionIds);
      if (txnError) throw new Error(`listAlerts (transaction join): ${txnError.message}`);
      for (const t of transactions ?? []) amountById.set(t.id, t.amount);
    }

    const items: AlertListItem[] = alerts.map((a) => ({
      ...a,
      transactionAmount: a.transaction_id ? amountById.get(a.transaction_id) ?? null : null,
    }));
    return { items, total: count ?? 0 };
  }

  async getTransaction(transactionId: string): Promise<Transaction | null> {
    const { data, error } = await this.client.from("transactions").select("*").eq("id", transactionId).maybeSingle();
    if (error) throw new Error(`getTransaction: ${error.message}`);
    return data;
  }

  async getRecentTransactions(customerId: string, beforeIso: string, limit: number): Promise<Transaction[]> {
    const { data, error } = await this.client
      .from("transactions")
      .select("*")
      .eq("customer_id", customerId)
      .lt("transaction_at", beforeIso)
      .order("transaction_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`getRecentTransactions: ${error.message}`);
    return data ?? [];
  }

  async getCustomer(customerId: string): Promise<CustomerRow | null> {
    const { data, error } = await this.client.from("customers").select("*").eq("id", customerId).maybeSingle();
    if (error) throw new Error(`getCustomer: ${error.message}`);
    return data;
  }

  async getCustomerProfile(customerId: string): Promise<CustomerProfile | null> {
    const { data, error } = await this.client
      .from("customer_profiles")
      .select("*")
      .eq("customer_id", customerId)
      .maybeSingle();
    if (error) throw new Error(`getCustomerProfile: ${error.message}`);
    return data;
  }

  async insertRiskSignals(
    signals: Array<Omit<RiskSignal, "id" | "created_at" | "detected_at">>
  ): Promise<RiskSignal[]> {
    if (signals.length === 0) return [];
    const { data, error } = await this.client.from("risk_signals").insert(signals).select("*");
    if (error) throw new Error(`insertRiskSignals: ${error.message}`);
    return data ?? [];
  }

  async getRiskSignalsForAlert(alertId: string): Promise<RiskSignal[]> {
    const { data, error } = await this.client.from("risk_signals").select("*").eq("alert_id", alertId);
    if (error) throw new Error(`getRiskSignalsForAlert: ${error.message}`);
    return data ?? [];
  }

  async insertMlPrediction(prediction: Omit<MlPrediction, "id" | "created_at">): Promise<MlPrediction> {
    const result = await this.client.from("ml_predictions").insert(prediction).select("*").single();
    return unwrap(result, "insertMlPrediction");
  }

  async getLatestMlPredictionForAlert(alertId: string): Promise<MlPrediction | null> {
    const { data, error } = await this.client
      .from("ml_predictions")
      .select("*")
      .eq("alert_id", alertId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`getLatestMlPredictionForAlert: ${error.message}`);
    return data;
  }

  async insertRecommendation(
    recommendation: Omit<AiRecommendation, "id" | "created_at">
  ): Promise<AiRecommendation> {
    const result = await this.client.from("ai_recommendations").insert(recommendation).select("*").single();
    return unwrap(result, "insertRecommendation");
  }

  async insertAnalystDecision(
    decision: Omit<AnalystDecision, "id" | "created_at" | "decided_at">
  ): Promise<AnalystDecision> {
    const result = await this.client.from("analyst_decisions").insert(decision).select("*").single();
    return unwrap(result, "insertAnalystDecision");
  }

  async getOrCreateCase(input: {
    organizationId: string;
    alertId: string;
    customerId: string;
    priority: Case["priority"];
  }): Promise<{ case: Case; created: boolean }> {
    const { data: existing, error: findError } = await this.client
      .from("cases")
      .select("*")
      .eq("alert_id", input.alertId)
      .maybeSingle();
    if (findError) throw new Error(`getOrCreateCase (lookup): ${findError.message}`);
    if (existing) return { case: existing, created: false };

    const result = await this.client
      .from("cases")
      .insert({
        organization_id: input.organizationId,
        alert_id: input.alertId,
        customer_id: input.customerId,
        priority: input.priority,
        status: "OPEN",
      })
      .select("*")
      .single();
    return { case: unwrap(result, "getOrCreateCase (insert)"), created: true };
  }

  async getCase(caseId: string): Promise<Case | null> {
    const { data, error } = await this.client.from("cases").select("*").eq("id", caseId).maybeSingle();
    if (error) throw new Error(`getCase: ${error.message}`);
    return data;
  }

  async getCaseByAlertId(alertId: string): Promise<Case | null> {
    const { data, error } = await this.client.from("cases").select("*").eq("alert_id", alertId).maybeSingle();
    if (error) throw new Error(`getCaseByAlertId: ${error.message}`);
    return data;
  }

  async listCases(organizationId: string, filter: CaseListFilter = {}): Promise<{ items: Case[]; total: number }> {
    let query = this.client
      .from("cases")
      .select("*", { count: "exact" })
      .eq("organization_id", organizationId);
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.priority) query = query.eq("priority", filter.priority);
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 50;
    query = query.order("opened_at", { ascending: false }).range(offset, offset + limit - 1);
    const { data, error, count } = await query;
    if (error) throw new Error(`listCases: ${error.message}`);
    return { items: data ?? [], total: count ?? 0 };
  }

  async updateCase(caseId: string, patch: Partial<Case>): Promise<Case> {
    const result = await this.client.from("cases").update(patch).eq("id", caseId).select("*").single();
    return unwrap(result, "updateCase");
  }

  async insertCaseEvent(event: Omit<CaseEvent, "id" | "created_at" | "occurred_at">): Promise<CaseEvent> {
    const result = await this.client.from("case_events").insert(event).select("*").single();
    return unwrap(result, "insertCaseEvent");
  }

  async getCaseEvents(caseId: string): Promise<CaseEvent[]> {
    const { data, error } = await this.client
      .from("case_events")
      .select("*")
      .eq("case_id", caseId)
      .order("occurred_at", { ascending: true });
    if (error) throw new Error(`getCaseEvents: ${error.message}`);
    return data ?? [];
  }

  async getAnalystDecisionsForAlert(alertId: string): Promise<AnalystDecision[]> {
    const { data, error } = await this.client
      .from("analyst_decisions")
      .select("*")
      .eq("alert_id", alertId)
      .order("decided_at", { ascending: true });
    if (error) throw new Error(`getAnalystDecisionsForAlert: ${error.message}`);
    return data ?? [];
  }

  async insertAuditLog(log: Omit<AuditLog, "id" | "created_at">): Promise<AuditLog> {
    const result = await this.client.from("audit_logs").insert(log).select("*").single();
    return unwrap(result, "insertAuditLog");
  }

  async listAuditLogs(organizationId: string, filter: AuditLogFilter = {}): Promise<AuditLog[]> {
    let query = this.client.from("audit_logs").select("*").eq("organization_id", organizationId);
    if (filter.entityType) query = query.eq("entity_type", filter.entityType);
    if (filter.correlationId) query = query.eq("correlation_id", filter.correlationId);
    if (filter.before) query = query.lt("created_at", filter.before);
    query = query.order("created_at", { ascending: false }).limit(filter.limit ?? 100);
    const { data, error } = await query;
    if (error) throw new Error(`listAuditLogs: ${error.message}`);
    return data ?? [];
  }

  async insertNotification(notification: Omit<Notification, "id" | "created_at">): Promise<Notification> {
    const result = await this.client.from("notifications").insert(notification).select("*").single();
    return unwrap(result, "insertNotification");
  }

  async findRecommendationByAlertId(alertId: string): Promise<AiRecommendation | null> {
    const { data, error } = await this.client
      .from("ai_recommendations")
      .select("*")
      .eq("alert_id", alertId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`findRecommendationByAlertId: ${error.message}`);
    return data;
  }
}
