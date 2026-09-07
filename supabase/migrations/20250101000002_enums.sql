-- Enumerated types shared across the schema.
-- Investigation-state and disposition values intentionally exclude any
-- automated-adverse-action outcome (e.g. no automatic account closure or
-- automatic regulatory filing) — see CLAUDE.md Critical Rule: AI/system
-- output is always a recommendation, never a decision.

create type user_role as enum ('ADMIN', 'COMPLIANCE_MANAGER', 'ANALYST', 'VIEWER');

create type risk_level as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

create type kyc_status as enum ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

create type sanctions_status as enum ('CLEAR', 'POTENTIAL_MATCH', 'CONFIRMED_MATCH', 'PENDING_REVIEW');

create type customer_status as enum ('ACTIVE', 'DORMANT', 'SUSPENDED', 'CLOSED');

create type transaction_direction as enum ('INBOUND', 'OUTBOUND');

create type transaction_status as enum ('PENDING', 'COMPLETED', 'FLAGGED', 'REVERSED', 'FAILED');

create type alert_type as enum (
  'AMOUNT_ANOMALY',
  'VELOCITY_ANOMALY',
  'NEW_BENEFICIARY',
  'NEW_DEVICE',
  'LOCATION_ANOMALY',
  'COUNTRY_RISK',
  'STRUCTURING',
  'SANCTIONS_HIT',
  'KYC_ISSUE',
  'BEHAVIORAL_ANOMALY',
  'OTHER'
);

create type alert_severity as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- Doubles as the alert's "investigation state" per the required lifecycle:
-- RECEIVED -> ANALYZING -> EVIDENCE_COLLECTED -> AI_INVESTIGATING ->
-- RECOMMENDATION_READY -> HUMAN_REVIEW -> RESOLVED
create type investigation_state as enum (
  'RECEIVED',
  'ANALYZING',
  'EVIDENCE_COLLECTED',
  'AI_INVESTIGATING',
  'RECOMMENDATION_READY',
  'HUMAN_REVIEW',
  'RESOLVED'
);

create type alert_source as enum ('RULE_ENGINE', 'ML_MODEL', 'SANCTIONS_SCREENING', 'MANUAL', 'EXTERNAL_SYSTEM');

create type risk_signal_type as enum (
  'AMOUNT_ANOMALY',
  'VELOCITY_ANOMALY',
  'NEW_BENEFICIARY',
  'NEW_DEVICE',
  'LOCATION_ANOMALY',
  'COUNTRY_RISK',
  'CUSTOMER_RISK',
  'KYC_STATUS',
  'SANCTIONS_RESULT',
  'HISTORICAL_BEHAVIOR',
  'ACCOUNT_AGE',
  'TRANSACTION_FREQUENCY',
  'STRUCTURING_INDICATOR'
);

-- Recommendations only; human approval remains mandatory (see CLAUDE.md Critical Rule).
create type recommendation_disposition as enum ('ESCALATE', 'CLEAR', 'REFER');

create type case_status as enum ('OPEN', 'IN_PROGRESS', 'PENDING_REVIEW', 'RESOLVED', 'CLOSED', 'REOPENED');

create type case_priority as enum ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- Recorded outcome of a human-made decision; never written automatically by a model.
create type case_disposition as enum (
  'CONFIRMED_FRAUD',
  'FALSE_POSITIVE',
  'ESCALATED_EXTERNALLY',
  'CLEARED',
  'INSUFFICIENT_EVIDENCE',
  'OTHER'
);

create type memory_category as enum ('EPISODIC', 'SEMANTIC', 'PROCEDURAL', 'INVESTIGATION', 'INSTITUTIONAL');

create type skill_status as enum ('DRAFT', 'ACTIVE', 'DEPRECATED');

create type feedback_type as enum ('CONFIRM', 'OVERRULE', 'CORRECTION', 'COMMENT', 'RATING');

-- Governance lifecycle for ML models and rules. Reaching DEPLOYED never happens
-- automatically from this schema — it only records a state a human approved.
create type governance_status as enum ('PROPOSED', 'REVIEW', 'APPROVED', 'VERSIONED', 'DEPLOYED');

create type notification_type as enum (
  'ALERT_ASSIGNED',
  'CASE_ASSIGNED',
  'RECOMMENDATION_READY',
  'CASE_RESOLVED',
  'MENTION',
  'SYSTEM'
);
