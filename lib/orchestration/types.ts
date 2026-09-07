/**
 * Shared contracts for the AI investigation / n8n orchestration layer.
 *
 * Reuses the enums from feature/supabase-schema (lib/supabase/types.ts)
 * rather than inventing a second vocabulary — in particular
 * RecommendationDisposition, InvestigationState, and RiskSignalType are the
 * exact same types the database and the ML engine (ml-engine/src/fraud_ml
 * /schemas.py) already use. No disposition or status value anywhere in this
 * file implies an autonomous adverse action — see CLAUDE.md Critical Rule.
 */
import type {
  Alert,
  AlertSeverity,
  AlertType,
  CaseDisposition,
  CasePriority,
  CustomerProfile,
  InvestigationState,
  KycStatus,
  RecommendationDisposition,
  RiskLevel,
  RiskSignalType,
  SanctionsStatus,
  Transaction,
} from "../supabase/types.js";

/** DEMO uses deterministic synthetic data and an in-memory store — no live
 * Supabase/Claude/ML credentials are touched. REAL uses configured
 * providers. See config.ts. Never inferred implicitly from missing env vars
 * alone (a misconfigured REAL deployment must fail loudly, not silently
 * fall back to demo behavior). */
export type OrchestrationMode = "DEMO" | "REAL";

// ---------------------------------------------------------------------------
// Inbound webhook
// ---------------------------------------------------------------------------

export interface AlertWebhookPayload {
  alertId: string;
  organizationId: string;
  customerId: string;
  transactionId: string | null;
  alertType: AlertType;
  severity: AlertSeverity;
  triggeredRules: string[];
  riskScore: number | null;
  mlScore: number | null;
  source: string;
  occurredAt: string;
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export type EvidenceCategory =
  | "TRANSACTION_HISTORY"
  | "CUSTOMER_PROFILE"
  | "KYC_STATUS"
  | "SANCTIONS_RESULT"
  | "HISTORICAL_BEHAVIOR"
  | "DEVICE_INFO"
  | "LOCATION_INFO"
  | "COUNTRY_RISK"
  | "RISK_SIGNALS"
  | "ML_PREDICTION";

/** One citable unit of evidence. `id` is stable and short enough that
 * Claude's `supportingEvidence`/`contradictoryEvidence` output can reference
 * it directly (e.g. "txn-history: 8 transfers in 2 hours"), and an analyst
 * reviewing the recommendation later can trace it back to `data`. */
export interface EvidenceItem<T = unknown> {
  id: string;
  category: EvidenceCategory;
  summary: string;
  data: T;
  source: string;
  retrievedAt: string;
}

export interface EvidenceCollectionError {
  category: EvidenceCategory;
  message: string;
}

export interface EvidenceBundle {
  alertId: string;
  organizationId: string;
  customerId: string;
  transactionId: string | null;
  items: EvidenceItem[];
  /** Non-fatal: a provider failing (e.g. sanctions lookup down) is recorded
   * here and investigation continues on what evidence *was* collected —
   * never fabricated to fill the gap. See docs/ORCHESTRATION.md "Safe failure". */
  errors: EvidenceCollectionError[];
  collectedAt: string;
}

export interface TransactionHistoryEvidenceData {
  transaction: Transaction | null;
  recentTransactions: Transaction[];
}

export interface CustomerProfileEvidenceData {
  customerProfile: CustomerProfile | null;
  riskRating: RiskLevel;
}

export interface KycEvidenceData {
  kycStatus: KycStatus;
}

export interface SanctionsEvidenceData {
  sanctionsStatus: SanctionsStatus;
  sanctionsCheckedAt: string | null;
}

export interface DeviceEvidenceData {
  deviceId: string | null;
  deviceIsNew: boolean;
}

export interface LocationEvidenceData {
  originCountry: string | null;
  destinationCountry: string | null;
  counterpartyCountry: string | null;
}

export interface CountryRiskEvidenceData {
  countriesInvolved: string[];
  highRiskCountriesMatched: string[];
}

// ---------------------------------------------------------------------------
// ML prediction (mirrors ml-engine's MLPredictionResult / the ml_predictions
// table — see ml-engine/src/fraud_ml/schemas.py::MLPredictionResult)
// ---------------------------------------------------------------------------

export interface MlPredictionEvidenceData {
  provider: string;
  modelName: string;
  modelVersion: string;
  prediction: string;
  score: number;
  confidence: number | null;
  riskSignals: RiskSignalSummary[];
  riskAssessment: {
    disposition: RecommendationDisposition;
    riskLevel: RiskLevel;
    rationale: string;
    mlContributed: boolean;
  } | null;
  degraded: boolean;
  error?: string;
}

export interface RiskSignalSummary {
  signalType: RiskSignalType;
  triggered: boolean;
  weight: number;
  explanation: string;
}

// ---------------------------------------------------------------------------
// Claude / LLM structured investigation output
// ---------------------------------------------------------------------------

export interface InvestigationOutput {
  disposition: RecommendationDisposition;
  confidence: number;
  riskLevel: RiskLevel;
  rationale: string;
  redFlags: string[];
  supportingEvidence: string[];
  contradictoryEvidence: string[];
  recommendedNextSteps: string[];
  mlScoreAssessment: string;
  investigationSummary: string;
}

export type InvestigationOutcome =
  | { status: "ok"; output: InvestigationOutput; provider: string; model: string; promptVersion: string }
  | { status: "parse_failed"; rawResponse: string; error: string; provider: string; model: string }
  | { status: "provider_failed"; error: string; provider: string };

// ---------------------------------------------------------------------------
// Human review
// ---------------------------------------------------------------------------

export type HumanReviewAction = "APPROVE" | "REJECT" | "OVERRIDE";

export interface HumanReviewInput {
  alertId: string;
  analystId: string;
  action: HumanReviewAction;
  /** Required when action is OVERRIDE; ignored otherwise. */
  overrideDisposition?: RecommendationDisposition;
  rationale: string;
}

export interface HumanReviewResult {
  alertId: string;
  caseId: string;
  decision: RecommendationDisposition;
  agreedWithAi: boolean;
  overrideReason: string | null;
}

export interface CaseResolutionInput {
  caseId: string;
  analystId: string;
  disposition: CaseDisposition;
  resolutionReason: string;
  priority?: CasePriority;
}

// ---------------------------------------------------------------------------
// Investigation lifecycle (mirrors Alert.status / investigation_state)
// ---------------------------------------------------------------------------

export type { InvestigationState };

export interface InvestigationStatusSnapshot {
  alertId: string;
  status: InvestigationState;
  correlationId: string;
  updatedAt: string;
}

// Re-exported for convenience so callers don't need two import paths.
export type { Alert, RecommendationDisposition, RiskLevel };
