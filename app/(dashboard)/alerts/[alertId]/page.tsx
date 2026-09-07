"use client";

import Link from "next/link";

import { useSession } from "../../../../lib/auth/session.js";
import { useApiQuery } from "../../../../lib/api/useApiQuery.js";
import type {
  AiRecommendation,
  Alert,
  AnalystDecision,
  Case,
  Customer,
  CustomerProfile,
  MlPrediction,
  RiskSignal,
  Transaction,
} from "../../../../lib/supabase/types.js";
import { SeverityBadge, InvestigationStatusBadge, CaseStatusBadge } from "../../../../components/domain/badges.js";
import { InvestigationProgress } from "../../../../components/domain/InvestigationProgress.js";
import { RecommendationPanel } from "../../../../components/domain/RecommendationPanel.js";
import { HumanReviewPanel } from "../../../../components/domain/HumanReviewPanel.js";
import { AuditTimeline } from "../../../../components/domain/AuditTimeline.js";
import { asStringList } from "../../../../lib/ui/json.js";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../../../components/ui/card.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../../components/ui/tabs.js";
import { ErrorState, LoadingState } from "../../../../components/ui/states.js";
import { Table, TableContainer, Tbody, Td, Th, Thead, Tr } from "../../../../components/ui/table.js";

interface WorkspaceResponse {
  alert: Alert;
  customer: Customer | null;
  customerProfile: CustomerProfile | null;
  transaction: Transaction | null;
  recentTransactions: Transaction[];
  riskSignals: RiskSignal[];
  mlPrediction: MlPrediction | null;
  recommendation: AiRecommendation | null;
  case: Case | null;
  analystDecisions: AnalystDecision[];
}

export default function InvestigationWorkspacePage({ params }: { params: { alertId: string } }) {
  const { identity } = useSession();
  const url = identity
    ? `/api/alerts/${params.alertId}/workspace?organizationId=${identity.organizationId}`
    : null;
  const { data, error, loading, refetch } = useApiQuery<WorkspaceResponse>(url);

  if (loading) return <LoadingState label="Loading investigation…" />;
  if (error) return <ErrorState detail={error} onRetry={refetch} />;
  if (!data) return null;

  const { alert, customer, customerProfile, recentTransactions, riskSignals, mlPrediction, recommendation, case: theCase, analystDecisions } = data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <p className="font-mono text-xs text-ink-muted">{alert.id}</p>
          <h1 className="text-2xl font-semibold text-ink-primary">
            {alert.alert_type.replace(/_/g, " ")} — {customer?.full_name ?? "Unknown customer"}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <SeverityBadge severity={alert.severity} />
            <InvestigationStatusBadge status={alert.status} />
            {theCase && (
              <Link href={`/cases/${theCase.id}`} className="text-xs text-brand-600 hover:underline">
                View case {theCase.case_number}
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="ai">AI investigation</TabsTrigger>
            <TabsTrigger value="review">Human review</TabsTrigger>
            <TabsTrigger value="audit">Audit trail</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex flex-col gap-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Customer profile</CardTitle>
                  <CardDescription>Why this customer's baseline matters for this alert.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-1.5 text-sm">
                  <Row label="Name" value={customer?.full_name ?? "—"} />
                  <Row label="Risk rating" value={customer?.risk_rating ?? "—"} />
                  <Row label="KYC status" value={customer?.kyc_status ?? "—"} />
                  <Row label="Sanctions status" value={customerProfile?.sanctions_status ?? "—"} />
                  <Row
                    label="Account opened"
                    value={customer ? new Date(customer.account_opened_at).toLocaleDateString() : "—"}
                  />
                  <Row label="Typical countries" value={(customerProfile?.typical_countries ?? []).join(", ") || "—"} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Why this alert fired</CardTitle>
                  <CardDescription>Triggered rules and deterministic risk signals.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm">
                  <Row label="Triggered rules" value={asStringList(alert.triggered_rules).join(", ") || "—"} />
                  <Row label="Risk score" value={alert.risk_score !== null ? alert.risk_score.toFixed(2) : "—"} />
                  {riskSignals.length === 0 ? (
                    <p className="text-ink-muted">No deterministic risk signals recorded.</p>
                  ) : (
                    <ul className="mt-1 flex flex-col gap-1.5">
                      {riskSignals.map((s) => (
                        <li key={s.id} className="rounded-md bg-surface-sunken px-3 py-2">
                          <span className="font-medium">{s.signal_type.replace(/_/g, " ")}</span>
                          {s.description && <span className="text-ink-muted"> — {s.description}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>ML prediction</CardTitle>
                <CardDescription>The deterministic model's assessment — one input among several.</CardDescription>
              </CardHeader>
              <CardContent>
                {mlPrediction ? (
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <Row label="Prediction" value={mlPrediction.prediction} />
                    <Row label="Score" value={mlPrediction.score.toFixed(2)} />
                    <Row label="Confidence" value={mlPrediction.confidence !== null ? mlPrediction.confidence.toFixed(2) : "—"} />
                    <Row label="Model" value={`${mlPrediction.provider}/${mlPrediction.model_name}`} />
                  </div>
                ) : (
                  <p className="text-sm text-ink-muted">No ML prediction was available for this alert.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Transaction history</CardTitle>
                <CardDescription>Recent transactions on this customer's account.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <TableContainer className="rounded-none border-0">
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>Date</Th>
                        <Th>Direction</Th>
                        <Th>Amount</Th>
                        <Th>Channel</Th>
                        <Th>Counterparty country</Th>
                        <Th>Device</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {recentTransactions.length === 0 ? (
                        <Tr>
                          <Td colSpan={6} className="text-center text-ink-muted">
                            No transaction history available.
                          </Td>
                        </Tr>
                      ) : (
                        recentTransactions.map((t) => (
                          <Tr key={t.id}>
                            <Td>{new Date(t.transaction_at).toLocaleString()}</Td>
                            <Td>{t.direction}</Td>
                            <Td>${t.amount.toLocaleString()}</Td>
                            <Td>{t.channel}</Td>
                            <Td>{t.counterparty_country ?? "—"}</Td>
                            <Td>{t.device_is_new ? "New device" : "Known device"}</Td>
                          </Tr>
                        ))
                      )}
                    </Tbody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ai">
            {recommendation ? (
              <RecommendationPanel recommendation={recommendation} />
            ) : (
              <p className="text-sm text-ink-muted">No AI recommendation has been generated for this alert yet.</p>
            )}
          </TabsContent>

          <TabsContent value="review" className="flex flex-col gap-6">
            <HumanReviewPanel
              alertId={alert.id}
              organizationId={alert.organization_id}
              recommendation={recommendation}
              onReviewed={refetch}
            />
            {analystDecisions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Prior decisions</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm">
                  {analystDecisions.map((d) => (
                    <div key={d.id} className="rounded-md bg-surface-sunken px-3 py-2">
                      <p className="font-medium text-ink-primary">
                        {d.decision} — {d.agreed_with_ai ? "agreed with AI" : "diverged from AI"}
                      </p>
                      {d.notes && <p className="text-ink-secondary">{d.notes}</p>}
                      <p className="text-xs text-ink-muted">{new Date(d.decided_at).toLocaleString()}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="audit">
            <AuditTimeline organizationId={alert.organization_id} alertId={alert.id} />
          </TabsContent>
        </Tabs>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Investigation progress</CardTitle>
            </CardHeader>
            <CardContent>
              <InvestigationProgress currentStatus={alert.status} />
            </CardContent>
          </Card>
          {theCase && (
            <Card>
              <CardHeader>
                <CardTitle>Case</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <Row label="Case number" value={theCase.case_number} />
                <div className="flex items-center gap-2">
                  <span className="text-ink-muted">Status</span>
                  <CaseStatusBadge status={theCase.status} />
                </div>
                <Row label="Priority" value={theCase.priority} />
                <Link href={`/cases/${theCase.id}`} className="text-xs font-medium text-brand-600 hover:underline">
                  Open full case →
                </Link>
              </CardContent>
            </Card>
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
