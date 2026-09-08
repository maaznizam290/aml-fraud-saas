export type TransactionStatus = "APPROVED" | "BLOCKED" | "PENDING_REVIEW";
export type AlertStatus = "OPEN" | "RESOLVED_APPROVED" | "RESOLVED_BLOCKED";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type HermesRuleStatus = "PENDING" | "DEPLOYED" | "ARCHIVED";
export type ProfileRole = "analyst" | "chief_compliance_officer";

export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export interface Profile {
  id: string;
  org_id: string;
  email: string;
  role: ProfileRole;
  created_at: string;
}

export interface Transaction {
  id: string;
  org_id: string;
  amount_pkr: number;
  sender_id: string;
  recipient_id: string;
  device_fingerprint: string | null;
  status: TransactionStatus;
  ml_score: number | null;
  ml_features: TransactionFeatures | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionFeatures {
  velocity_last_24h: number;
  account_age_days: number;
  device_risk_score: number;
}

export interface Alert {
  id: string;
  org_id: string;
  transaction_id: string;
  alert_type: string;
  risk_level: RiskLevel;
  hermes_brief: string | null;
  status: AlertStatus;
  assigned_analyst: string | null;
  created_at: string;
  updated_at: string;
}

export interface HermesRule {
  id: string;
  org_id: string;
  rule_name: string;
  conditions: RuleCondition;
  status: HermesRuleStatus;
  accuracy_rating: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Small declarative rule DSL used by Hermes-synthesized heuristics and the
 * backtest engine. A leaf compares one transaction field against a value;
 * "all"/"any" groups combine leaves (and nested groups) with AND/OR.
 */
export type RuleCondition =
  | { field: string; op: "gt" | "gte" | "lt" | "lte" | "eq"; value: number }
  | { all: RuleCondition[] }
  | { any: RuleCondition[] };

export interface AlertWithTransaction extends Alert {
  transaction: Transaction;
}
