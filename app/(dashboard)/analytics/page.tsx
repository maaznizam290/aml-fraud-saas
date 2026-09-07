"use client";

import { useSession } from "../../../lib/auth/session.js";
import { useApiQuery } from "../../../lib/api/useApiQuery.js";
import type { DashboardSummary } from "../../../lib/dashboard/aggregate.js";
import type { ModelVersion } from "../../../lib/hermes/types.js";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../../components/ui/card.js";
import { StatTile } from "../../../components/ui/stat-tile.js";
import { BarChart } from "../../../components/charts/BarChart.js";
import { TrendChart } from "../../../components/charts/TrendChart.js";
import { LoadingState, ErrorState } from "../../../components/ui/states.js";
import { GovernanceStatusBadge } from "../../../components/domain/badges.js";

interface SummaryResponse {
  summary: DashboardSummary;
  hermesDegraded: boolean;
  sampleSize: { alerts: number; cases: number };
}

interface ModelsResponse {
  models: ModelVersion[];
  degraded: boolean;
}

const SEVERITY_COLORS: Record<string, string> = {
  LOW: "#0ca30c",
  MEDIUM: "#fab219",
  HIGH: "#ec835a",
  CRITICAL: "#d03b3b",
};

const OUTCOME_COLORS: Record<string, string> = {
  CONFIRMED_FRAUD: "#d03b3b",
  FALSE_POSITIVE: "#0ca30c",
  ESCALATED_EXTERNALLY: "#4a3aa7",
  CLEARED: "#1baf7a",
  INSUFFICIENT_EVIDENCE: "#fab219",
  OTHER: "#898781",
};

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export default function AnalyticsPage() {
  const { identity } = useSession();
  const summaryUrl = identity ? `/api/dashboard/summary?organizationId=${identity.organizationId}` : null;
  const modelsUrl = identity ? `/api/models?organizationId=${identity.organizationId}` : null;
  const summary = useApiQuery<SummaryResponse>(summaryUrl);
  const models = useApiQuery<ModelsResponse>(modelsUrl);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-primary">Analytics</h1>
        <p className="text-sm text-ink-muted">Investigation performance, AI feedback, and model outcomes.</p>
      </div>

      {summary.loading && <LoadingState label="Loading analytics…" />}
      {summary.error && <ErrorState detail={summary.error} onRetry={summary.refetch} />}

      {summary.data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="False-positive rate" value={pct(summary.data.summary.falsePositiveRate)} />
            <StatTile
              label="Avg. investigation time"
              value={
                summary.data.summary.avgInvestigationTimeMinutes === null
                  ? "—"
                  : `${Math.round(summary.data.summary.avgInvestigationTimeMinutes)} min`
              }
            />
            <StatTile label="AI / analyst agreement" value={pct(summary.data.summary.aiAgreementRate)} />
            <StatTile label="Total cases" value={String(summary.data.summary.totalCases)} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Alert volume</CardTitle>
                <CardDescription>Alerts received per day, last 14 days.</CardDescription>
              </CardHeader>
              <CardContent>
                <TrendChart data={summary.data.summary.alertTrend.map((p) => ({ date: p.date, value: p.count }))} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Risk distribution</CardTitle>
                <CardDescription>Alerts by severity.</CardDescription>
              </CardHeader>
              <CardContent>
                <BarChart
                  data={summary.data.summary.riskDistribution.map((d) => ({
                    label: d.severity,
                    value: d.count,
                    color: SEVERITY_COLORS[d.severity] ?? "#2a78d6",
                  }))}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Case outcomes</CardTitle>
              <CardDescription>Disposition of resolved cases.</CardDescription>
            </CardHeader>
            <CardContent>
              <BarChart
                data={summary.data.summary.caseOutcomes
                  .filter((o) => o.count > 0)
                  .map((o) => ({
                    label: o.disposition.replace(/_/g, " "),
                    value: o.count,
                    color: OUTCOME_COLORS[o.disposition] ?? "#2a78d6",
                  }))}
              />
              {summary.data.summary.caseOutcomes.every((o) => o.count === 0) && (
                <p className="py-4 text-center text-sm text-ink-muted">No resolved cases yet.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Model performance</CardTitle>
          <CardDescription>Registered model versions and their recorded metrics.</CardDescription>
        </CardHeader>
        <CardContent>
          {models.loading && <LoadingState label="Loading models…" />}
          {models.error && <ErrorState detail={models.error} onRetry={models.refetch} />}
          {models.data && models.data.models.length === 0 && (
            <p className="text-sm text-ink-muted">No model versions registered yet.</p>
          )}
          {models.data && models.data.models.length > 0 && (
            <div className="flex flex-col gap-3">
              {models.data.models.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-md border border-line px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink-primary">
                      {m.model_name} <span className="text-ink-muted">v{m.version}</span>
                    </p>
                    <p className="text-xs text-ink-muted">
                      {m.provider} · {m.model_type}
                    </p>
                  </div>
                  <GovernanceStatusBadge status={m.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
