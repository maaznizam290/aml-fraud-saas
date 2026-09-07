import { Check, X } from "lucide-react";

import { cn } from "../../lib/ui/cn.js";
import type { GovernanceStatus } from "../../lib/supabase/types.js";

const STAGES: GovernanceStatus[] = ["PROPOSED", "REVIEW", "APPROVED", "VERSIONED", "DEPLOYED"];

/** Visualizes the strict governance state machine (task section "AI
 * Learning": "Clearly distinguish PROPOSED / REVIEW / APPROVED /
 * VERSIONED / DEPLOYED"). A rejected candidate is shown as a stopped,
 * crossed-out ladder rather than progressing further — see
 * lib/hermes/governance.ts's docstring for why "rejected" is represented
 * as status=REVIEW + rejection_reason rather than a sixth stage. */
export function GovernanceLadder({ status, rejected }: { status: GovernanceStatus; rejected: boolean }) {
  const currentIndex = STAGES.indexOf(status);

  return (
    <ol className="flex items-center gap-1" aria-label="Governance stage">
      {STAGES.map((stage, i) => {
        const reached = i <= currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <li key={stage} className="flex items-center gap-1">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold",
                rejected && isCurrent && "bg-status-critical text-white",
                !rejected && reached && "bg-brand-700 text-white",
                !reached && "bg-surface-sunken text-ink-muted"
              )}
              title={stage}
            >
              {rejected && isCurrent ? <X className="h-3 w-3" /> : reached ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            {i < STAGES.length - 1 && (
              <span className={cn("h-px w-4", reached && !isCurrent ? "bg-brand-700" : "bg-line")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
