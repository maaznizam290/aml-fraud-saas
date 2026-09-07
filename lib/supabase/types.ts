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
export type ImprovementType =
  | "SKILL_REFINEMENT"
  | "EVIDENCE_PRIORITIZATION"
  | "FALSE_POSITIVE_PATTERN"
  | "PROMPT_IMPROVEMENT"
  | "MODEL_RECOMMENDATION"
  | "RULE_RECOMMENDATION";
export type NotificationType =
  | "ALERT_ASSIGNED"
  | "CASE_ASSIGNED"
  | "RECOMMENDATION_READY"
  | "CASE_RESOLVED"
  | "MENTION"
  | "SYSTEM";

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// `type`, not `interface`: supabase-js's internal conditional/`infer` types
// (used to derive Insert/Update argument types) were observed to silently
// resolve to `never` when this was an interface, or when Row/Insert were
// declared with `interface` — TypeScript expands `type` aliases eagerly
// during that inference in a way it does not for named interfaces. See
// lib/orchestration/stores/supabaseStore.ts, where this surfaced.
type TableDef<R, I, U> = {
  Row: R;
  Insert: I;
  Update: U;
  // supabase-js's generic constraints (GenericTable) require this field to
  // exist on every table. We don't model embedded-relationship selects, so
  // `never[]` (assignable to any GenericRelationship[]) is enough.
  Relationships: never[];
};

// --- organizations ---------------------------------------------------------
type OrganizationsRow = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
type OrganizationsInsert = {
  id?: string;
  name: string;
  slug: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};
type OrganizationsUpdate = Partial<OrganizationsInsert>;

// --- organization_settings ---------------------------------------------------------
type OrganizationSettingsRow = {
  id: string;
  organization_id: string;
  risk_thresholds: Json;
  notification_preferences: Json;
  settings: Json;
  created_at: string;
  updated_at: string;
};
type OrganizationSettingsInsert = {
  id?: string;
  organization_id: string;
  risk_thresholds?: Json;
  notification_preferences?: Json;
  settings?: Json;
  created_at?: string;
  updated_at?: string;
};
type OrganizationSettingsUpdate = Partial<OrganizationSettingsInsert>;

// --- profiles ---------------------------------------------------------
type ProfilesRow = {
  id: string;
  organization_id: string | null;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
type ProfilesInsert = {
  id: string;
  organization_id?: string | null;
  email: string;
  full_name?: string | null;
  role?: UserRole;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};
type ProfilesUpdate = Partial<Omit<ProfilesInsert, "id">>;

// --- customers ---------------------------------------------------------
type CustomersRow = {
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
};
type CustomersInsert = {
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
};
type CustomersUpdate = Partial<CustomersInsert>;

// --- customer_profiles ---------------------------------------------------------
type CustomerProfilesRow = {
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
};
type CustomerProfilesInsert = {
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
};
type CustomerProfilesUpdate = Partial<CustomerProfilesInsert>;

// --- transactions ---------------------------------------------------------
type TransactionsRow = {
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
};
type TransactionsInsert = {
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
};
type TransactionsUpdate = Partial<TransactionsInsert>;

// --- alerts ---------------------------------------------------------
type AlertsRow = {
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
};
type AlertsInsert = {
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
};
type AlertsUpdate = Partial<AlertsInsert>;

// --- risk_signals ---------------------------------------------------------
type RiskSignalsRow = {
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
};
type RiskSignalsInsert = {
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
};
type RiskSignalsUpdate = Partial<RiskSignalsInsert>;

// --- ml_predictions ---------------------------------------------------------
type MlPredictionsRow = {
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
};
type MlPredictionsInsert = {
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
};
type MlPredictionsUpdate = Partial<MlPredictionsInsert>;

// --- ai_recommendations ---------------------------------------------------------
type AiRecommendationsRow = {
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
};
type AiRecommendationsInsert = {
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
};
type AiRecommendationsUpdate = Partial<AiRecommendationsInsert>;

// --- analyst_decisions ---------------------------------------------------------
type AnalystDecisionsRow = {
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
};
type AnalystDecisionsInsert = {
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
};
type AnalystDecisionsUpdate = Partial<AnalystDecisionsInsert>;

// --- cases ---------------------------------------------------------
type CasesRow = {
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
};
type CasesInsert = {
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
};
type CasesUpdate = Partial<CasesInsert>;

// --- case_events ---------------------------------------------------------
type CaseEventsRow = {
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
};
type CaseEventsInsert = {
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
};
type CaseEventsUpdate = Partial<CaseEventsInsert>;

// --- audit_logs ---------------------------------------------------------
type AuditLogsRow = {
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
};
type AuditLogsInsert = {
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
};
// Immutable once written: no UPDATE/DELETE RLS policy exists.
type AuditLogsUpdate = never;

// --- agent_memory ---------------------------------------------------------
type AgentMemoryRow = {
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
};
type AgentMemoryInsert = {
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
};
type AgentMemoryUpdate = Partial<AgentMemoryInsert>;

// --- agent_skills ---------------------------------------------------------
type AgentSkillsRow = {
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
};
type AgentSkillsInsert = {
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
};
type AgentSkillsUpdate = Partial<AgentSkillsInsert>;

// --- agent_feedback ---------------------------------------------------------
type AgentFeedbackRow = {
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
};
type AgentFeedbackInsert = {
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
};
// Permanent record: no UPDATE RLS policy exists.
type AgentFeedbackUpdate = never;

// --- model_versions ---------------------------------------------------------
type ModelVersionsRow = {
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
};
type ModelVersionsInsert = {
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
};
type ModelVersionsUpdate = Partial<ModelVersionsInsert>;

// --- rule_versions ---------------------------------------------------------
type RuleVersionsRow = {
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
};
type RuleVersionsInsert = {
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
};
type RuleVersionsUpdate = Partial<RuleVersionsInsert>;

// --- notifications ---------------------------------------------------------
type NotificationsRow = {
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
};
type NotificationsInsert = {
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
};
// Recipients may only toggle is_read/read_at (enforced by a trigger, not
// expressible here) — never rewrite title/body/type/etc.
type NotificationsUpdate = {
  is_read?: boolean;
  read_at?: string | null;
};

// --- learning_candidates ---------------------------------------------------------
type LearningCandidatesRow = {
  id: string;
  organization_id: string;
  improvement_type: ImprovementType;
  title: string;
  description: string;
  payload: Json;
  supporting_feedback_ids: string[];
  status: GovernanceStatus;
  related_skill_id: string | null;
  related_model_version_id: string | null;
  related_rule_version_id: string | null;
  proposed_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  versioned_at: string | null;
  deployed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};
type LearningCandidatesInsert = {
  id?: string;
  organization_id: string;
  improvement_type: ImprovementType;
  title: string;
  description: string;
  payload?: Json;
  supporting_feedback_ids?: string[];
  status?: GovernanceStatus;
  related_skill_id?: string | null;
  related_model_version_id?: string | null;
  related_rule_version_id?: string | null;
  proposed_by?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  versioned_at?: string | null;
  deployed_at?: string | null;
  rejection_reason?: string | null;
  created_at?: string;
  updated_at?: string;
};
type LearningCandidatesUpdate = Partial<LearningCandidatesInsert>;

// `type`, not `interface` — see the TableDef comment above: supabase-js's
// generic inference needs this eagerly resolved, which only happens
// reliably with a type alias.
export type Database = {
  // Matches the shape `supabase gen types typescript` emits as of the
  // PostgREST v12 client — supabase-js's generic Insert/Update inference
  // depends on this marker being present (its absence was observed to
  // silently collapse every table's Insert/Update type to `never`).
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
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
      learning_candidates: TableDef<LearningCandidatesRow, LearningCandidatesInsert, LearningCandidatesUpdate>;
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
      improvement_type: ImprovementType;
    };
  };
};

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
export type LearningCandidate = Row<"learning_candidates">;
