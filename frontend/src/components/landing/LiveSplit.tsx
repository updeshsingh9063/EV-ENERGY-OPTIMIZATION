"use client";

/**
 * The peak: a real WLTC Class 3b cycle (held out from training) played by scroll.
 * The trained distilled controller runs here in the browser; nothing is pre-rendered.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { DriveCycle } from "@/lib/hess/cycles";
import { DEFAULT_CONFIG, type SimResult } from "@/lib/hess/model";
import { loadModels, runOne } from "@/lib/hess/registry";
import { pinProgress, useScrollFrame } from "./scroll";

interface Traces {
  speedKmh: number[];
  demand: number[]; // kW
  bat: number[];
  sc: number[];
  version: string;
}

const INIT = { socBat: 0.8, socSc: 0.75 };
const kw = (v: number) => `${(Math.abs(v) < 0.05 ? 0 : v).toFixed(1)} kW`;

function toKw(r: SimResult) {
  return { demand: r.trace.pReq.map((p) => p / 1000), bat: r.trace.pBat.map((p) => p / 1000), sc: r.trace.pSc.map((p) => p / 1000) };
}

export function LiveSplit() {
  const section = useRef<HTMLElement>(null);
  const plot = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Traces | null>(null);
  const [failed, setFailed] = useState(false);
  const [w, setW] = useState(1000);
  const [idx, setIdx] = useState(0);

  // Load the cycle and the trained models when the reader is a screen away.
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    let done = false;
    const io = new IntersectionObserver(
      async ([e]) => {
        if (!e.isIntersecting || done) return;
        done = true;
        io.disconnect();
        try {
          const [json, models] = await Promise.all([fetch("/landing/wltc3b.json").then((r) => r.json()), loadModels()]);
          const cycle: DriveCycle = { id: "wltc", name: json.name, source: "dataset", description: "", speedMs: json.speedMs, createdAt: "" };
          const ml = toKw(runOne(DEFAULT_CONFIG, cycle, "ml", INIT, models));
          setData({ speedKmh: json.speedMs.map((v: number) => v * 3.6), ...ml, version: models.version });
        } catch {
          setFailed(true);
        }
      },
      { rootMargin: "120% 0px 120% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = plot.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useScrollFrame(() => {
    if (!data) return;
    // Hold the first and last 8% so the trace starts and finishes at rest.
    const p = Math.min(1, Math.max(0, (pinProgress(section.current) - 0.08) / 0.84));
    const i = Math.round(p * (data.demand.length - 1));
    setIdx((cur) => (cur === i ? cur : i));
  });

  const compact = w < 640;
  const H = compact ? 190 : 300, SPEED_H = compact ? 36 : 54, GAP = compact ? 16 : 26;
  const geo = useMemo(() => {
    if (!data) return null;
    const n = data.demand.length;
    const x = (i: number) => (i / (n - 1)) * w;
    const max = Math.max(...data.demand, ...data.bat), min = Math.min(...data.demand, ...data.sc, ...data.bat);
    const y = (v: number) => SPEED_H + GAP + ((max - v) / (max - min)) * H;
    const vMax = Math.max(...data.speedKmh);
    const ys = (v: number) => SPEED_H - (v / vMax) * SPEED_H;
    const path = (arr: number[], f: (v: number) => number) => {
      let d = "";
      for (let i = 0; i < n; i += 1) d += `${i ? "L" : "M"}${x(i).toFixed(1)},${f(arr[i]).toFixed(1)}`;
      return d;
    };
    return {
      x, y, zero: y(0),
      speed: `${path(data.speedKmh, ys)}L${w},${SPEED_H}L0,${SPEED_H}Z`,
      demand: path(data.demand, y), bat: path(data.bat, y), sc: path(data.sc, y),
    };
  }, [data, w, H, SPEED_H, GAP]);

  // Running tally up to the playhead: what the battery actually saw vs what it would have seen alone.
  const tally = useMemo(() => {
    if (!data) return null;
    let peakAlone = 0, peakBat = 0;
    for (let i = 0; i <= idx; i++) {
      peakAlone = Math.max(peakAlone, data.demand[i]);
      peakBat = Math.max(peakBat, data.bat[i]);
    }
    return { peakAlone, peakBat };
  }, [data, idx]);

  const t = idx;
  const mmss = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  const px = geo ? geo.x(idx) : 0;

  return (
    <section ref={section} id="ch-3" data-chapter="III" data-title="The split" data-ground="night" className="lp-pin lp-night" style={{ height: "400vh" }} aria-labelledby="split-h">
      <div className="lp-stage lp-stage-pad flex flex-col justify-center px-[var(--gutter)]">
        <div className="mx-auto w-full max-w-[1280px]">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4 md:mb-8 md:gap-6">
            <div>
              <p className="lp-num text-xs tracking-[0.12em] text-[var(--night-soft)]">III</p>
              <h2 id="split-h" className="lp-serif mt-2 text-[clamp(28px,5vw,64px)] leading-[1.02]">
                The split, <em>one second at a time.</em>
              </h2>
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4" aria-live="off">
              {[
                ["Time", data ? mmss : "0:00", "var(--night-ink)"],
                ["Demand", data ? kw(data.demand[idx]) : "…", "var(--night-ink)"],
                ["Battery", data ? kw(data.bat[idx]) : "…", "var(--bat-night)"],
                ["Supercap", data ? kw(data.sc[idx]) : "…", "var(--sc-night)"],
              ].map(([k, v, c]) => (
                <div key={k} className="min-w-[96px]">
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-[var(--night-soft)]">{k}</dt>
                  <dd className="lp-num text-lg" style={{ color: c }}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div ref={plot} className="relative w-full" role="img"
            aria-label="WLTC Class 3b drive cycle. As you scroll, the trained controller splits each power demand between the battery, shown in blue, and the supercapacitor, shown in orange.">
            <svg width={w} height={SPEED_H + GAP + H + 8} className="block overflow-visible" aria-hidden>
              <defs>
                <clipPath id="lp-played"><rect x="0" y="-20" width={Math.max(0, px)} height={SPEED_H + GAP + H + 40} /></clipPath>
              </defs>
              {geo && (
                <>
                  <path d={geo.speed} fill="rgb(241 239 233 / 0.07)" />
                  <path d={geo.speed} fill="rgb(241 239 233 / 0.22)" clipPath="url(#lp-played)" />
                  <line x1="0" x2={w} y1={geo.zero} y2={geo.zero} stroke="rgb(241 239 233 / 0.18)" />
                  <path d={geo.demand} fill="none" stroke="rgb(241 239 233 / 0.10)" strokeWidth="1" />
                  <g clipPath="url(#lp-played)">
                    <path d={geo.demand} fill="none" stroke="rgb(241 239 233 / 0.35)" strokeWidth="1" />
                    <path d={geo.sc} fill="none" stroke="var(--sc-night)" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d={geo.bat} fill="none" stroke="var(--bat-night)" strokeWidth="2.25" strokeLinejoin="round" />
                  </g>
                  <line x1={px} x2={px} y1="0" y2={SPEED_H + GAP + H} stroke="rgb(241 239 233 / 0.55)" strokeDasharray="2 4" />
                  <circle cx={px} cy={geo.y(data!.bat[idx])} r="5" fill="var(--bat-night)" stroke="var(--night)" strokeWidth="2" />
                  <circle cx={px} cy={geo.y(data!.sc[idx])} r="5" fill="var(--sc-night)" stroke="var(--night)" strokeWidth="2" />
                </>
              )}
            </svg>
            {!data && (
              <p className="absolute inset-0 grid place-items-center text-sm text-[var(--night-soft)]">
                {failed ? "The trained controller could not be loaded." : "Loading the trained controller…"}
              </p>
            )}
          </div>

          <div className="mt-5 grid gap-3 border-t border-white/10 pt-4 text-[13px] text-[var(--night-soft)] md:mt-8 md:gap-6 md:pt-6 md:text-sm md:grid-cols-[1fr_auto]">
            <p className="max-w-[60ch] max-md:line-clamp-3">
              <span className="text-[var(--night-ink)]">Keep scrolling: you are driving.</span> This is the WLTC Class 3b test
              cycle, which the model never saw in training. The distilled controller {data ? `${data.version} ` : ""}is running
              in your browser right now, deciding every second who pays for the power:{" "}
              <span style={{ color: "var(--bat-night)" }}>battery</span> or{" "}
              <span style={{ color: "var(--sc-night)" }}>supercapacitor</span>.
            </p>
            {tally && (
              <p className="lp-num whitespace-nowrap md:text-right">
                Peak so far, battery alone <span className="text-[var(--night-ink)]">{tally.peakAlone.toFixed(1)} kW</span>
                <br />
                Peak the battery actually saw <span style={{ color: "var(--bat-night)" }}>{tally.peakBat.toFixed(1)} kW</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
