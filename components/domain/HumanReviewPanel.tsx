"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";

import { useSession } from "../../lib/auth/session.js";
import { canReviewAlerts } from "../../lib/auth/roles.js";
import { postJson } from "../../lib/api/mutate.js";
import type { AiRecommendation, RecommendationDisposition } from "../../lib/supabase/types.js";
import { RoleGate } from "../RoleGate.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card.js";

export interface HumanReviewOutcome {
  alertId: string;
  caseId: string;
  decision: RecommendationDisposition;
  agreedWithAi: boolean;
  overrideReason: string | null;
}

type Action = "APPROVE" | "REJECT" | "OVERRIDE";
const DISPOSITIONS: RecommendationDisposition[] = ["ESCALATE", "CLEAR", "REFER"];

/**
 * The human-in-the-loop checkpoint (task section 8): the analyst — never
 * the AI — records the binding decision here. Calls the existing
 * POST /api/investigations/:alertId/review, then best-effort records the
 * decision as a Hermes learning event (a Hermes failure here must never
 * block or undo the review itself — see docs/HERMES.md "Failure behavior").
 */
export function HumanReviewPanel({
  alertId,
  organizationId,
  recommendation,
  onReviewed,
}: {
  alertId: string;
  organizationId: string;
  recommendation: AiRecommendation | null;
  onReviewed?: (outcome: HumanReviewOutcome) => void;
}) {
  const { identity } = useSession();
  const [action, setAction] = useState<Action>("APPROVE");
  const [overrideDisposition, setOverrideDisposition] = useState<RecommendationDisposition>("ESCALATE");
  const [rationale, setRationale] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<HumanReviewOutcome | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identity) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await postJson<HumanReviewOutcome>(`/api/investigations/${alertId}/review`, {
        analystId: identity.userId,
        action,
        overrideDisposition: action === "OVERRIDE" ? overrideDisposition : undefined,
        rationale,
      });
      setOutcome(result);
      onReviewed?.(result);

      // Best-effort learning-event capture — never blocks or reverts the
      // review above if Hermes is unavailable.
      void postJson("/api/hermes/feedback", {
        organizationId,
        alertId,
        caseId: result.caseId,
        analystDecisionId: `${alertId}:${identity.userId}:${Date.now()}`,
        analystId: identity.userId,
        action,
        decision: result.decision,
        agreedWithAi: result.agreedWithAi,
        aiRecommendationId: recommendation?.id ?? null,
        aiDisposition: recommendation?.disposition ?? null,
        mlScore: null,
        mlPrediction: null,
        finalCaseDisposition: null,
        rationale,
      }).catch(() => {
        // Intentionally ignored — see module docstring.
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record the review.");
    } finally {
      setSubmitting(false);
    }
  }

  if (outcome) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Review recorded</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-primary">
            Decision: <strong>{outcome.decision}</strong> — {outcome.agreedWithAi ? "agreed with the AI" : "diverged from the AI"}
            . This alert's case (<code className="text-xs">{outcome.caseId.slice(0, 8)}…</code>) is now in progress.
            Resolve it from the Cases page once the investigation concludes.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-brand-600" aria-hidden="true" /> Human review
        </CardTitle>
        <CardDescription>
          The AI recommends. You decide. Nothing is filed, closed, or moved until you record a decision here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RoleGate
          test={canReviewAlerts}
          fallback={
            <p className="rounded-md bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
              Your role can view this investigation but cannot record a review decision.
            </p>
          }
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-xs font-medium text-ink-secondary">Decision</legend>
              {(["APPROVE", "REJECT", "OVERRIDE"] as Action[]).map((opt) => (
                <label key={opt} className="flex items-center gap-2 text-sm text-ink-primary">
                  <input
                    type="radio"
                    name="action"
                    value={opt}
                    checked={action === opt}
                    onChange={() => setAction(opt)}
                    className="h-4 w-4"
                  />
                  {opt === "APPROVE" && "Approve — accept the AI's recommendation"}
                  {opt === "REJECT" && "Reject — clear the alert, disagree with the AI"}
                  {opt === "OVERRIDE" && "Override — choose a different disposition"}
                </label>
              ))}
            </fieldset>

            {action === "OVERRIDE" && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="overrideDisposition" className="text-xs font-medium text-ink-secondary">
                  Override disposition
                </label>
                <select
                  id="overrideDisposition"
                  value={overrideDisposition}
                  onChange={(e) => setOverrideDisposition(e.target.value as RecommendationDisposition)}
                  className="rounded-md border border-line px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {DISPOSITIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="rationale" className="text-xs font-medium text-ink-secondary">
                Analyst notes / rationale (required)
              </label>
              <textarea
                id="rationale"
                required
                rows={3}
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="Explain your decision — this becomes part of the permanent audit record."
                className="rounded-md border border-line px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              />
            </div>

            {error && (
              <p role="alert" className="text-xs text-status-critical">
                {error}
              </p>
            )}

            <Button type="submit" disabled={submitting || rationale.trim().length === 0}>
              {submitting ? "Recording…" : "Record decision"}
            </Button>
          </form>
        </RoleGate>
      </CardContent>
    </Card>
  );
}
