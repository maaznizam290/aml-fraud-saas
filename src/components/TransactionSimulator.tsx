import { useState, type FormEvent } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

interface SimulationResult {
  transaction: { id: string; status: string; ml_score: number | null };
  alert: { id: string; risk_level: string } | null;
  scoreSource: "ml-engine" | "fallback-heuristic";
}

const DEFAULT_FORM = {
  amountPkr: 75000,
  senderId: "sender-demo-1",
  recipientId: "recipient-demo-1",
  velocityLast24h: 3,
  accountAgeDays: 1.5,
  deviceRiskScore: 0.6,
};

/**
 * Demo transaction-ingress form. Lets an investor/demo operator push a
 * synthetic transaction through POST /api/v1/fraud/evaluate to see the
 * full pipeline (ML score -> triage -> alert -> Hermes brief) run live.
 */
export default function TransactionSimulator({ onEvaluated }: { onEvaluated: () => void }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${API_BASE}/fraud/evaluate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Evaluation failed");
      setResult(body);
      onEvaluated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Transaction Simulator
      </h2>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="flex flex-col text-xs text-slate-400">
          Amount (PKR)
          <input
            type="number"
            min={1}
            value={form.amountPkr}
            onChange={(e) => setForm({ ...form, amountPkr: Number(e.target.value) })}
            className="mt-1 rounded bg-slate-800 px-2 py-1 text-slate-100"
          />
        </label>
        <label className="flex flex-col text-xs text-slate-400">
          Velocity (24h)
          <input
            type="number"
            min={0}
            value={form.velocityLast24h}
            onChange={(e) => setForm({ ...form, velocityLast24h: Number(e.target.value) })}
            className="mt-1 rounded bg-slate-800 px-2 py-1 text-slate-100"
          />
        </label>
        <label className="flex flex-col text-xs text-slate-400">
          Account age (days)
          <input
            type="number"
            min={0}
            step="0.1"
            value={form.accountAgeDays}
            onChange={(e) => setForm({ ...form, accountAgeDays: Number(e.target.value) })}
            className="mt-1 rounded bg-slate-800 px-2 py-1 text-slate-100"
          />
        </label>
        <label className="flex flex-col text-xs text-slate-400">
          Device risk (0-1)
          <input
            type="number"
            min={0}
            max={1}
            step="0.05"
            value={form.deviceRiskScore}
            onChange={(e) => setForm({ ...form, deviceRiskScore: Number(e.target.value) })}
            className="mt-1 rounded bg-slate-800 px-2 py-1 text-slate-100"
          />
        </label>
        <label className="flex flex-col text-xs text-slate-400">
          Sender ID
          <input
            value={form.senderId}
            onChange={(e) => setForm({ ...form, senderId: e.target.value })}
            className="mt-1 rounded bg-slate-800 px-2 py-1 text-slate-100"
          />
        </label>
        <label className="flex flex-col text-xs text-slate-400">
          Recipient ID
          <input
            value={form.recipientId}
            onChange={(e) => setForm({ ...form, recipientId: e.target.value })}
            className="mt-1 rounded bg-slate-800 px-2 py-1 text-slate-100"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="col-span-2 rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 sm:col-span-3"
        >
          {submitting ? "Evaluating…" : "Submit Transaction"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {result && (
        <p className="mt-3 text-sm text-slate-300">
          Transaction <span className="font-mono">{result.transaction.id}</span> →{" "}
          <span className="font-semibold">{result.transaction.status}</span> (score{" "}
          {result.transaction.ml_score?.toFixed(2)}, via {result.scoreSource})
          {result.alert && " — alert created for analyst review"}
        </p>
      )}
    </section>
  );
}
