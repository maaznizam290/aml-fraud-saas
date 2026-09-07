"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useSession } from "../../../lib/auth/session.js";
import { useApiQuery } from "../../../lib/api/useApiQuery.js";
import type { Case, CasePriority, CaseStatus } from "../../../lib/supabase/types.js";
import { CaseStatusBadge } from "../../../components/domain/badges.js";
import { EmptyState, ErrorState, LoadingState } from "../../../components/ui/states.js";
import { Table, TableContainer, Tbody, Td, Th, Thead, Tr } from "../../../components/ui/table.js";

interface CasesResponse {
  items: Case[];
  total: number;
}

const STATUS_OPTIONS: CaseStatus[] = ["OPEN", "IN_PROGRESS", "PENDING_REVIEW", "RESOLVED", "CLOSED", "REOPENED"];
const PRIORITY_OPTIONS: CasePriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export default function CasesPage() {
  const { identity } = useSession();
  const router = useRouter();
  const [status, setStatus] = useState<CaseStatus | "">("");
  const [priority, setPriority] = useState<CasePriority | "">("");

  const url = useMemo(() => {
    if (!identity) return null;
    const params = new URLSearchParams({ organizationId: identity.organizationId, limit: "100" });
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    return `/api/cases?${params.toString()}`;
  }, [identity, status, priority]);

  const { data, error, loading, refetch } = useApiQuery<CasesResponse>(url);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-primary">Cases</h1>
        <p className="text-sm text-ink-muted">Open and resolved investigations, grouped by case.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value as CaseStatus | "")}
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
          aria-label="Filter by priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as CasePriority | "")}
          className="rounded-md border border-line px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <option value="">All priorities</option>
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {loading && <LoadingState label="Loading cases…" />}
      {error && <ErrorState detail={error} onRetry={refetch} />}
      {data && data.items.length === 0 && (
        <EmptyState title="No cases match these filters" description="Cases are created automatically once an alert reaches human review." />
      )}

      {data && data.items.length > 0 && (
        <TableContainer>
          <Table>
            <Thead>
              <Tr>
                <Th>Case</Th>
                <Th>Status</Th>
                <Th>Priority</Th>
                <Th>Analyst</Th>
                <Th>Disposition</Th>
                <Th>Opened</Th>
                <Th>Resolved</Th>
              </Tr>
            </Thead>
            <Tbody>
              {data.items.map((c) => (
                <Tr key={c.id} clickable onClick={() => router.push(`/cases/${c.id}`)}>
                  <Td className="font-medium">{c.case_number}</Td>
                  <Td>
                    <CaseStatusBadge status={c.status} />
                  </Td>
                  <Td>{c.priority}</Td>
                  <Td>{c.assigned_analyst_id ? c.assigned_analyst_id.slice(0, 8) : "Unassigned"}</Td>
                  <Td>{c.disposition ? c.disposition.replace(/_/g, " ") : "—"}</Td>
                  <Td>{new Date(c.opened_at).toLocaleDateString()}</Td>
                  <Td>{c.resolved_at ? new Date(c.resolved_at).toLocaleDateString() : "—"}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
}
