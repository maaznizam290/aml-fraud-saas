/**
 * Executive Dashboard / Analytics aggregation (task sections 3, 6). Pure
 * presentation-layer tallying over data the orchestration and Hermes
 * layers already computed and persisted (alert severities, case
 * dispositions, analyst/AI agreement) — no ML scoring, no LLM calls, no
 * governance logic lives here. If this file ever needs to know *how* a
 * risk score or a recommendation was produced, that's a sign it's grown
 * past its scope.
 */
import type { Alert, AlertSeverity, Case, CaseDisposition } from "../supabase/types.js";
import type { AgentFeedback } from "../hermes/types.js";

export interface RiskDistributionPoint {
  severity: AlertSeverity;
  count: number;
}

export interface AlertTrendPoint {
  date: string;
  count: number;
}

export interface CaseOutcomePoint {
  disposition: CaseDisposition;
  count: number;
}

export interface DashboardSummary {
  activeAlerts: number;
  highRiskAlerts: number;
  openCases: number;
  totalCases: number;
  /** null when there are no resolved cases yet to compute a rate from. */
  falsePositiveRate: number | null;
  /** null when no resolved case has both opened_at and resolved_at. */
  avgInvestigationTimeMinutes: number | null;
  /** null when no feedback with a recorded agreedWithAi value exists yet. */
  aiAgreementRate: number | null;
  riskDistribution: RiskDistributionPoint[];
  alertTrend: AlertTrendPoint[];
  caseOutcomes: CaseOutcomePoint[];
}

const DISPOSITIONS: CaseDisposition[] = [
  "CONFIRMED_FRAUD",
  "FALSE_POSITIVE",
  "ESCALATED_EXTERNALLY",
  "CLEARED",
  "INSUFFICIENT_EVIDENCE",
  "OTHER",
];

const SEVERITIES: AlertSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const TREND_DAYS = 14;

export function computeDashboardSummary(alerts: Alert[], cases: Case[], feedback: AgentFeedback[]): DashboardSummary {
  const activeAlerts = alerts.filter((a) => a.status !== "RESOLVED").length;
  const highRiskAlerts = alerts.filter((a) => a.severity === "HIGH" || a.severity === "CRITICAL").length;
  const openCases = cases.filter((c) => c.status !== "RESOLVED" && c.status !== "CLOSED").length;
  const resolvedCases = cases.filter((c) => c.status === "RESOLVED" || c.status === "CLOSED");

  const falsePositiveRate =
    resolvedCases.length > 0
      ? resolvedCases.filter((c) => c.disposition === "FALSE_POSITIVE").length / resolvedCases.length
      : null;

  const durations = resolvedCases
    .filter((c) => c.resolved_at)
    .map((c) => (new Date(c.resolved_at as string).getTime() - new Date(c.opened_at).getTime()) / 60_000)
    .filter((minutes) => Number.isFinite(minutes) && minutes >= 0);
  const avgInvestigationTimeMinutes = durations.length > 0 ? average(durations) : null;

  const agreementSignals = feedback
    .map((f) => (f.learning_metadata as Record<string, unknown> | null)?.["agreedWithAi"])
    .filter((v): v is boolean => typeof v === "boolean");
  const aiAgreementRate =
    agreementSignals.length > 0 ? agreementSignals.filter(Boolean).length / agreementSignals.length : null;

  const riskDistribution: RiskDistributionPoint[] = SEVERITIES.map((severity) => ({
    severity,
    count: alerts.filter((a) => a.severity === severity).length,
  }));

  const alertTrend = buildAlertTrend(alerts);
  const caseOutcomes: CaseOutcomePoint[] = DISPOSITIONS.map((disposition) => ({
    disposition,
    count: resolvedCases.filter((c) => c.disposition === disposition).length,
  }));

  return {
    activeAlerts,
    highRiskAlerts,
    openCases,
    totalCases: cases.length,
    falsePositiveRate,
    avgInvestigationTimeMinutes,
    aiAgreementRate,
    riskDistribution,
    alertTrend,
    caseOutcomes,
  };
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function buildAlertTrend(alerts: Alert[]): AlertTrendPoint[] {
  const counts = new Map<string, number>();
  const today = new Date();
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    counts.set(d.toISOString().slice(0, 10), 0);
  }
  for (const alert of alerts) {
    const day = alert.created_at.slice(0, 10);
    if (counts.has(day)) counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts.entries()].map(([date, count]) => ({ date, count }));
}
