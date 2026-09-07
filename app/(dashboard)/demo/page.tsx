"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, PlayCircle } from "lucide-react";

import { useApiQuery } from "../../../lib/api/useApiQuery.js";
import { postJson } from "../../../lib/api/mutate.js";
import type { DemoScenarioId, DemoScenarioMeta } from "../../../lib/dashboard/demoScenarios.js";
import type { AiRecommendation, Alert } from "../../../lib/supabase/types.js";
import { Button } from "../../../components/ui/button.js";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../../components/ui/card.js";
import { ErrorState, LoadingState } from "../../../components/ui/states.js";
import { InvestigationProgress } from "../../../components/domain/InvestigationProgress.js";
import { RecommendationPanel } from "../../../components/domain/RecommendationPanel.js";
import { HumanReviewPanel } from "../../../components/domain/HumanReviewPanel.js";
import { AuditTimeline } from "../../../components/domain/AuditTimeline.js";
import { SeverityBadge, DispositionBadge } from "../../../components/domain/badges.js";

interface ScenariosResponse {
  scenarios: DemoScenarioMeta[];
  demoModeActive: boolean;
}

interface TriggerResult {
  organizationId: string;
  customerId: string;
  alertId: string;
  caseId: string;
  recommendationId: string;
  disposition: string;
  riskLevel: string;
  degraded: boolean;
  status: string;
}

interface WorkspaceResponse {
  alert: Alert;
  recommendation: AiRecommendation | null;
}

export default function DemoSimulatorPage() {
  const { data, error, loading, refetch } = useApiQuery<ScenariosResponse>("/api/demo/scenarios");
  const [running, setRunning] = useState<DemoScenarioId | null>(null);
  const [result, setResult] = useState<TriggerResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  async function runScenario(scenarioId: DemoScenarioId) {
    setRunning(scenarioId);
    setRunError(null);
    setResult(null);
    try {
      const triggered = await postJson<TriggerResult>("/api/demo/trigger", { scenarioId });
      setResult(triggered);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "The demo pipeline failed to run.");
    } finally {
      setRunning(null);
    }
  }

  if (loading) return <LoadingState label="Loading demo simulator…" />;
  if (error) return <ErrorState detail={error} onRetry={refetch} />;
  if (!data) return null;

  if (!data.demoModeActive) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-ink-primary">Demo Simulator</h1>
        <p className="rounded-md bg-status-warning/10 px-4 py-3 text-sm text-[#8a5a00]">
          The demo simulator only runs in DEMO mode. This deployment is running in REAL mode against live data, so
          synthetic scenarios are disabled to avoid polluting it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-primary">Demo Simulator</h1>
        <p className="text-sm text-ink-muted">
          Trigger a synthetic scenario and watch it move through the real investigation pipeline — evidence, risk,
          ML, AI investigation, and a recommendation ready for your review.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.scenarios.map((scenario) => (
          <Card key={scenario.id}>
            <CardHeader>
              <CardTitle>{scenario.title}</CardTitle>
              <CardDescription>{scenario.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-xs text-ink-muted">{scenario.expectedNarrative}</p>
              <Button onClick={() => runScenario(scenario.id)} disabled={running !== null}>
                {running === scenario.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Running…
                  </>
                ) : (
                  <>
                    <PlayCircle className="h-4 w-4" /> Run scenario
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {runError && <ErrorState detail={runError} onRetry={() => setRunning(null)} />}

      {result && <DemoRunResult key={result.alertId} result={result} />}
    </div>
  );
}

function DemoRunResult({ result }: { result: TriggerResult }) {
  const url = `/api/alerts/${result.alertId}/workspace?organizationId=${result.organizationId}`;
  const { data, error, loading, refetch } = useApiQuery<WorkspaceResponse>(url);
  const [reviewed, setReviewed] = useState(false);
  const retriedRef = useRef(false);

  // The workspace read can briefly race the write it just triggered (the
  // alert was only just seeded) — one automatic retry covers that window
  // so the demo doesn't surface a transient error to an investor mid-demo.
  useEffect(() => {
    if (error && !retriedRef.current) {
      retriedRef.current = true;
      const timer = setTimeout(refetch, 700);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [error, refetch]);

  return (
    <div className="flex flex-col gap-6 border-t border-line pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink-primary">Live run</h2>
        <Link href={`/alerts/${result.alertId}`} className="text-xs text-brand-600 hover:underline">
          Open in Investigation Workspace →
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <InvestigationProgress currentStatus="HUMAN_REVIEW" simulate />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          {(loading || (error && !retriedRef.current)) && <LoadingState label="Loading recommendation…" />}
          {error && retriedRef.current && !loading && <ErrorState detail={error} onRetry={refetch} />}
          {data?.alert && (
            <div className="flex items-center gap-2">
              <SeverityBadge severity={data.alert.severity} />
              {data.recommendation && <DispositionBadge disposition={data.recommendation.disposition} />}
              {result.degraded && (
                <span className="text-xs text-ink-muted">(AI investigation degraded — routed to human review)</span>
              )}
            </div>
          )}
          {data?.recommendation && <RecommendationPanel recommendation={data.recommendation} />}

          {!reviewed ? (
            <HumanReviewPanel
              alertId={result.alertId}
              organizationId={result.organizationId}
              recommendation={data?.recommendation ?? null}
              onReviewed={() => setReviewed(true)}
            />
          ) : (
            <Card>
              <CardContent className="py-4 text-sm text-ink-primary">
                Decision recorded — a learning event was captured for this investigation, and the case is now in
                progress.{" "}
                <Link href="/learning" className="text-brand-600 hover:underline">
                  See it in AI Learning →
                </Link>{" "}
                or{" "}
                <Link href={`/cases/${result.caseId}`} className="text-brand-600 hover:underline">
                  resolve the case →
                </Link>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Audit trail for this investigation</CardTitle>
            </CardHeader>
            <CardContent>
              <AuditTimeline organizationId={result.organizationId} alertId={result.alertId} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
