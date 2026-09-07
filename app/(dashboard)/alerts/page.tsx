"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { useSession } from "../../../lib/auth/session.js";
import { useApiQuery } from "../../../lib/api/useApiQuery.js";
import type { AlertListItem } from "../../../lib/orchestration/store.js";
import type { AlertSeverity, InvestigationState } from "../../../lib/supabase/types.js";
import { SeverityBadge, InvestigationStatusBadge } from "../../../components/domain/badges.js";
import { EmptyState, ErrorState, LoadingState } from "../../../components/ui/states.js";
import { Table, TableContainer, Tbody, Td, Th, Thead, Tr } from "../../../components/ui/table.js";

interface AlertsResponse {
  items: AlertListItem[];
  total: number;
}

const STATUS_OPTIONS: InvestigationState[] = [
  "RECEIVED",
  "ANALYZING",
  "EVIDENCE_COLLECTED",
  "AI_INVESTIGATING",
  "RECOMMENDATION_READY",
  "HUMAN_REVIEW",
  "RESOLVED",
];
const SEVERITY_OPTIONS: AlertSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function formatAmount(amount: number | null): string {
  if (amount === null) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    amount
  );
}

export default function AlertCenterPage() {
  const { identity } = useSession();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InvestigationState | "">("");
  const [severity, setSeverity] = useState<AlertSeverity | "">("");

  const url = useMemo(() => {
    if (!identity) return null;
    const params = new URLSearchParams({ organizationId: identity.organizationId, limit: "100" });
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (severity) params.set("severity", severity);
    return `/api/alerts?${params.toString()}`;
  }, [identity, search, status, severity]);

  const { data, error, loading, refetch } = useApiQuery<AlertsResponse>(url);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-primary">Alert Center</h1>
        <p className="text-sm text-ink-muted">Every alert this organization has received, newest first.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-muted" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search alert or customer ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search alerts"
            className="w-64 rounded-md border border-line py-2 pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          />
        </div>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value as InvestigationState | "")}
          className="rounded-md border border-line px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by severity"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as AlertSeverity | "")}
          className="rounded-md border border-line px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <option value="">All severities</option>
          {SEVERITY_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {loading && <LoadingState label="Loading alerts…" />}
      {error && <ErrorState detail={error} onRetry={refetch} />}

      {data && data.items.length === 0 && (
        <EmptyState title="No alerts match these filters" description="Try widening your search or clearing a filter." />
      )}

      {data && data.items.length > 0 && (
        <TableContainer>
          <Table>
            <Thead>
              <Tr>
                <Th>Alert ID</Th>
                <Th>Customer</Th>
                <Th>Amount</Th>
                <Th>Risk level</Th>
                <Th>ML score</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th>Analyst</Th>
              </Tr>
            </Thead>
            <Tbody>
              {data.items.map((alert) => (
                <Tr key={alert.id} clickable onClick={() => router.push(`/alerts/${alert.id}`)}>
                  <Td className="font-mono text-xs">{alert.id.slice(0, 12)}…</Td>
                  <Td className="font-mono text-xs">{alert.customer_id.slice(0, 12)}…</Td>
                  <Td>{formatAmount(alert.transactionAmount)}</Td>
                  <Td>
                    <SeverityBadge severity={alert.severity} />
                  </Td>
                  <Td>{alert.ml_score !== null ? alert.ml_score.toFixed(2) : "—"}</Td>
                  <Td>{alert.alert_type.replace(/_/g, " ")}</Td>
                  <Td>
                    <InvestigationStatusBadge status={alert.status} />
                  </Td>
                  <Td>{new Date(alert.created_at).toLocaleString()}</Td>
                  <Td>{alert.assigned_analyst_id ? alert.assigned_analyst_id.slice(0, 8) : "Unassigned"}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
}
