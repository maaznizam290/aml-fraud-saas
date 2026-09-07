"use client";

import { useMemo } from "react";
import {
  Bell,
  Brain,
  FileSearch,
  Gavel,
  History,
  ScanSearch,
  ShieldCheck,
  User,
} from "lucide-react";

import { useApiQuery } from "../../lib/api/useApiQuery.js";
import type { AuditLog } from "../../lib/supabase/types.js";
import { EmptyState, ErrorState, LoadingState } from "../ui/states.js";

interface AuditResponse {
  items: AuditLog[];
  hermesAvailable: boolean;
  hermesDegraded: boolean;
}

/** Maps an audit action's entity_type to the icon/section it belongs to
 * in the required timeline (task section 3: "alert, evidence, ML, AI,
 * analyst, case, notifications, learning events"). */
function iconFor(entry: AuditLog) {
  if (entry.action.includes("learning") || entry.entity_type === "agent_feedback" || entry.entity_type === "agent_skill")
    return Brain;
  if (entry.action.includes("ml_prediction")) return ScanSearch;
  if (entry.action.includes("claude") || entry.action.includes("ai_recommendation")) return Brain;
  if (entry.action.includes("evidence")) return FileSearch;
  if (entry.action.includes("notification")) return Bell;
  if (entry.entity_type === "case" || entry.action.includes("case")) return Gavel;
  if (entry.action.includes("analyst")) return User;
  if (entry.entity_type === "learning_candidate") return ShieldCheck;
  return History;
}

export function AuditTimeline({ organizationId, alertId }: { organizationId: string; alertId?: string }) {
  const url = useMemo(() => {
    const params = new URLSearchParams({ organizationId, limit: "200" });
    if (alertId) params.set("alertId", alertId);
    return `/api/audit?${params.toString()}`;
  }, [organizationId, alertId]);

  const { data, error, loading, refetch } = useApiQuery<AuditResponse>(url);

  if (loading) return <LoadingState label="Loading audit trail…" />;
  if (error) return <ErrorState detail={error} onRetry={refetch} />;
  if (!data || data.items.length === 0) {
    return <EmptyState title="No audit events yet" description="Actions taken on this investigation will appear here." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {data.hermesDegraded && (
        <p className="rounded-md bg-status-warning/10 px-3 py-2 text-xs text-[#8a5a00]">
          Learning-layer audit events are temporarily unavailable — every other event below is unaffected.
        </p>
      )}
      <ol className="flex flex-col gap-0 border-l-2 border-line pl-5">
        {data.items.map((entry) => {
          const Icon = iconFor(entry);
          return (
            <li key={entry.id} className="relative pb-6">
              <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                <Icon className="h-3 w-3" aria-hidden="true" />
              </span>
              <p className="text-sm font-medium text-ink-primary">{formatAction(entry.action)}</p>
              <p className="text-xs text-ink-muted">
                {new Date(entry.created_at).toLocaleString()}
                {entry.actor_role ? ` · ${entry.actor_role}` : ""}
                {entry.entity_type ? ` · ${entry.entity_type}` : ""}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function formatAction(action: string): string {
  return action
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}
