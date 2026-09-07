"use client";

import { useState } from "react";
import Link from "next/link";

import { useSession } from "../../../../lib/auth/session.js";
import { useApiQuery } from "../../../../lib/api/useApiQuery.js";
import { postJson } from "../../../../lib/api/mutate.js";
import { canResolveCases } from "../../../../lib/auth/roles.js";
import type { AnalystDecision, Case, CaseDisposition, CaseEvent, Alert } from "../../../../lib/supabase/types.js";
import { RoleGate } from "../../../../components/RoleGate.js";
import { CaseStatusBadge, SeverityBadge } from "../../../../components/domain/badges.js";
import { AuditTimeline } from "../../../../components/domain/AuditTimeline.js";
import { Button } from "../../../../components/ui/button.js";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../../../components/ui/card.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../../components/ui/tabs.js";
import { ErrorState, LoadingState } from "../../../../components/ui/states.js";

interface CaseDetailResponse {
  case: Case;
  alert: Alert | null;
  events: CaseEvent[];
  analystDecisions: AnalystDecision[];
}

const DISPOSITIONS: CaseDisposition[] = [
  "CONFIRMED_FRAUD",
  "FALSE_POSITIVE",
  "ESCALATED_EXTERNALLY",
  "CLEARED",
  "INSUFFICIENT_EVIDENCE",
  "OTHER",
];

export default function CaseDetailPage({ params }: { params: { caseId: string } }) {
  const { identity } = useSession();
  const url = identity ? `/api/cases/${params.caseId}?organizationId=${identity.organizationId}` : null;
  const { data, error, loading, refetch } = useApiQuery<CaseDetailResponse>(url);

  if (loading) return <LoadingState label="Loading case…" />;
  if (error) return <ErrorState detail={error} onRetry={refetch} />;
  if (!data) return null;

  const { case: theCase, alert, events, analystDecisions } = data;
  const isResolved = theCase.status === "RESOLVED" || theCase.status === "CLOSED";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-mono text-xs text-ink-muted">{theCase.id}</p>
        <h1 className="text-2xl font-semibold text-ink-primary">Case {theCase.case_number}</h1>
        <div className="mt-2 flex items-center gap-2">
          <CaseStatusBadge status={theCase.status} />
          {alert && <SeverityBadge severity={alert.severity} />}
          {alert && (
            <Link href={`/alerts/${alert.id}`} className="text-xs text-brand-600 hover:underline">
              View investigation →
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Tabs defaultValue="timeline">
          <TabsList>
            <TabsTrigger value="timeline">Case timeline</TabsTrigger>
            <TabsTrigger value="audit">Audit trail</TabsTrigger>
          </TabsList>
          <TabsContent value="timeline">
            {events.length === 0 ? (
              <p className="text-sm text-ink-muted">No case events yet.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {events.map((e) => (
                  <li key={e.id} className="rounded-md border border-line bg-surface-raised px-4 py-3">
                    <p className="text-sm font-medium text-ink-primary">{e.event_type.replace(/_/g, " ")}</p>
                    {e.description && <p className="text-sm text-ink-secondary">{e.description}</p>}
                    <p className="mt-1 text-xs text-ink-muted">{new Date(e.occurred_at).toLocaleString()}</p>
                  </li>
                ))}
              </ol>
            )}
            {analystDecisions.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Analyst decisions</h3>
                <div className="flex flex-col gap-2">
                  {analystDecisions.map((d) => (
                    <div key={d.id} className="rounded-md bg-surface-sunken px-3 py-2 text-sm">
                      <p className="font-medium text-ink-primary">
                        {d.decision} — {d.agreed_with_ai ? "agreed with AI" : "diverged from AI"}
                      </p>
                      {d.notes && <p className="text-ink-secondary">{d.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
          <TabsContent value="audit">
            <AuditTimeline organizationId={theCase.organization_id} alertId={theCase.alert_id ?? undefined} />
          </TabsContent>
        </Tabs>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Case details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <Row label="Priority" value={theCase.priority} />
              <Row label="Opened" value={new Date(theCase.opened_at).toLocaleString()} />
              <Row label="Resolved" value={theCase.resolved_at ? new Date(theCase.resolved_at).toLocaleString() : "—"} />
              <Row label="Disposition" value={theCase.disposition?.replace(/_/g, " ") ?? "—"} />
              {theCase.resolution_reason && <p className="text-ink-secondary">{theCase.resolution_reason}</p>}
            </CardContent>
          </Card>

          {!isResolved && (
            <ResolveCaseCard caseId={theCase.id} onResolved={refetch} />
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-medium text-ink-primary">{value}</span>
    </div>
  );
}

function ResolveCaseCard({ caseId, onResolved }: { caseId: string; onResolved: () => void }) {
  const { identity } = useSession();
  const [disposition, setDisposition] = useState<CaseDisposition>("FALSE_POSITIVE");
  const [resolutionReason, setResolutionReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identity) return;
    setSubmitting(true);
    setError(null);
    try {
      await postJson(`/api/cases/${caseId}/resolve`, {
        analystId: identity.userId,
        disposition,
        resolutionReason,
      });
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve the case.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resolve case</CardTitle>
        <CardDescription>The final, human-recorded outcome of this investigation.</CardDescription>
      </CardHeader>
      <CardContent>
        <RoleGate
          test={canResolveCases}
          fallback={<p className="text-sm text-ink-muted">Your role cannot resolve cases.</p>}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="disposition" className="text-xs font-medium text-ink-secondary">
                Disposition
              </label>
              <select
                id="disposition"
                value={disposition}
                onChange={(e) => setDisposition(e.target.value as CaseDisposition)}
                className="rounded-md border border-line px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {DISPOSITIONS.map((d) => (
                  <option key={d} value={d}>
                    {d.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="resolutionReason" className="text-xs font-medium text-ink-secondary">
                Resolution reason (required)
              </label>
              <textarea
                id="resolutionReason"
                required
                rows={3}
                value={resolutionReason}
                onChange={(e) => setResolutionReason(e.target.value)}
                className="rounded-md border border-line px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              />
            </div>
            {error && (
              <p role="alert" className="text-xs text-status-critical">
                {error}
              </p>
            )}
            <Button type="submit" disabled={submitting || resolutionReason.trim().length === 0}>
              {submitting ? "Resolving…" : "Resolve case"}
            </Button>
          </form>
        </RoleGate>
      </CardContent>
    </Card>
  );
}
