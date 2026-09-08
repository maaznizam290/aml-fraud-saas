import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Alert,
  AlertStatus,
  AlertWithTransaction,
  HermesRule,
  HermesRuleStatus,
  Profile,
  RiskLevel,
  Transaction,
  TransactionFeatures,
  TransactionStatus,
} from "./types.js";

export const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001";

export interface CreateTransactionInput {
  id: string;
  orgId: string;
  amountPkr: number;
  senderId: string;
  recipientId: string;
  deviceFingerprint: string | null;
  status: TransactionStatus;
  mlScore: number;
  mlFeatures: TransactionFeatures;
}

export interface CreateAlertInput {
  orgId: string;
  transactionId: string;
  alertType: string;
  riskLevel: RiskLevel;
  hermesBrief: string | null;
}

export interface CreateHermesRuleInput {
  orgId: string;
  ruleName: string;
  conditions: HermesRule["conditions"];
  accuracyRating: number;
}

export interface Store {
  readonly mode: "supabase" | "memory";

  createTransaction(input: CreateTransactionInput): Promise<Transaction>;
  getTransaction(id: string): Promise<Transaction | null>;
  updateTransactionStatus(id: string, status: TransactionStatus): Promise<Transaction | null>;

  createAlert(input: CreateAlertInput): Promise<Alert>;
  getAlert(id: string): Promise<AlertWithTransaction | null>;
  listAlerts(orgId: string, status?: AlertStatus): Promise<AlertWithTransaction[]>;
  resolveAlert(
    id: string,
    status: Extract<AlertStatus, "RESOLVED_APPROVED" | "RESOLVED_BLOCKED">,
    analystId: string | null,
  ): Promise<AlertWithTransaction | null>;
  listRecentResolvedAlerts(orgId: string, limit: number): Promise<AlertWithTransaction[]>;

  getProfile(userId: string): Promise<Profile | null>;

  createHermesRule(input: CreateHermesRuleInput): Promise<HermesRule>;
  listHermesRules(orgId: string): Promise<HermesRule[]>;
  updateHermesRuleStatus(id: string, status: HermesRuleStatus): Promise<HermesRule | null>;
}

// ---------------------------------------------------------------------------
// In-memory fallback store
// ---------------------------------------------------------------------------

class InMemoryStore implements Store {
  readonly mode = "memory" as const;

  private transactions = new Map<string, Transaction>();
  private alerts = new Map<string, Alert>();
  private hermesRules = new Map<string, HermesRule>();
  private profiles = new Map<string, Profile>();

  constructor() {
    const now = new Date().toISOString();
    this.profiles.set("analyst-1", {
      id: "analyst-1",
      org_id: DEMO_ORG_ID,
      email: "analyst@example.com",
      role: "analyst",
      created_at: now,
    });
    this.profiles.set("cco-1", {
      id: "cco-1",
      org_id: DEMO_ORG_ID,
      email: "cco@example.com",
      role: "chief_compliance_officer",
      created_at: now,
    });
  }

  async createTransaction(input: CreateTransactionInput): Promise<Transaction> {
    const now = new Date().toISOString();
    const transaction: Transaction = {
      id: input.id,
      org_id: input.orgId,
      amount_pkr: input.amountPkr,
      sender_id: input.senderId,
      recipient_id: input.recipientId,
      device_fingerprint: input.deviceFingerprint,
      status: input.status,
      ml_score: input.mlScore,
      ml_features: input.mlFeatures,
      created_at: now,
      updated_at: now,
    };
    this.transactions.set(transaction.id, transaction);
    return transaction;
  }

  async getTransaction(id: string): Promise<Transaction | null> {
    return this.transactions.get(id) ?? null;
  }

  async updateTransactionStatus(id: string, status: TransactionStatus): Promise<Transaction | null> {
    const existing = this.transactions.get(id);
    if (!existing) return null;
    const updated: Transaction = { ...existing, status, updated_at: new Date().toISOString() };
    this.transactions.set(id, updated);
    return updated;
  }

  async createAlert(input: CreateAlertInput): Promise<Alert> {
    const now = new Date().toISOString();
    const alert: Alert = {
      id: randomUUID(),
      org_id: input.orgId,
      transaction_id: input.transactionId,
      alert_type: input.alertType,
      risk_level: input.riskLevel,
      hermes_brief: input.hermesBrief,
      status: "OPEN",
      assigned_analyst: null,
      created_at: now,
      updated_at: now,
    };
    this.alerts.set(alert.id, alert);
    return alert;
  }

  private hydrate(alert: Alert): AlertWithTransaction | null {
    const transaction = this.transactions.get(alert.transaction_id);
    if (!transaction) return null;
    return { ...alert, transaction };
  }

  async getAlert(id: string): Promise<AlertWithTransaction | null> {
    const alert = this.alerts.get(id);
    if (!alert) return null;
    return this.hydrate(alert);
  }

  async listAlerts(orgId: string, status?: AlertStatus): Promise<AlertWithTransaction[]> {
    const results: AlertWithTransaction[] = [];
    for (const alert of this.alerts.values()) {
      if (alert.org_id !== orgId) continue;
      if (status && alert.status !== status) continue;
      const hydrated = this.hydrate(alert);
      if (hydrated) results.push(hydrated);
    }
    return results.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async resolveAlert(
    id: string,
    status: Extract<AlertStatus, "RESOLVED_APPROVED" | "RESOLVED_BLOCKED">,
    analystId: string | null,
  ): Promise<AlertWithTransaction | null> {
    const existing = this.alerts.get(id);
    if (!existing) return null;
    const updated: Alert = {
      ...existing,
      status,
      assigned_analyst: analystId,
      updated_at: new Date().toISOString(),
    };
    this.alerts.set(id, updated);

    const transactionStatus: TransactionStatus =
      status === "RESOLVED_APPROVED" ? "APPROVED" : "BLOCKED";
    await this.updateTransactionStatus(existing.transaction_id, transactionStatus);

    return this.hydrate(updated);
  }

  async listRecentResolvedAlerts(orgId: string, limit: number): Promise<AlertWithTransaction[]> {
    const resolved = (await this.listAlerts(orgId)).filter((a) => a.status !== "OPEN");
    return resolved.slice(0, limit);
  }

  async getProfile(userId: string): Promise<Profile | null> {
    return this.profiles.get(userId) ?? null;
  }

  async createHermesRule(input: CreateHermesRuleInput): Promise<HermesRule> {
    const now = new Date().toISOString();
    const rule: HermesRule = {
      id: `rule-${randomUUID()}`,
      org_id: input.orgId,
      rule_name: input.ruleName,
      conditions: input.conditions,
      status: "PENDING",
      accuracy_rating: input.accuracyRating,
      created_at: now,
      updated_at: now,
    };
    this.hermesRules.set(rule.id, rule);
    return rule;
  }

  async listHermesRules(orgId: string): Promise<HermesRule[]> {
    return [...this.hermesRules.values()]
      .filter((rule) => rule.org_id === orgId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async updateHermesRuleStatus(id: string, status: HermesRuleStatus): Promise<HermesRule | null> {
    const existing = this.hermesRules.get(id);
    if (!existing) return null;
    const updated: HermesRule = { ...existing, status, updated_at: new Date().toISOString() };
    this.hermesRules.set(id, updated);
    return updated;
  }
}

// ---------------------------------------------------------------------------
// Supabase-backed store
// ---------------------------------------------------------------------------

class SupabaseStore implements Store {
  readonly mode = "supabase" as const;

  constructor(private readonly client: SupabaseClient) {}

  async createTransaction(input: CreateTransactionInput): Promise<Transaction> {
    const { data, error } = await this.client
      .from("transactions")
      .insert({
        id: input.id,
        org_id: input.orgId,
        amount_pkr: input.amountPkr,
        sender_id: input.senderId,
        recipient_id: input.recipientId,
        device_fingerprint: input.deviceFingerprint,
        status: input.status,
        ml_score: input.mlScore,
        ml_features: input.mlFeatures,
      })
      .select()
      .single();
    if (error) throw error;
    return data as Transaction;
  }

  async getTransaction(id: string): Promise<Transaction | null> {
    const { data, error } = await this.client.from("transactions").select().eq("id", id).maybeSingle();
    if (error) throw error;
    return (data as Transaction) ?? null;
  }

  async updateTransactionStatus(id: string, status: TransactionStatus): Promise<Transaction | null> {
    const { data, error } = await this.client
      .from("transactions")
      .update({ status })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return (data as Transaction) ?? null;
  }

  async createAlert(input: CreateAlertInput): Promise<Alert> {
    const { data, error } = await this.client
      .from("alerts")
      .insert({
        org_id: input.orgId,
        transaction_id: input.transactionId,
        alert_type: input.alertType,
        risk_level: input.riskLevel,
        hermes_brief: input.hermesBrief,
        status: "OPEN",
      })
      .select()
      .single();
    if (error) throw error;
    return data as Alert;
  }

  private readonly alertSelect = "*, transaction:transactions(*)";

  async getAlert(id: string): Promise<AlertWithTransaction | null> {
    const { data, error } = await this.client
      .from("alerts")
      .select(this.alertSelect)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data as unknown as AlertWithTransaction) ?? null;
  }

  async listAlerts(orgId: string, status?: AlertStatus): Promise<AlertWithTransaction[]> {
    let query = this.client.from("alerts").select(this.alertSelect).eq("org_id", orgId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;
    return (data as unknown as AlertWithTransaction[]) ?? [];
  }

  async resolveAlert(
    id: string,
    status: Extract<AlertStatus, "RESOLVED_APPROVED" | "RESOLVED_BLOCKED">,
    analystId: string | null,
  ): Promise<AlertWithTransaction | null> {
    const { data, error } = await this.client
      .from("alerts")
      .update({ status, assigned_analyst: analystId })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const transactionStatus: TransactionStatus =
      status === "RESOLVED_APPROVED" ? "APPROVED" : "BLOCKED";
    await this.updateTransactionStatus((data as Alert).transaction_id, transactionStatus);

    return this.getAlert(id);
  }

  async listRecentResolvedAlerts(orgId: string, limit: number): Promise<AlertWithTransaction[]> {
    const { data, error } = await this.client
      .from("alerts")
      .select(this.alertSelect)
      .eq("org_id", orgId)
      .neq("status", "OPEN")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as unknown as AlertWithTransaction[]) ?? [];
  }

  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await this.client.from("profiles").select().eq("id", userId).maybeSingle();
    if (error) throw error;
    return (data as Profile) ?? null;
  }

  async createHermesRule(input: CreateHermesRuleInput): Promise<HermesRule> {
    const { data, error } = await this.client
      .from("hermes_rules")
      .insert({
        id: `rule-${randomUUID()}`,
        org_id: input.orgId,
        rule_name: input.ruleName,
        conditions: input.conditions,
        status: "PENDING",
        accuracy_rating: input.accuracyRating,
      })
      .select()
      .single();
    if (error) throw error;
    return data as HermesRule;
  }

  async listHermesRules(orgId: string): Promise<HermesRule[]> {
    const { data, error } = await this.client
      .from("hermes_rules")
      .select()
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as HermesRule[]) ?? [];
  }

  async updateHermesRuleStatus(id: string, status: HermesRuleStatus): Promise<HermesRule | null> {
    const { data, error } = await this.client
      .from("hermes_rules")
      .update({ status })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return (data as HermesRule) ?? null;
  }
}

// ---------------------------------------------------------------------------
// Store selection
// ---------------------------------------------------------------------------

let store: Store | null = null;

/**
 * Resolves the active data store. If SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are both set, connects to Supabase with the
 * service-role key (writes bypass RLS; see supabase/migrations/01_init_schema.sql
 * for why). Otherwise falls back to an in-memory store so the whole platform
 * still runs end-to-end for local development and demos without any remote
 * secrets configured.
 */
export function getStore(): Store {
  if (store) return store;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && serviceRoleKey) {
    const client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    store = new SupabaseStore(client);
    console.log("[db] Connected to Supabase store");
  } else {
    store = new InMemoryStore();
    console.warn(
      "[db] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — using in-memory fallback store. " +
        "Data will not persist across restarts.",
    );
  }

  return store;
}

/** Test-only: force a fresh store instance. */
export function resetStoreForTests(): void {
  store = null;
}
