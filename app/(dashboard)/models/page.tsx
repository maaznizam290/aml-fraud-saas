"use client";

import { useSession } from "../../../lib/auth/session.js";
import { useApiQuery } from "../../../lib/api/useApiQuery.js";
import type { ModelVersion, RuleVersion } from "../../../lib/hermes/types.js";
import { GovernanceStatusBadge } from "../../../components/domain/badges.js";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../../components/ui/card.js";
import { EmptyState, ErrorState, LoadingState } from "../../../components/ui/states.js";
import { Table, TableContainer, Tbody, Td, Th, Thead, Tr } from "../../../components/ui/table.js";

interface ModelsResponse {
  models: ModelVersion[];
  rules: RuleVersion[];
  degraded: boolean;
}

function formatMetrics(metrics: unknown): string {
  if (!metrics || typeof metrics !== "object") return "—";
  const entries = Object.entries(metrics as Record<string, unknown>);
  if (entries.length === 0) return "—";
  return entries.map(([k, v]) => `${k}: ${typeof v === "number" ? v.toFixed(3) : String(v)}`).join(" · ");
}

export default function ModelRegistryPage() {
  const { identity } = useSession();
  const url = identity ? `/api/models?organizationId=${identity.organizationId}` : null;
  const { data, error, loading, refetch } = useApiQuery<ModelsResponse>(url);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-primary">Model Registry</h1>
        <p className="text-sm text-ink-muted">
          Every ML model and rule version this organization has registered — read-only. Deploying a new version
          requires governance approval, not a click here.
        </p>
      </div>

      {loading && <LoadingState label="Loading registry…" />}
      {error && <ErrorState detail={error} onRetry={refetch} />}
      {data?.degraded && (
        <p className="rounded-md bg-status-warning/10 px-3 py-2 text-xs text-[#8a5a00]">
          The learning layer is temporarily unavailable — this list may be incomplete.
        </p>
      )}

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>ML models</CardTitle>
              <CardDescription>Fraud/AML scoring models.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {data.models.length === 0 ? (
                <div className="p-5">
                  <EmptyState title="No model versions registered" />
                </div>
              ) : (
                <TableContainer className="rounded-none border-0">
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>Model</Th>
                        <Th>Version</Th>
                        <Th>Provider</Th>
                        <Th>Algorithm</Th>
                        <Th>Metrics</Th>
                        <Th>Deployment state</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {data.models.map((m) => (
                        <Tr key={m.id}>
                          <Td className="font-medium">{m.model_name}</Td>
                          <Td>{m.version}</Td>
                          <Td>{m.provider}</Td>
                          <Td>{m.model_type}</Td>
                          <Td className="text-xs text-ink-secondary">{formatMetrics(m.metrics)}</Td>
                          <Td>
                            <GovernanceStatusBadge status={m.status} />
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rule versions</CardTitle>
              <CardDescription>Deterministic detection rules.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {data.rules.length === 0 ? (
                <div className="p-5">
                  <EmptyState title="No rule versions registered" />
                </div>
              ) : (
                <TableContainer className="rounded-none border-0">
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>Rule</Th>
                        <Th>Version</Th>
                        <Th>Deployment state</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {data.rules.map((r) => (
                        <Tr key={r.id}>
                          <Td className="font-medium">{r.rule_name}</Td>
                          <Td>{r.version}</Td>
                          <Td>
                            <GovernanceStatusBadge status={r.status} />
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
