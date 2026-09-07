/**
 * In-memory OrchestrationStore. Used by DEMO mode (see config.ts) and by
 * the test suite — no live Supabase connection required. Data does not
 * survive a process restart, which is the correct behavior for a demo: each
 * run starts from the same deterministic seed (see `createDemoStore`).
 */
import { randomUUID } from "node:crypto";

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
} from "../../supabase/types.js";
import type { AlertListFilter, AlertListItem, AuditLogFilter, CaseListFilter, OrchestrationStore } from "../store.js";
import { DEMO_ORGANIZATION_ID as DEMO_ORG_ID } from "../../shared/constants.js";

export class InMemoryOrchestrationStore implements OrchestrationStore {
  private alerts = new Map<string, Alert>();
  private transactions = new Map<string, Transaction>();
  private customers = new Map<string, Customer>();
  private customerProfiles = new Map<string, CustomerProfile>();
  private riskSignals: RiskSignal[] = [];
  private mlPredictions: MlPrediction[] = [];
  private recommendations: AiRecommendation[] = [];
  private analystDecisions: AnalystDecision[] = [];
  private cases = new Map<string, Case>();
  private casesByAlertId = new Map<string, string>();
  private caseEvents: CaseEvent[] = [];
  private auditLogs: AuditLog[] = [];
  private notifications: Notification[] = [];

  // --- seeding (test/demo use only) ---
  seedAlert(alert: Alert): void {
    this.alerts.set(alert.id, alert);
  }
  seedTransaction(transaction: Transaction): void {
    this.transactions.set(transaction.id, transaction);
  }
  seedCustomer(customer: Customer): void {
    this.customers.set(customer.id, customer);
  }
  seedCustomerProfile(profile: CustomerProfile): void {
    this.customerProfiles.set(profile.customer_id, profile);
  }

  async getAlert(alertId: string): Promise<Alert | null> {
    return this.alerts.get(alertId) ?? null;
  }

  async updateAlertStatus(alertId: string, status: InvestigationState, patch: Partial<Alert> = {}): Promise<Alert> {
    const existing = this.alerts.get(alertId);
    if (!existing) throw new Error(`Alert ${alertId} not found`);
    const updated: Alert = { ...existing, ...patch, status, updated_at: new Date().toISOString() };
    this.alerts.set(alertId, updated);
    return updated;
  }

  async listAlerts(
    organizationId: string,
    filter: AlertListFilter = {}
  ): Promise<{ items: AlertListItem[]; total: number }> {
    let results = [...this.alerts.values()].filter((a) => a.organization_id === organizationId);
    if (filter.status) results = results.filter((a) => a.status === filter.status);
    if (filter.severity) results = results.filter((a) => a.severity === filter.severity);
    if (filter.minRiskScore !== undefined) {
      const min = filter.minRiskScore;
      results = results.filter((a) => (a.risk_score ?? 0) >= min);
    }
    if (filter.search) {
      const needle = filter.search.toLowerCase();
      results = results.filter(
        (a) => a.id.toLowerCase().includes(needle) || a.customer_id.toLowerCase().includes(needle)
      );
    }
    results = results.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const total = results.length;
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 50;
    const items: AlertListItem[] = results.slice(offset, offset + limit).map((a) => ({
      ...a,
      transactionAmount: a.transaction_id ? this.transactions.get(a.transaction_id)?.amount ?? null : null,
    }));
    return { items, total };
  }

  async getTransaction(transactionId: string): Promise<Transaction | null> {
    return this.transactions.get(transactionId) ?? null;
  }

  async getRecentTransactions(customerId: string, beforeIso: string, limit: number): Promise<Transaction[]> {
    return [...this.transactions.values()]
      .filter((t) => t.customer_id === customerId && t.transaction_at < beforeIso)
      .sort((a, b) => b.transaction_at.localeCompare(a.transaction_at))
      .slice(0, limit);
  }

  async getCustomer(customerId: string): Promise<Customer | null> {
    return this.customers.get(customerId) ?? null;
  }

  async getCustomerProfile(customerId: string): Promise<CustomerProfile | null> {
    return this.customerProfiles.get(customerId) ?? null;
  }

  async insertRiskSignals(
    signals: Array<Omit<RiskSignal, "id" | "created_at" | "detected_at">>
  ): Promise<RiskSignal[]> {
    const now = new Date().toISOString();
    const inserted = signals.map((s) => ({ ...s, id: randomUUID(), detected_at: now, created_at: now }));
    this.riskSignals.push(...inserted);
    return inserted;
  }

  async insertMlPrediction(prediction: Omit<MlPrediction, "id" | "created_at">): Promise<MlPrediction> {
    const inserted: MlPrediction = { ...prediction, id: randomUUID(), created_at: new Date().toISOString() };
    this.mlPredictions.push(inserted);
    return inserted;
  }

  async insertRecommendation(
    recommendation: Omit<AiRecommendation, "id" | "created_at">
  ): Promise<AiRecommendation> {
    const inserted: AiRecommendation = { ...recommendation, id: randomUUID(), created_at: new Date().toISOString() };
    this.recommendations.push(inserted);
    return inserted;
  }

  async insertAnalystDecision(
    decision: Omit<AnalystDecision, "id" | "created_at" | "decided_at">
  ): Promise<AnalystDecision> {
    const now = new Date().toISOString();
    const inserted: AnalystDecision = { ...decision, id: randomUUID(), decided_at: now, created_at: now };
    this.analystDecisions.push(inserted);
    return inserted;
  }

  async getOrCreateCase(input: {
    organizationId: string;
    alertId: string;
    customerId: string;
    priority: Case["priority"];
  }): Promise<{ case: Case; created: boolean }> {
    const existingId = this.casesByAlertId.get(input.alertId);
    if (existingId) {
      const existing = this.cases.get(existingId);
      if (existing) return { case: existing, created: false };
    }
    const now = new Date().toISOString();
    const id = randomUUID();
    const newCase: Case = {
      id,
      organization_id: input.organizationId,
      case_number: `CASE-${String(this.cases.size + 1).padStart(6, "0")}`,
      alert_id: input.alertId,
      related_alert_ids: [],
      customer_id: input.customerId,
      assigned_analyst_id: null,
      status: "OPEN",
      priority: input.priority,
      disposition: null,
      resolution_reason: null,
      opened_at: now,
      resolved_at: null,
      created_at: now,
      updated_at: now,
    };
    this.cases.set(id, newCase);
    this.casesByAlertId.set(input.alertId, id);
    return { case: newCase, created: true };
  }

  async getCase(caseId: string): Promise<Case | null> {
    return this.cases.get(caseId) ?? null;
  }

  async getCaseByAlertId(alertId: string): Promise<Case | null> {
    const id = this.casesByAlertId.get(alertId);
    return id ? this.cases.get(id) ?? null : null;
  }

  async listCases(organizationId: string, filter: CaseListFilter = {}): Promise<{ items: Case[]; total: number }> {
    let results = [...this.cases.values()].filter((c) => c.organization_id === organizationId);
    if (filter.status) results = results.filter((c) => c.status === filter.status);
    if (filter.priority) results = results.filter((c) => c.priority === filter.priority);
    results = results.sort((a, b) => b.opened_at.localeCompare(a.opened_at));
    const total = results.length;
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 50;
    return { items: results.slice(offset, offset + limit), total };
  }

  async updateCase(caseId: string, patch: Partial<Case>): Promise<Case> {
    const existing = this.cases.get(caseId);
    if (!existing) throw new Error(`Case ${caseId} not found`);
    const updated: Case = { ...existing, ...patch, updated_at: new Date().toISOString() };
    this.cases.set(caseId, updated);
    return updated;
  }

  async insertCaseEvent(event: Omit<CaseEvent, "id" | "created_at" | "occurred_at">): Promise<CaseEvent> {
    const now = new Date().toISOString();
    const inserted: CaseEvent = { ...event, id: randomUUID(), occurred_at: now, created_at: now };
    this.caseEvents.push(inserted);
    return inserted;
  }

  async getCaseEvents(caseId: string): Promise<CaseEvent[]> {
    return this.caseEvents
      .filter((e) => e.case_id === caseId)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  }

  async getAnalystDecisionsForAlert(alertId: string): Promise<AnalystDecision[]> {
    return this.analystDecisions
      .filter((d) => d.alert_id === alertId)
      .sort((a, b) => a.decided_at.localeCompare(b.decided_at));
  }

  async getRiskSignalsForAlert(alertId: string): Promise<RiskSignal[]> {
    return this.riskSignals.filter((s) => s.alert_id === alertId);
  }

  async getLatestMlPredictionForAlert(alertId: string): Promise<MlPrediction | null> {
    const matches = this.mlPredictions.filter((p) => p.alert_id === alertId);
    if (matches.length === 0) return null;
    return matches.reduce((latest, p) => (p.created_at > latest.created_at ? p : latest));
  }

  async insertAuditLog(log: Omit<AuditLog, "id" | "created_at">): Promise<AuditLog> {
    const inserted: AuditLog = { ...log, id: randomUUID(), created_at: new Date().toISOString() };
    this.auditLogs.push(inserted);
    return inserted;
  }

  async listAuditLogs(organizationId: string, filter: AuditLogFilter = {}): Promise<AuditLog[]> {
    let results = this.auditLogs.filter((l) => l.organization_id === organizationId);
    if (filter.entityType) results = results.filter((l) => l.entity_type === filter.entityType);
    if (filter.correlationId) results = results.filter((l) => l.correlation_id === filter.correlationId);
    if (filter.before) {
      const before = filter.before;
      results = results.filter((l) => l.created_at < before);
    }
    results = results.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return results.slice(0, filter.limit ?? 100);
  }

  async insertNotification(notification: Omit<Notification, "id" | "created_at">): Promise<Notification> {
    const inserted: Notification = { ...notification, id: randomUUID(), created_at: new Date().toISOString() };
    this.notifications.push(inserted);
    return inserted;
  }

  async findRecommendationByAlertId(alertId: string): Promise<AiRecommendation | null> {
    const matches = this.recommendations.filter((r) => r.alert_id === alertId);
    if (matches.length === 0) return null;
    return matches.reduce((latest, r) => (r.created_at > latest.created_at ? r : latest));
  }

  // --- test/debug introspection (not part of OrchestrationStore) ---
  getAuditLogs(): AuditLog[] {
    return [...this.auditLogs];
  }
  getNotifications(): Notification[] {
    return [...this.notifications];
  }
  getAnalystDecisions(): AnalystDecision[] {
    return [...this.analystDecisions];
  }
}

/**
 * A deterministic, self-contained demo scenario: one customer with a
 * velocity-anomaly-style alert and eight prior transactions, so the
 * end-to-end investigation flow (evidence -> ML -> Claude -> recommendation
 * -> human review -> case) can be exercised with zero external
 * dependencies. Mirrors the spirit of the "high transaction velocity"
 * scenario in supabase/seed.sql without depending on it.
 */
export function createDemoStore(): InMemoryOrchestrationStore {
  const store = new InMemoryOrchestrationStore();
  const customerId = "demo-customer-0001";
  const alertId = "demo-alert-0001";
  const now = new Date();

  store.seedCustomer({
    id: customerId,
    organization_id: DEMO_ORG_ID,
    external_customer_id: "CUST-DEMO-0001",
    full_name: "Elena Volkov (Demo)",
    email: "elena.demo@example.test",
    phone: null,
    date_of_birth: null,
    country_code: "US",
    status: "ACTIVE",
    risk_rating: "MEDIUM",
    kyc_status: "VERIFIED",
    account_opened_at: new Date(now.getTime() - 400 * 86400_000).toISOString(),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });

  store.seedCustomerProfile({
    id: randomUUID(),
    organization_id: DEMO_ORG_ID,
    customer_id: customerId,
    occupation: "Freelance Consultant",
    employer: null,
    expected_monthly_volume: 6000,
    average_transaction_amount: 350,
    typical_countries: ["US"],
    typical_beneficiaries: [],
    behavioral_baseline: {},
    sanctions_status: "CLEAR",
    sanctions_checked_at: now.toISOString(),
    pep_status: false,
    notes: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });

  const transactionIds: string[] = [];
  for (let i = 8; i >= 1; i--) {
    const id = `demo-txn-000${i}`;
    transactionIds.push(id);
    store.seedTransaction({
      id,
      organization_id: DEMO_ORG_ID,
      customer_id: customerId,
      external_transaction_id: null,
      direction: "OUTBOUND",
      amount: 900 + i * 137,
      currency: "USD",
      channel: "MOBILE",
      status: "COMPLETED",
      counterparty_name: null,
      counterparty_account: `acct-demo-${i}`,
      counterparty_country: "US",
      origin_country: "US",
      destination_country: "US",
      device_id: "device-demo-a1",
      device_is_new: false,
      ip_address: null,
      transaction_at: new Date(now.getTime() - i * 15 * 60_000).toISOString(),
      created_at: now.toISOString(),
    });
  }

  const primaryTransactionId = transactionIds[transactionIds.length - 1] ?? null;

  store.seedAlert({
    id: alertId,
    organization_id: DEMO_ORG_ID,
    customer_id: customerId,
    transaction_id: primaryTransactionId,
    related_transaction_ids: transactionIds,
    alert_type: "VELOCITY_ANOMALY",
    severity: "HIGH",
    status: "RECEIVED",
    source: "RULE_ENGINE",
    triggered_rules: ["RULE_VELOCITY_8_IN_2H"],
    risk_score: 0.81,
    ml_score: null,
    assigned_analyst_id: null,
    opened_at: now.toISOString(),
    resolved_at: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });

  return store;
}

export const DEMO_ALERT_ID = "demo-alert-0001";
export const DEMO_ORGANIZATION_ID = DEMO_ORG_ID;
