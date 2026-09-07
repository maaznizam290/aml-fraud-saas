"use client";

import { useState } from "react";

import { cn } from "../../lib/ui/cn.js";

export interface BarDatum {
  label: string;
  value: number;
  color: string;
}

/**
 * Single-metric bar chart (dataviz skill: thin marks, 4px rounded
 * data-ends, recessive gridlines/axis, per-mark hover tooltip, direct
 * value labels since bar counts are usually few). Colors are passed in by
 * the caller already resolved from the validated palette (status colors
 * for severity, the single sequential hue for magnitude) — this component
 * only lays out and labels.
 */
export function BarChart({ data, className, valueFormatter = String }: {
  data: BarDatum[];
  className?: string;
  valueFormatter?: (value: number) => string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));

  if (data.every((d) => d.value === 0)) {
    return <p className="py-8 text-center text-sm text-ink-muted">No data yet.</p>;
  }

  return (
    <div className={cn("flex items-end gap-4", className)} role="img" aria-label="Bar chart">
      {data.map((d, i) => {
        const heightPct = (d.value / max) * 100;
        return (
          <div
            key={d.label}
            className="flex flex-1 flex-col items-center gap-2"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
          >
            <div className="relative flex h-40 w-full items-end justify-center">
              {hovered === i && (
                <div className="absolute -top-8 z-10 whitespace-nowrap rounded-md bg-ink-primary px-2 py-1 text-xs font-medium text-white shadow-popover">
                  {d.label}: {valueFormatter(d.value)}
                </div>
              )}
              <div
                className="w-8 rounded-t-[4px] transition-[height]"
                style={{ height: `${Math.max(heightPct, d.value > 0 ? 3 : 0)}%`, backgroundColor: d.color }}
              />
            </div>
            <span className="text-xs font-medium text-ink-secondary">{valueFormatter(d.value)}</span>
            <span className="text-center text-xs text-ink-muted">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}
