"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { cn } from "../../lib/ui/cn.js";
import type { InvestigationState } from "../../lib/supabase/types.js";

const STEPS: { status: InvestigationState; label: string }[] = [
  { status: "RECEIVED", label: "Received" },
  { status: "ANALYZING", label: "Analyzing" },
  { status: "EVIDENCE_COLLECTED", label: "Evidence collected" },
  { status: "AI_INVESTIGATING", label: "AI investigating" },
  { status: "RECOMMENDATION_READY", label: "Recommendation ready" },
  { status: "HUMAN_REVIEW", label: "Human review" },
  { status: "RESOLVED", label: "Resolved" },
];

/**
 * The investigation progress ladder (task section 4). `currentStatus`
 * always reflects the backend's real `alert.status` — polled by the
 * caller via useApiQuery, never invented here.
 *
 * `simulate`, DEMO mode only: the backend pipeline (runInvestigation)
 * actually completes synchronously in one call, so there is no
 * intermediate state to poll — this replays the *already-true* final
 * state as a staged reveal for the demo narrative, which is what task
 * section 4 means by "demo mode may use controlled simulation." In REAL
 * mode `simulate` must be false, and the component renders
 * `currentStatus` exactly as given, with no invented pacing.
 */
export function InvestigationProgress({
  currentStatus,
  simulate = false,
}: {
  currentStatus: InvestigationState;
  simulate?: boolean;
}) {
  const targetIndex = STEPS.findIndex((s) => s.status === currentStatus);
  const [revealedIndex, setRevealedIndex] = useState(simulate ? 0 : targetIndex);

  useEffect(() => {
    if (!simulate) {
      setRevealedIndex(targetIndex);
      return;
    }
    setRevealedIndex(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= targetIndex; i++) {
      timers.push(setTimeout(() => setRevealedIndex(i), i * 550));
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the target step or mode changes, not on every render
  }, [currentStatus, simulate]);

  return (
    <ol className="flex flex-col gap-0" aria-label="Investigation progress">
      {STEPS.map((step, i) => {
        const isDone = i < revealedIndex;
        const isCurrent = i === revealedIndex;
        const isLast = i === STEPS.length - 1;
        return (
          <li key={step.status} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold",
                  isDone && "border-status-good bg-status-good text-white",
                  isCurrent && !isDone && "border-brand-600 text-brand-600",
                  !isDone && !isCurrent && "border-line text-ink-muted"
                )}
                aria-hidden="true"
              >
                {isDone ? (
                  <Check className="h-3.5 w-3.5" />
                ) : isCurrent ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  i + 1
                )}
              </span>
              {!isLast && <span className={cn("w-px flex-1", isDone ? "bg-status-good" : "bg-line")} style={{ minHeight: 20 }} />}
            </div>
            <p
              className={cn(
                "pb-5 text-sm",
                isDone && "text-ink-primary",
                isCurrent && "font-semibold text-brand-700",
                !isDone && !isCurrent && "text-ink-muted"
              )}
            >
              {step.label}
              {isCurrent && step.status !== "RESOLVED" && <span className="sr-only"> (current step)</span>}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
