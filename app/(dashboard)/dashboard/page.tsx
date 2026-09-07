"use client";

import { useSession } from "../../../lib/auth/session.js";
import { useApiQuery } from "../../../lib/api/useApiQuery.js";
import type { DashboardSummary } from "../../../lib/dashboard/aggregate.js";
import { StatTile } from "../../../components/ui/stat-tile.js";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../../components/ui/card.js";
import { LoadingState, ErrorState } from "../../../components/ui/states.js";
import { BarChart } from "../../../components/charts/BarChart.js";
import { TrendChart } from "../../../components/charts/TrendChart.js";

const SEVERITY_COLORS: Record<string, string> = {
  LOW: "#0ca30c",
  MEDIUM: "#fab219",
  HIGH: "#ec835a",
  CRITICAL: "#d03b3b",
};

interface SummaryResponse {
  summary: DashboardSummary;
  hermesDegraded: boolean;
  sampleSize: { alerts: number; cases: number };
}

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export default function ExecutiveDashboardPage() {
  const { identity } = useSession();
  const url = identity ? `/api/dashboard/summary?organizationId=${identity.organizationId}` : null;
  const { data, error, loading, refetch } = useApiQuery<SummaryResponse>(url);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-primary">Executive Dashboard</h1>
        <p className="text-sm text-ink-muted">A real-time view of investigation volume, risk, and AI performance.</p>
      </div>

      {loading && <LoadingState label="Loading dashboard…" />}
      {error && <ErrorState detail={error} onRetry={refetch} />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <StatTile label="Active alerts" value={String(data.summary.activeAlerts)} />
            <StatTile
              label="High-risk alerts"
              value={String(data.summary.highRiskAlerts)}
              deltaTone={data.summary.highRiskAlerts > 0 ? "critical" : "good"}
            />
            <StatTile label="Open cases" value={String(data.summary.openCases)} />
            <StatTile
              label="False-positive rate"
              value={pct(data.summary.falsePositiveRate)}
              delta={data.summary.falsePositiveRate === null ? "No resolved cases yet" : undefined}
            />
            <StatTile
              label="Avg. investigation time"
              value={
                data.summary.avgInvestigationTimeMinutes === null
                  ? "—"
                  : `${Math.round(data.summary.avgInvestigationTimeMinutes)} min`
              }
            />
            <StatTile
              label="AI / analyst agreement"
              value={pct(data.summary.aiAgreementRate)}
              delta={data.summary.aiAgreementRate === null ? "No feedback recorded yet" : undefined}
              deltaTone="good"
            />
          </div>

          {data.hermesDegraded && (
            <p className="rounded-md bg-status-warning/10 px-3 py-2 text-xs text-[#8a5a00]">
              Learning-layer metrics (AI agreement rate) are temporarily unavailable — the rest of this dashboard is
              unaffected.
            </p>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Risk distribution</CardTitle>
                <CardDescription>Alerts by severity, based on the {data.sampleSize.alerts} most recent.</CardDescription>
              </CardHeader>
              <CardContent>
                <BarChart
                  data={data.summary.riskDistribution.map((d) => ({
                    label: d.severity,
                    value: d.count,
                    color: SEVERITY_COLORS[d.severity] ?? "#2a78d6",
                  }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Alert volume (14 days)</CardTitle>
                <CardDescription>New alerts received per day.</CardDescription>
              </CardHeader>
              <CardContent>
                <TrendChart data={data.summary.alertTrend.map((p) => ({ date: p.date, value: p.count }))} />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
