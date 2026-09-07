"use client";

import { useId, useMemo, useState } from "react";

export interface TrendPoint {
  date: string;
  value: number;
}

const LINE_COLOR = "#2a78d6"; // dataviz palette categorical slot 1 / sequential hue
const WIDTH = 640;
const HEIGHT = 180;
const PADDING = { top: 12, right: 12, bottom: 24, left: 12 };

/**
 * Single-series trend line with a crosshair + tooltip on hover (dataviz
 * skill: "ship a crosshair+tooltip on line/area" — the only form that
 * skips it is a bare stat tile). One series needs no legend box; the
 * chart's own heading names it.
 */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { path, areaPath, points, max } = useMemo(() => {
    const innerWidth = WIDTH - PADDING.left - PADDING.right;
    const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
    const maxValue = Math.max(1, ...data.map((d) => d.value));
    const step = data.length > 1 ? innerWidth / (data.length - 1) : 0;

    const pts = data.map((d, i) => ({
      x: PADDING.left + step * i,
      y: PADDING.top + innerHeight - (d.value / maxValue) * innerHeight,
      ...d,
    }));

    const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const area =
      pts.length > 0
        ? `${linePath} L ${(pts[pts.length - 1]?.x ?? 0).toFixed(1)} ${HEIGHT - PADDING.bottom} L ${(pts[0]?.x ?? 0).toFixed(1)} ${HEIGHT - PADDING.bottom} Z`
        : "";

    return { path: linePath, areaPath: area, points: pts, max: maxValue };
  }, [data]);

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-muted">No data yet.</p>;
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Alert volume trend"
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={LINE_COLOR} stopOpacity={0.18} />
            <stop offset="100%" stopColor={LINE_COLOR} stopOpacity={0} />
          </linearGradient>
        </defs>

        <line
          x1={PADDING.left}
          y1={HEIGHT - PADDING.bottom}
          x2={WIDTH - PADDING.right}
          y2={HEIGHT - PADDING.bottom}
          stroke="#e3e6ec"
          strokeWidth={1}
        />

        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={path} fill="none" stroke={LINE_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {hovered && (
          <>
            <line
              x1={hovered.x}
              y1={PADDING.top}
              x2={hovered.x}
              y2={HEIGHT - PADDING.bottom}
              stroke="#c3c2b7"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle cx={hovered.x} cy={hovered.y} r={4} fill={LINE_COLOR} stroke="white" strokeWidth={2} />
          </>
        )}

        {points.map((p, i) => (
          <rect
            key={p.date}
            x={p.x - (WIDTH / points.length) / 2}
            y={PADDING.top}
            width={WIDTH / points.length}
            height={HEIGHT - PADDING.top - PADDING.bottom}
            fill="transparent"
            onMouseEnter={() => setHoverIndex(i)}
          />
        ))}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md bg-ink-primary px-2 py-1 text-xs font-medium text-white shadow-popover"
          style={{ left: `${(hovered.x / WIDTH) * 100}%`, top: `${(hovered.y / HEIGHT) * 100}%` }}
        >
          {formatDate(hovered.date)}: {hovered.value}
        </div>
      )}

      <div className="mt-1 flex justify-between text-xs text-ink-muted">
        <span>{formatDate(data[0]?.date ?? "")}</span>
        <span>Peak: {max}</span>
        <span>{formatDate(data[data.length - 1]?.date ?? "")}</span>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
