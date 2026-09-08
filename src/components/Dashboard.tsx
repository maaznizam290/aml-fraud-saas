import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listAlerts,
  listHermesRules,
  promoteHermesRule,
  resolveAlert,
  subscribeToDashboardEvents,
  synthesizeHermesRules,
} from "../lib/api.js";
import type { AlertStatus, AlertWithTransaction, DashboardEvent, HermesRule } from "../types.js";

type AlertTab = Extract<AlertStatus, "OPEN" | "RESOLVED_APPROVED" | "RESOLVED_BLOCKED">;

const TABS: { key: AlertTab; label: string }[] = [
  { key: "OPEN", label: "Active / Pending Review" },
  { key: "RESOLVED_APPROVED", label: "Approved" },
  { key: "RESOLVED_BLOCKED", label: "Blocked" },
];

function riskBadgeClass(risk: string): string {
  if (risk === "HIGH") return "bg-red-900 text-red-200";
  if (risk === "MEDIUM") return "bg-amber-900 text-amber-200";
  return "bg-emerald-900 text-emerald-200";
}

function ruleStatusBadgeClass(status: string): string {
  if (status === "DEPLOYED") return "bg-emerald-900 text-emerald-200";
  if (status === "ARCHIVED") return "bg-slate-700 text-slate-300";
  return "bg-amber-900 text-amber-200";
}

interface DashboardProps {
  /** x-user-id sent with analyst decisions and rule promotions — a simple
   *  role stand-in for this MVP (see server/routes/hermes.ts for the real
   *  chief_compliance_officer authorization check this maps to). */
  currentUserId: string;
  currentUserRole: "analyst" | "chief_compliance_officer";
}

/**
 * Compliance Analyst Workspace: active/pending/approved/blocked alert
 * tracking, an investigation view per alert, and the Hermes governance
 * rule deck. Updates live via Server-Sent Events (in-memory store mode)
 * — Supabase Realtime is a drop-in swap at src/lib/api.ts's
 * subscribeToDashboardEvents once Supabase is configured.
 */
export default function Dashboard({ currentUserId, currentUserRole }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<AlertTab>("OPEN");
  const [alerts, setAlerts] = useState<AlertWithTransaction[]>([]);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [rules, setRules] = useState<HermesRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);

  const refreshAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { alerts: fetched } = await listAlerts(activeTab);
      setAlerts(fetched);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const refreshRules = useCallback(async () => {
    try {
      const { rules: fetched } = await listHermesRules();
      setRules(fetched);
    } catch (err) {
      console.error("Failed to load Hermes rules", err);
    }
  }, []);

  useEffect(() => {
    void refreshAlerts();
  }, [refreshAlerts]);

  useEffect(() => {
    void refreshRules();
  }, [refreshRules]);

  useEffect(() => {
    const unsubscribe = subscribeToDashboardEvents((raw) => {
      try {
        const event = JSON.parse(raw) as DashboardEvent;
        if (event.type === "alert.created" || event.type === "alert.resolved") {
          void refreshAlerts();
        } else {
          void refreshRules();
        }
      } catch {
        // ignore malformed/heartbeat payloads
      }
    });
    return unsubscribe;
  }, [refreshAlerts, refreshRules]);

  const selectedAlert = useMemo(
    () => alerts.find((a) => a.id === selectedAlertId) ?? null,
    [alerts, selectedAlertId],
  );

  async function handleResolve(decision: "APPROVE" | "BLOCK") {
    if (!selectedAlert) return;
    setResolving(true);
    try {
      await resolveAlert(selectedAlert.id, decision, currentUserId);
      setSelectedAlertId(null);
      await refreshAlerts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve alert");
    } finally {
      setResolving(false);
    }
  }

  async function handleSynthesize() {
    setSynthesizing(true);
    try {
      await synthesizeHermesRules();
      await refreshRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hermes synthesis failed");
    } finally {
      setSynthesizing(false);
    }
  }

  async function handlePromote(ruleId: string) {
    try {
      await promoteHermesRule(ruleId, currentUserId);
      await refreshRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to promote rule");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {error && (
        <div className="col-span-full rounded border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Alert queue */}
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-4 lg:col-span-2">
        <div className="mb-3 flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setSelectedAlertId(null);
              }}
              className={`rounded px-3 py-1.5 text-xs font-medium ${
                activeTab === tab.key
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading && <p className="text-sm text-slate-400">Loading alerts…</p>}
        {!loading && alerts.length === 0 && (
          <p className="text-sm text-slate-500">No alerts in this queue.</p>
        )}

        <ul className="divide-y divide-slate-800">
          {alerts.map((alert) => (
            <li key={alert.id}>
              <button
                onClick={() => setSelectedAlertId(alert.id)}
                className={`flex w-full items-center justify-between px-2 py-3 text-left hover:bg-slate-800 ${
                  selectedAlertId === alert.id ? "bg-slate-800" : ""
                }`}
              >
                <div>
                  <p className="font-mono text-sm text-slate-100">{alert.transaction_id}</p>
                  <p className="text-xs text-slate-500">
                    PKR {alert.transaction.amount_pkr.toLocaleString()} · score{" "}
                    {alert.transaction.ml_score?.toFixed(2) ?? "n/a"}
                  </p>
                </div>
                <span className={`rounded px-2 py-0.5 text-xs ${riskBadgeClass(alert.risk_level)}`}>
                  {alert.risk_level}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Investigation view */}
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Investigation View
        </h2>
        {!selectedAlert && (
          <p className="text-sm text-slate-500">Select an alert to inspect its details.</p>
        )}
        {selectedAlert && (
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-slate-400">Transaction</p>
              <p className="font-mono text-slate-100">{selectedAlert.transaction.id}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
              <p>Amount: PKR {selectedAlert.transaction.amount_pkr.toLocaleString()}</p>
              <p>Sender: {selectedAlert.transaction.sender_id}</p>
              <p>Recipient: {selectedAlert.transaction.recipient_id}</p>
              <p>ML score: {selectedAlert.transaction.ml_score?.toFixed(3) ?? "n/a"}</p>
              {selectedAlert.transaction.ml_features && (
                <>
                  <p>Velocity (24h): {selectedAlert.transaction.ml_features.velocity_last_24h}</p>
                  <p>Account age: {selectedAlert.transaction.ml_features.account_age_days}d</p>
                  <p>Device risk: {selectedAlert.transaction.ml_features.device_risk_score}</p>
                </>
              )}
            </div>
            <div>
              <p className="mb-1 text-slate-400">Hermes Agent Synthesis</p>
              <p className="rounded bg-slate-800 p-2 text-xs leading-relaxed text-slate-200">
                {selectedAlert.hermes_brief ?? "No synthesis available for this alert."}
              </p>
            </div>
            {selectedAlert.status === "OPEN" && (
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => handleResolve("APPROVE")}
                  disabled={resolving}
                  className="flex-1 rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  APPROVE TRANSACTION
                </button>
                <button
                  onClick={() => handleResolve("BLOCK")}
                  disabled={resolving}
                  className="flex-1 rounded bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                >
                  CONFIRM FRAUD / BLOCK
                </button>
              </div>
            )}
            {selectedAlert.status !== "OPEN" && (
              <p className="text-xs text-slate-500">
                Resolved: {selectedAlert.status} by {selectedAlert.assigned_analyst ?? "unknown analyst"}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Hermes governance rule deck */}
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-4 lg:col-span-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Hermes Governance Rule Deck
          </h2>
          <button
            onClick={handleSynthesize}
            disabled={synthesizing}
            className="rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            {synthesizing ? "Synthesizing…" : "Run Hermes Synthesis"}
          </button>
        </div>

        {rules.length === 0 && (
          <p className="text-sm text-slate-500">
            No proposed rules yet. Resolve some alerts, then run synthesis.
          </p>
        )}

        <ul className="space-y-2">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex items-center justify-between rounded bg-slate-800 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-slate-100">{rule.rule_name}</p>
                <p className="text-xs text-slate-500">
                  Backtest accuracy:{" "}
                  {rule.accuracy_rating !== null ? `${(rule.accuracy_rating * 100).toFixed(0)}%` : "n/a"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs ${ruleStatusBadgeClass(rule.status)}`}>
                  {rule.status}
                </span>
                {rule.status === "PENDING" && (
                  <button
                    onClick={() => handlePromote(rule.id)}
                    disabled={currentUserRole !== "chief_compliance_officer"}
                    title={
                      currentUserRole !== "chief_compliance_officer"
                        ? "Only a Chief Compliance Officer may deploy a Hermes rule"
                        : undefined
                    }
                    className="rounded bg-indigo-700 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Promote to DEPLOYED
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
