"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface CycleTraceData {
  t: number[];
  speedKmh: number[];
  pReqKw: number[];
  pBatKw: number[];
  pScKw: number[];
  socScPct: number[];
}

const PAD_L = 44;
const PAD_R = 12;
const GAP = 40;
const H_SPEED = 64;
const H_POWER = 210;
const H_SOC = 64;
const H_AXIS = 22;

function niceStep(range: number, ticks: number) {
  const raw = range / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n >= 5 ? 10 : n >= 2 ? 5 : n >= 1.5 ? 2 : 1) * mag;
}

function linePath(xs: number[], ys: number[]) {
  let d = "";
  for (let i = 0; i < xs.length; i++) d += `${i ? "L" : "M"}${xs[i].toFixed(1)},${ys[i].toFixed(1)}`;
  return d;
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

export function CycleTrace({ data }: { data: CycleTraceData }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = data.t.length;
  const plotW = w - PAD_L - PAD_R;
  const y0Speed = 16;
  const y0Power = H_SPEED + GAP;
  const y0Soc = y0Power + H_POWER + GAP;
  const totalH = y0Soc + H_SOC + H_AXIS;

  const geo = useMemo(() => {
    const x = (i: number) => PAD_L + (i / (n - 1)) * plotW;
    const xs = data.t.map((_, i) => x(i));

    const vMax = Math.max(20, ...data.speedKmh) * 1.08;
    const ySpeed = (v: number) => y0Speed + H_SPEED - (v / vMax) * H_SPEED;

    const all = [...data.pReqKw, ...data.pBatKw, ...data.pScKw];
    const pStep = niceStep(Math.max(...all) - Math.min(...all), 4);
    const pMax = Math.ceil(Math.max(...all) / pStep) * pStep;
    const pMin = Math.min(0, Math.floor(Math.min(...all) / pStep) * pStep);
    const yP = (p: number) => y0Power + H_POWER - ((p - pMin) / (pMax - pMin)) * H_POWER;
    const pTicks: number[] = [];
    for (let v = pMin; v <= pMax + 1e-9; v += pStep) pTicks.push(v);

    const ySoc = (s: number) => y0Soc + H_SOC - (s / 100) * H_SOC;

    const tStep = niceStep(data.t[n - 1], Math.max(3, Math.floor(plotW / 110))) || 60;
    const tTicks: number[] = [];
    for (let s = 0; s <= data.t[n - 1]; s += Math.max(60, Math.round(tStep / 60) * 60)) tTicks.push(s);

    const speedLine = linePath(xs, data.speedKmh.map(ySpeed));
    const speedArea = `${speedLine}L${xs[n - 1].toFixed(1)},${ySpeed(0)}L${xs[0].toFixed(1)},${ySpeed(0)}Z`;

    return {
      x,
      xs,
      ySpeed,
      yP,
      ySoc,
      vMax,
      pTicks,
      tTicks,
      speedArea,
      speedLine,
      req: linePath(xs, data.pReqKw.map(yP)),
      bat: linePath(xs, data.pBatKw.map(yP)),
      sc: linePath(xs, data.pScKw.map(yP)),
      soc: linePath(xs, data.socScPct.map(ySoc)),
    };
  }, [data, n, plotW, y0Power, y0Soc]);

  const pick = useCallback(
    (clientX: number) => {
      const r = wrap.current!.getBoundingClientRect();
      const i = Math.round(((clientX - r.left - PAD_L) / plotW) * (n - 1));
      setHover(Math.max(0, Math.min(n - 1, i)));
    },
    [n, plotW],
  );

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 30 : 5;
    if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? -step) + step));
    else if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n) - step));
    else if (e.key === "Escape") setHover(null);
    else return;
    e.preventDefault();
  };

  const hx = hover != null ? geo.x(hover) : 0;
  const tipLeft = hover != null && hx > w - 220;

  return (
    <div
      ref={wrap}
      className="relative select-none outline-none"
      tabIndex={0}
      role="img"
      aria-label="Drive-cycle trace: vehicle speed, power split between battery and supercapacitor, and supercapacitor state of charge over time. Use left and right arrow keys to inspect values."
      onKeyDown={onKey}
      onPointerMove={(e) => pick(e.clientX)}
      onPointerLeave={() => setHover(null)}
      onBlur={() => setHover(null)}
    >
      <svg width={w} height={totalH} className="block overflow-visible" aria-hidden>
        {/* ---- Speed panel ---- */}
        <text x={PAD_L} y={y0Speed - 6} className="fill-[var(--ink-3)] text-[11px]">
          Speed · km/h
        </text>
        <text x={PAD_L - 8} y={geo.ySpeed(0) - 2} textAnchor="end" className="num fill-[var(--ink-3)] text-[11px]">
          0
        </text>
        <line x1={PAD_L} x2={w - PAD_R} y1={geo.ySpeed(0)} y2={geo.ySpeed(0)} stroke="var(--line)" />
        <path d={geo.speedArea} fill="var(--surface-3)" opacity={0.7} />
        <path d={geo.speedLine} fill="none" stroke="var(--ink-3)" strokeWidth={1.25} strokeLinejoin="round" />

        {/* ---- Power panel ---- */}
        {geo.pTicks.map((v) => (
          <g key={v}>
            <line
              x1={PAD_L}
              x2={w - PAD_R}
              y1={geo.yP(v)}
              y2={geo.yP(v)}
              stroke={v === 0 ? "var(--line-strong)" : "var(--grid)"}
            />
            <text x={PAD_L - 8} y={geo.yP(v) + 4} textAnchor="end" className="num fill-[var(--ink-3)] text-[11px]">
              {v}
            </text>
          </g>
        ))}
        <text x={PAD_L} y={y0Power - 12} className="fill-[var(--ink-3)] text-[11px]">
          Power · kW
        </text>
        <path d={geo.req} fill="none" stroke="var(--series-demand)" strokeWidth={1} opacity={0.32} strokeLinejoin="round" />
        <path d={geo.sc} fill="none" stroke="var(--series-sc)" strokeWidth={1.5} strokeLinejoin="round" />
        <path d={geo.bat} fill="none" stroke="var(--series-bat)" strokeWidth={2} strokeLinejoin="round" />

        {/* ---- SOC panel ---- */}
        <text x={PAD_L} y={y0Soc - 12} className="fill-[var(--ink-3)] text-[11px]">
          Supercap charge · %
        </text>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={PAD_L} x2={w - PAD_R} y1={geo.ySoc(v)} y2={geo.ySoc(v)} stroke="var(--grid)" />
            <text x={PAD_L - 8} y={geo.ySoc(v) + 4} textAnchor="end" className="num fill-[var(--ink-3)] text-[11px]">
              {v}
            </text>
          </g>
        ))}
        <path d={geo.soc} fill="none" stroke="var(--series-sc)" strokeWidth={2} strokeLinejoin="round" />

        {/* ---- Time axis ---- */}
        {geo.tTicks.map((s) => {
          const xi = geo.x((s / data.t[n - 1]) * (n - 1));
          return (
            <text key={s} x={xi} y={totalH - 4} textAnchor={xi > w - PAD_R - 24 ? "end" : "middle"} className="num fill-[var(--ink-3)] text-[11px]">
              {fmtTime(s)}
            </text>
          );
        })}

        {/* ---- Crosshair ---- */}
        {hover != null && (
          <g>
            <line x1={hx} x2={hx} y1={y0Speed} y2={y0Soc + H_SOC} stroke="var(--ink-2)" strokeWidth={1} strokeDasharray="2 3" />
            <circle cx={hx} cy={geo.yP(data.pBatKw[hover])} r={4} fill="var(--series-bat)" stroke="var(--surface-1)" strokeWidth={2} />
            <circle cx={hx} cy={geo.yP(data.pScKw[hover])} r={4} fill="var(--series-sc)" stroke="var(--surface-1)" strokeWidth={2} />
            <circle cx={hx} cy={geo.ySoc(data.socScPct[hover])} r={4} fill="var(--series-sc)" stroke="var(--surface-1)" strokeWidth={2} />
            <circle cx={hx} cy={geo.ySpeed(data.speedKmh[hover])} r={3.5} fill="var(--ink-2)" stroke="var(--surface-1)" strokeWidth={2} />
          </g>
        )}
      </svg>

      {hover != null && (
        <div
          className="pointer-events-none absolute top-[96px] z-10 w-[196px] rounded-md border border-line bg-surface-1 p-3 shadow-pop"
          style={{ left: tipLeft ? hx - 208 : hx + 12 }}
        >
          <div className="num mb-2 text-xs text-ink-3">t = {fmtTime(data.t[hover])}</div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
            <Row swatch="var(--ink-3)" label="Speed" value={`${data.speedKmh[hover].toFixed(0)} km/h`} />
            <Row swatch="var(--series-demand)" label="Demand" value={`${data.pReqKw[hover].toFixed(1)} kW`} faint />
            <Row swatch="var(--series-bat)" label="Battery" value={`${data.pBatKw[hover].toFixed(1)} kW`} />
            <Row swatch="var(--series-sc)" label="Supercap" value={`${data.pScKw[hover].toFixed(1)} kW`} />
            <Row swatch="var(--series-sc)" label="SC charge" value={`${data.socScPct[hover].toFixed(0)} %`} />
          </dl>
        </div>
      )}
    </div>
  );
}

function Row({ swatch, label, value, faint }: { swatch: string; label: string; value: string; faint?: boolean }) {
  return (
    <>
      <dt className="flex items-center gap-1.5 text-ink-2">
        <span className="size-2 rounded-full" style={{ background: swatch, opacity: faint ? 0.4 : 1 }} />
        {label}
      </dt>
      <dd className="num text-right text-ink-1">{value}</dd>
    </>
  );
}
