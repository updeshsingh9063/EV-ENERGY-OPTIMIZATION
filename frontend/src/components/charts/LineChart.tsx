"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** Downsampled polyline for small previews (no axes, no interaction). */
export function Sparkline({
  values,
  height = 32,
  color = "var(--ink-3)",
  className,
}: {
  values: number[];
  height?: number;
  color?: string;
  className?: string;
}) {
  const d = useMemo(() => {
    const n = values.length;
    if (n < 2) return "";
    const step = Math.max(1, Math.floor(n / 160));
    const max = Math.max(...values, 1e-9);
    let p = "";
    for (let i = 0; i < n; i += step) p += `${i ? "L" : "M"}${((i / (n - 1)) * 100).toFixed(2)},${(height - (values[i] / max) * (height - 2) - 1).toFixed(2)}`;
    return p;
  }, [values, height]);
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className={className} style={{ height }} aria-hidden>
      <path d={`${d}L100,${height}L0,${height}Z`} fill="var(--surface-3)" opacity={0.6} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Single-series time chart (1 Hz samples) with axis, grid and crosshair tooltip. */
export function LineChart({
  values,
  unit,
  label,
  color = "var(--ink-2)",
  height = 200,
  fill = true,
}: {
  values: number[];
  unit: string;
  label: string;
  color?: string;
  height?: number;
  fill?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const L = 40, R = 8, T = 8, B = 22;
  const n = values.length;
  const pw = w - L - R, ph = height - T - B;
  const g = useMemo(() => {
    const max = Math.max(...values, 1);
    const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw)), k = raw / mag;
    const step = (k >= 5 ? 10 : k >= 2 ? 5 : k >= 1.5 ? 2 : 1) * mag;
    const top = Math.ceil(max / step) * step;
    const x = (i: number) => L + (i / Math.max(n - 1, 1)) * pw;
    const y = (v: number) => T + ph - (v / top) * ph;
    const stride = Math.max(1, Math.floor(n / (pw * 1.5)));
    let d = "";
    for (let i = 0; i < n; i += stride) d += `${i ? "L" : "M"}${x(i).toFixed(1)},${y(values[i]).toFixed(1)}`;
    const ticks: number[] = [];
    for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
    const tStep = Math.max(60, Math.ceil(n / Math.max(3, pw / 90) / 60) * 60);
    const tTicks: number[] = [];
    for (let s = 0; s < n; s += tStep) tTicks.push(s);
    return { x, y, d, ticks, tTicks };
  }, [values, n, pw, ph]);

  const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div
      ref={ref}
      className="relative select-none outline-none"
      tabIndex={0}
      role="img"
      aria-label={`${label} over time. Use arrow keys to inspect.`}
      onPointerMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        setHover(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left - L) / pw) * (n - 1)))));
      }}
      onPointerLeave={() => setHover(null)}
      onBlur={() => setHover(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? -5) + 5));
        else if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n) - 5));
        else return;
        e.preventDefault();
      }}
    >
      <svg width={w} height={height} className="block" aria-hidden>
        {g.ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={w - R} y1={g.y(v)} y2={g.y(v)} stroke={v === 0 ? "var(--line-strong)" : "var(--grid)"} />
            <text x={L - 8} y={g.y(v) + 4} textAnchor="end" className="num fill-[var(--ink-3)] text-[11px]">
              {v}
            </text>
          </g>
        ))}
        {g.tTicks.map((s) => (
          <text key={s} x={g.x(s)} y={height - 4} textAnchor={g.x(s) > w - R - 24 ? "end" : "middle"} className="num fill-[var(--ink-3)] text-[11px]">
            {fmtT(s)}
          </text>
        ))}
        {fill && <path d={`${g.d}L${g.x(n - 1)},${g.y(0)}L${L},${g.y(0)}Z`} fill="var(--surface-3)" opacity={0.6} />}
        <path d={g.d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
        {hover != null && (
          <>
            <line x1={g.x(hover)} x2={g.x(hover)} y1={T} y2={T + ph} stroke="var(--ink-2)" strokeDasharray="2 3" />
            <circle cx={g.x(hover)} cy={g.y(values[hover])} r={4} fill={color} stroke="var(--surface-1)" strokeWidth={2} />
          </>
        )}
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute top-2 rounded-sm border border-line bg-surface-1 px-2 py-1 text-xs shadow-pop"
          style={{ left: g.x(hover) > w - 140 ? g.x(hover) - 132 : g.x(hover) + 10 }}
        >
          <span className="num text-ink-3">{fmtT(hover)}</span>{" "}
          <span className="num text-ink-1">
            {values[hover].toFixed(1)} {unit}
          </span>
        </div>
      )}
    </div>
  );
}
