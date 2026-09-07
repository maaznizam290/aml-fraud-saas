import { cn } from "../../lib/ui/cn.js";

/** Hero-figure KPI tile (dataviz skill: "a stat tile or hero number" is
 * sometimes the right answer instead of a chart). Values use default
 * proportional figures per the skill's typography guidance — tabular-nums
 * is reserved for columns that must align vertically. */
export function StatTile({
  label,
  value,
  delta,
  deltaTone = "neutral",
  className,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "good" | "critical" | "neutral";
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-line bg-surface-raised p-5 shadow-card", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-ink-primary">{value}</p>
      {delta && (
        <p
          className={cn(
            "mt-1 text-xs font-medium",
            deltaTone === "good" && "text-[#006300]",
            deltaTone === "critical" && "text-status-critical",
            deltaTone === "neutral" && "text-ink-muted"
          )}
        >
          {delta}
        </p>
      )}
    </div>
  );
}
