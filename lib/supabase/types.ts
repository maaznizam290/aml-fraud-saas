/**
 * Hand-authored mirror of the schema in supabase/migrations. Shaped like the
 * output of `supabase gen types typescript` (Database.public.Tables.<name>.Row
 * / Insert / Update) so it's a drop-in replacement once a maintainer runs
 * that command against a real linked project — see docs/DATABASE.md.
 *
 * TypeScript can't express what the database actually enforces (RLS, CHECK
 * constraints, immutability triggers on audit_logs/transactions/etc.) — the
 * `Update` types here are a superset of what any given role/table can
 * actually mutate at runtime.
 */

export type UserRole = "ADMIN" | "COMPLIANCE_MANAGER" | "ANALYST" | "VIEWER";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type KycStatus = "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";
export type SanctionsStatus = "CLEAR" | "POTENTIAL_MATCH" | "CONFIRMED_MATCH" | "PENDING_REVIEW";
export type CustomerStatus = "ACTIVE" | "DORMANT" | "SUSPENDED" | "CLOSED";
export type TransactionDirection = "INBOUND" | "OUTBOUND";
export type TransactionStatus = "PENDING" | "COMPLETED" | "FLAGGED" | "REVERSED" | "FAILED";
export type AlertType =
  | "AMOUNT_ANOMALY"
  | "VELOCITY_ANOMALY"
  | "NEW_BENEFICIARY"
  | "NEW_DEVICE"
  | "LOCATION_ANOMALY"
  | "COUNTRY_RISK"
  | "STRUCTURING"
  | "SANCTIONS_HIT"
  | "KYC_ISSUE"
  | "BEHAVIORAL_ANOMALY"
  | "OTHER";
export type AlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type InvestigationState =
  | "RECEIVED"
  | "ANALYZING"
  | "EVIDENCE_COLLECTED"
  | "AI_INVESTIGATING"
  | "RECOMMENDATION_READY"
  | "HUMAN_REVIEW"
  | "RESOLVED";
export type AlertSource = "RULE_ENGINE" | "ML_MODEL" | "SANCTIONS_SCREENING" | "MANUAL" | "EXTERNAL_SYSTEM";
export type RiskSignalType =
  | "AMOUNT_ANOMALY"
  | "VELOCITY_ANOMALY"
  | "NEW_BENEFICIARY"
  | "NEW_DEVICE"
  | "LOCATION_ANOMALY"
  | "COUNTRY_RISK"
  | "CUSTOMER_RISK"
  | "KYC_STATUS"
  | "SANCTIONS_RESULT"
  | "HISTORICAL_BEHAVIOR"
  | "ACCOUNT_AGE"
  | "TRANSACTION_FREQUENCY"
  | "STRUCTURING_INDICATOR";
export type RecommendationDisposition = "ESCALATE" | "CLEAR" | "REFER";
export type CaseStatus = "OPEN" | "IN_PROGRESS" | "PENDING_REVIEW" | "RESOLVED" | "CLOSED" | "REOPENED";
export type CasePriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type CaseDisposition =
  | "CONFIRMED_FRAUD"
  | "FALSE_POSITIVE"
  | "ESCALATED_EXTERNALLY"
  | "CLEARED"
  | "INSUFFICIENT_EVIDENCE"
  | "OTHER";
export type MemoryCategory = "EPISODIC" | "SEMANTIC" | "PROCEDURAL" | "INVESTIGATION" | "INSTITUTIONAL";
export type SkillStatus = "DRAFT" | "ACTIVE" | "DEPRECATED";
export type FeedbackType = "CONFIRM" | "OVERRULE" | "CORRECTION" | "COMMENT" | "RATING";
export type GovernanceStatus = "PROPOSED" | "REVIEW" | "APPROVED" | "VERSIONED" | "DEPLOYED";
export type NotificationType =
  | "ALERT_ASSIGNED"
  | "CASE_ASSIGNED"
  | "RECOMMENDATION_READY"
  | "CASE_RESOLVED"
  | "MENTION"
  | "SYSTEM";

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

interface TableDef<R, I, U> {
  Row: R;
  Insert: I;
  Update: U;
}

// --- organizations ---------------------------------------------------------
interface OrganizationsRow {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
interface OrganizationsInsert {
  id?: string;
  name: string;
  slug: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}
type OrganizationsUpdate = Partial<OrganizationsInsert>;

// --- organization_settings ---------------------------------------------------------
interface OrganizationSettingsRow {
  id: string;
  organization_id: string;
  risk_thresholds: Json;
  notification_preferences: Json;
  settings: Json;
  created_at: string;
  updated_at: string;
}
interface OrganizationSettingsInsert {
  id?: string;
  organization_id: string;
  risk_thresholds?: Json;
  notification_preferences?: Json;
  settings?: Json;
  created_at?: string;
  updated_at?: string;
}
type OrganizationSettingsUpdate = Partial<OrganizationSettingsInsert>;

// --- profiles ---------------------------------------------------------
interface ProfilesRow {
  id: string;
  organization_id: string | null;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
interface ProfilesInsert {
  id: string;
  organization_id?: string | null;
  email: string;
  full_name?: string | null;
  role?: UserRole;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}
type ProfilesUpdate = Partial<Omit<ProfilesInsert, "id">>;

// --- customers ---------------------------------------------------------
interface CustomersRow {
  id: string;
  organization_id: string;
  external_customer_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  country_code: string | null;
  status: CustomerStatus;
  risk_rating: RiskLevel;
  kyc_status: KycStatus;
  account_opened_at: string;
  created_at: string;
  updated_at: string;
}
interface CustomersInsert {
  id?: string;
  organization_id: string;
  external_customer_id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  country_code?: string | null;
  status?: CustomerStatus;
  risk_rating?: RiskLevel;
  kyc_status?: KycStatus;
  account_opened_at?: string;
  created_at?: string;
  updated_at?: string;
}
type CustomersUpdate = Partial<CustomersInsert>;

// --- customer_profiles ---------------------------------------------------------
interface CustomerProfilesRow {
  id: string;
  organization_id: string;
  customer_id: string;
  occupation: string | null;
  employer: string | null;
  expected_monthly_volume: number | null;
  average_transaction_amount: number | null;
  typical_countries: string[];
  typical_beneficiaries: Json;
  behavioral_baseline: Json;
  sanctions_status: SanctionsStatus;
  sanctions_checked_at: string | null;
  pep_status: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
interface CustomerProfilesInsert {
  id?: string;
  organization_id: string;
  customer_id: string;
  occupation?: string | null;
  employer?: string | null;
  expected_monthly_volume?: number | null;
  average_transaction_amount?: number | null;
  typical_countries?: string[];
  typical_beneficiaries?: Json;
  behavioral_baseline?: Json;
  sanctions_status?: SanctionsStatus;
  sanctions_checked_at?: string | null;
  pep_status?: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}
type CustomerProfilesUpdate = Partial<CustomerProfilesInsert>;

// --- transactions ---------------------------------------------------------
interface TransactionsRow {
  id: string;
  organization_id: string;
  customer_id: string;
  external_transaction_id: string | null;
  direction: TransactionDirection;
  amount: number;
  currency: string;
  channel: string;
  status: TransactionStatus;
  counterparty_name: string | null;
  counterparty_account: string | null;
  counterparty_country: string | null;
  origin_country: string | null;
  destination_country: string | null;
  device_id: string | null;
  device_is_new: boolean;
  ip_address: string | null;
  transaction_at: string;
  created_at: string;
}
interface TransactionsInsert {
  id?: string;
  organization_id: string;
  customer_id: string;
  external_transaction_id?: string | null;
  direction: TransactionDirection;
  amount: number;
  currency?: string;
  channel: string;
  status?: TransactionStatus;
  counterparty_name?: string | null;
  counterparty_account?: string | null;
  counterparty_country?: string | null;
  origin_country?: string | null;
  destination_country?: string | null;
  device_id?: string | null;
  device_is_new?: boolean;
  ip_address?: string | null;
  transaction_at?: string;
  created_at?: string;
}
type TransactionsUpdate = Partial<TransactionsInsert>;

// --- alerts ---------------------------------------------------------
interface AlertsRow {
  id: string;
  organization_id: string;
  customer_id: string;
  transaction_id: string | null;
  related_transaction_ids: string[];
  alert_type: AlertType;
  severity: AlertSeverity;
  status: InvestigationState;
  source: AlertSource;
  triggered_rules: Json;
  risk_score: number | null;
  ml_score: number | null;
  assigned_analyst_id: string | null;
  opened_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}
interface AlertsInsert {
  id?: string;
  organization_id: string;
  customer_id: string;
  transaction_id?: string | null;
  related_transaction_ids?: string[];
  alert_type: AlertType;
  severity?: AlertSeverity;
  status?: InvestigationState;
  source?: AlertSource;
  triggered_rules?: Json;
  risk_score?: number | null;
  ml_score?: number | null;
  assigned_analyst_id?: string | null;
  opened_at?: string;
  resolved_at?: string | null;
  created_at?: string;
  updated_at?: string;
}
type AlertsUpdate = Partial<AlertsInsert>;

// --- risk_signals ---------------------------------------------------------
interface RiskSignalsRow {
  id: string;
  organization_id: string;
  customer_id: string;
  transaction_id: string | null;
  alert_id: string | null;
  signal_type: RiskSignalType;
  weight: number | null;
  value: Json;
  description: string | null;
  detected_at: string;
  created_at: string;
}
interface RiskSignalsInsert {
  id?: string;
  organization_id: string;
  customer_id: string;
  transaction_id?: string | null;
  alert_id?: string | null;
  signal_type: RiskSignalType;
  weight?: number | null;
  value?: Json;
  description?: string | null;
  detected_at?: string;
  created_at?: string;
}
type RiskSignalsUpdate = Partial<RiskSignalsInsert>;

// --- ml_predictions ---------------------------------------------------------
interface MlPredictionsRow {
  id: string;
  organization_id: string;
  customer_id: string;
  transaction_id: string | null;
  alert_id: string | null;
  model_version_id: string | null;
  provider: string;
  model_name: string;
  prediction: string;
  score: number;
  confidence: number | null;
  features: Json;
  metadata: Json;
  created_at: string;
}
interface MlPredictionsInsert {
  id?: string;
  organization_id: string;
  customer_id: string;
  transaction_id?: string | null;
  alert_id?: string | null;
  model_version_id?: string | null;
  provider: string;
  model_name: string;
  prediction: string;
  score: number;
  confidence?: number | null;
  features?: Json;
  metadata?: Json;
  created_at?: string;
}
type MlPredictionsUpdate = Partial<MlPredictionsInsert>;

// --- ai_recommendations ---------------------------------------------------------
interface AiRecommendationsRow {
  id: string;
  organization_id: string;
  alert_id: string;
  disposition: RecommendationDisposition;
  confidence: number | null;
  risk_level: RiskLevel;
  rationale: string;
  red_flags: Json;
  supporting_evidence: Json;
  contradictory_evidence: Json;
  recommended_next_steps: Json;
  ml_score_assessment: string | null;
  investigation_summary: string | null;
  provider: string;
  model_name: string;
  prompt_version: string | null;
  metadata: Json;
  created_at: string;
}
interface AiRecommendationsInsert {
  id?: string;
  organization_id: string;
  alert_id: string;
  disposition: RecommendationDisposition;
  confidence?: number | null;
  risk_level: RiskLevel;
  rationale: string;
  red_flags?: Json;
  supporting_evidence?: Json;
  contradictory_evidence?: Json;
  recommended_next_steps?: Json;
  ml_score_assessment?: string | null;
  investigation_summary?: string | null;
  provider: string;
  model_name: string;
  prompt_version?: string | null;
  metadata?: Json;
  created_at?: string;
}
type AiRecommendationsUpdate = Partial<AiRecommendationsInsert>;

// --- analyst_decisions ---------------------------------------------------------
interface AnalystDecisionsRow {
  id: string;
  organization_id: string;
  alert_id: string;
  ai_recommendation_id: string | null;
  analyst_id: string;
  decision: RecommendationDisposition;
  agreed_with_ai: boolean | null;
  override_reason: string | null;
  notes: string | null;
  decided_at: string;
  created_at: string;
}
interface AnalystDecisionsInsert {
  id?: string;
  organization_id: string;
  alert_id: string;
  ai_recommendation_id?: string | null;
  analyst_id: string;
  decision: RecommendationDisposition;
  agreed_with_ai?: boolean | null;
  override_reason?: string | null;
  notes?: string | null;
  decided_at?: string;
  created_at?: string;
}
type AnalystDecisionsUpdate = Partial<AnalystDecisionsInsert>;

// --- cases ---------------------------------------------------------
interface CasesRow {
  id: string;
  organization_id: string;
  case_number: string;
  alert_id: string | null;
  related_alert_ids: string[];
  customer_id: string;
  assigned_analyst_id: string | null;
  status: CaseStatus;
  priority: CasePriority;
  disposition: CaseDisposition | null;
  resolution_reason: string | null;
  opened_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}
interface CasesInsert {
  id?: string;
  organization_id: string;
  case_number?: string;
  alert_id?: string | null;
  related_alert_ids?: string[];
  customer_id: string;
  assigned_analyst_id?: string | null;
  status?: CaseStatus;
  priority?: CasePriority;
  disposition?: CaseDisposition | null;
  resolution_reason?: string | null;
  opened_at?: string;
  resolved_at?: string | null;
  created_at?: string;
  updated_at?: string;
}
type CasesUpdate = Partial<CasesInsert>;

// --- case_events ---------------------------------------------------------
interface CaseEventsRow {
  id: string;
  organization_id: string;
  case_id: string;
  event_type: string;
  actor_id: string | null;
  actor_role: string | null;
  description: string;
  metadata: Json;
  occurred_at: string;
  created_at: string;
}
interface CaseEventsInsert {
  id?: string;
  organization_id: string;
  case_id: string;
  event_type: string;
  actor_id?: string | null;
  actor_role?: string | null;
  description: string;
  metadata?: Json;
  occurred_at?: string;
  created_at?: string;
}
type CaseEventsUpdate = Partial<CaseEventsInsert>;

// --- audit_logs ---------------------------------------------------------
interface AuditLogsRow {
  id: string;
  organization_id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  correlation_id: string | null;
  metadata: Json;
  created_at: string;
}
interface AuditLogsInsert {
  id?: string;
  organization_id: string;
  actor_id?: string | null;
  actor_role?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  correlation_id?: string | null;
  metadata?: Json;
  created_at?: string;
}
// Immutable once written: no UPDATE/DELETE RLS policy exists.
type AuditLogsUpdate = never;

// --- agent_memory ---------------------------------------------------------
interface AgentMemoryRow {
  id: string;
  organization_id: string;
  category: MemoryCategory;
  subject_type: string | null;
  subject_id: string | null;
  content: Json;
  confidence: number | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}
interface AgentMemoryInsert {
  id?: string;
  organization_id: string;
  category: MemoryCategory;
  subject_type?: string | null;
  subject_id?: string | null;
  content?: Json;
  confidence?: number | null;
  source?: string | null;
  created_at?: string;
  updated_at?: string;
}
type AgentMemoryUpdate = Partial<AgentMemoryInsert>;

// --- agent_skills ---------------------------------------------------------
interface AgentSkillsRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  version: string;
  status: SkillStatus;
  source: string;
  governance_state: GovernanceStatus;
  approved_by: string | null;
  approved_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}
interface AgentSkillsInsert {
  id?: string;
  organization_id: string;
  name: string;
  description?: string | null;
  version?: string;
  status?: SkillStatus;
  source?: string;
  governance_state?: GovernanceStatus;
  approved_by?: string | null;
  approved_at?: string | null;
  metadata?: Json;
  created_at?: string;
  updated_at?: string;
}
type AgentSkillsUpdate = Partial<AgentSkillsInsert>;

// --- agent_feedback ---------------------------------------------------------
interface AgentFeedbackRow {
  id: string;
  organization_id: string;
  alert_id: string | null;
  case_id: string | null;
  ai_recommendation_id: string | null;
  analyst_id: string;
  feedback_type: FeedbackType;
  decision: string | null;
  rating: number | null;
  comments: string | null;
  learning_metadata: Json;
  created_at: string;
}
interface AgentFeedbackInsert {
  id?: string;
  organization_id: string;
  alert_id?: string | null;
  case_id?: string | null;
  ai_recommendation_id?: string | null;
  analyst_id: string;
  feedback_type: FeedbackType;
  decision?: string | null;
  rating?: number | null;
  comments?: string | null;
  learning_metadata?: Json;
  created_at?: string;
}
// Permanent record: no UPDATE RLS policy exists.
type AgentFeedbackUpdate = never;

// --- model_versions ---------------------------------------------------------
interface ModelVersionsRow {
  id: string;
  organization_id: string | null;
  model_name: string;
  version: string;
  provider: string;
  model_type: string;
  status: GovernanceStatus;
  metrics: Json;
  configuration: Json;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}
interface ModelVersionsInsert {
  id?: string;
  organization_id?: string | null;
  model_name: string;
  version: string;
  provider: string;
  model_type: string;
  status?: GovernanceStatus;
  metrics?: Json;
  configuration?: Json;
  created_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at?: string;
  updated_at?: string;
}
type ModelVersionsUpdate = Partial<ModelVersionsInsert>;

// --- rule_versions ---------------------------------------------------------
interface RuleVersionsRow {
  id: string;
  organization_id: string;
  rule_name: string;
  version: string;
  definition: Json;
  status: GovernanceStatus;
  proposed_by: string | null;
  proposed_at: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}
interface RuleVersionsInsert {
  id?: string;
  organization_id: string;
  rule_name: string;
  version: string;
  definition: Json;
  status?: GovernanceStatus;
  proposed_by?: string | null;
  proposed_at?: string;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at?: string;
  updated_at?: string;
}
type RuleVersionsUpdate = Partial<RuleVersionsInsert>;

// --- notifications ---------------------------------------------------------
interface NotificationsRow {
  id: string;
  organization_id: string;
  recipient_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  read_at: string | null;
  metadata: Json;
  created_at: string;
}
interface NotificationsInsert {
  id?: string;
  organization_id: string;
  recipient_id: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  is_read?: boolean;
  read_at?: string | null;
  metadata?: Json;
  created_at?: string;
}
// Recipients may only toggle is_read/read_at (enforced by a trigger, not
// expressible here) — never rewrite title/body/type/etc.
interface NotificationsUpdate {
  is_read?: boolean;
  read_at?: string | null;
}

export interface Database {
  public: {
    Tables: {
      organizations: TableDef<OrganizationsRow, OrganizationsInsert, OrganizationsUpdate>;
      organization_settings: TableDef<OrganizationSettingsRow, OrganizationSettingsInsert, OrganizationSettingsUpdate>;
      profiles: TableDef<ProfilesRow, ProfilesInsert, ProfilesUpdate>;
      customers: TableDef<CustomersRow, CustomersInsert, CustomersUpdate>;
      customer_profiles: TableDef<CustomerProfilesRow, CustomerProfilesInsert, CustomerProfilesUpdate>;
      transactions: TableDef<TransactionsRow, TransactionsInsert, TransactionsUpdate>;
      alerts: TableDef<AlertsRow, AlertsInsert, AlertsUpdate>;
      risk_signals: TableDef<RiskSignalsRow, RiskSignalsInsert, RiskSignalsUpdate>;
      ml_predictions: TableDef<MlPredictionsRow, MlPredictionsInsert, MlPredictionsUpdate>;
      ai_recommendations: TableDef<AiRecommendationsRow, AiRecommendationsInsert, AiRecommendationsUpdate>;
      analyst_decisions: TableDef<AnalystDecisionsRow, AnalystDecisionsInsert, AnalystDecisionsUpdate>;
      cases: TableDef<CasesRow, CasesInsert, CasesUpdate>;
      case_events: TableDef<CaseEventsRow, CaseEventsInsert, CaseEventsUpdate>;
      audit_logs: TableDef<AuditLogsRow, AuditLogsInsert, AuditLogsUpdate>;
      agent_memory: TableDef<AgentMemoryRow, AgentMemoryInsert, AgentMemoryUpdate>;
      agent_skills: TableDef<AgentSkillsRow, AgentSkillsInsert, AgentSkillsUpdate>;
      agent_feedback: TableDef<AgentFeedbackRow, AgentFeedbackInsert, AgentFeedbackUpdate>;
      model_versions: TableDef<ModelVersionsRow, ModelVersionsInsert, ModelVersionsUpdate>;
      rule_versions: TableDef<RuleVersionsRow, RuleVersionsInsert, RuleVersionsUpdate>;
      notifications: TableDef<NotificationsRow, NotificationsInsert, NotificationsUpdate>;
    };
    Views: Record<string, never>;
    Functions: {
      create_organization_with_admin: {
        Args: { org_name: string; org_slug: string };
        Returns: string;
      };
    };
    Enums: {
      user_role: UserRole;
      risk_level: RiskLevel;
      kyc_status: KycStatus;
      sanctions_status: SanctionsStatus;
      customer_status: CustomerStatus;
      transaction_direction: TransactionDirection;
      transaction_status: TransactionStatus;
      alert_type: AlertType;
      alert_severity: AlertSeverity;
      investigation_state: InvestigationState;
      alert_source: AlertSource;
      risk_signal_type: RiskSignalType;
      recommendation_disposition: RecommendationDisposition;
      case_status: CaseStatus;
      case_priority: CasePriority;
      case_disposition: CaseDisposition;
      memory_category: MemoryCategory;
      skill_status: SkillStatus;
      feedback_type: FeedbackType;
      governance_status: GovernanceStatus;
      notification_type: NotificationType;
    };
  };
}

export type Tables = Database["public"]["Tables"];
export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T]["Row"];
export type InsertRow<T extends TableName> = Tables[T]["Insert"];
export type UpdateRow<T extends TableName> = Tables[T]["Update"];

export type Organization = Row<"organizations">;
export type OrganizationSettings = Row<"organization_settings">;
export type Profile = Row<"profiles">;
export type Customer = Row<"customers">;
export type CustomerProfile = Row<"customer_profiles">;
export type Transaction = Row<"transactions">;
export type Alert = Row<"alerts">;
export type RiskSignal = Row<"risk_signals">;
export type MlPrediction = Row<"ml_predictions">;
export type AiRecommendation = Row<"ai_recommendations">;
export type AnalystDecision = Row<"analyst_decisions">;
export type Case = Row<"cases">;
export type CaseEvent = Row<"case_events">;
export type AuditLog = Row<"audit_logs">;
export type AgentMemory = Row<"agent_memory">;
export type AgentSkill = Row<"agent_skills">;
export type AgentFeedback = Row<"agent_feedback">;
export type ModelVersion = Row<"model_versions">;
export type RuleVersion = Row<"rule_versions">;
export type Notification = Row<"notifications">;
