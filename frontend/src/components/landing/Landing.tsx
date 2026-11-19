"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CarModel } from "./CarModel";
import { CREDITS } from "./credits";
import { LiveSplit } from "./LiveSplit";
import { pinProgress, useCountUp, usePageMotion, useScrollFrame } from "./scroll";
import "./landing.css";

/* Real figures. Source: model-training/reports/evaluation.json, models v1.0.0,
   held-out US06 + WLTC 3b; vehicle figures from the Compact EV preset. */
const FIG = {
  peakCAloneUs06: 4.55,
  energyVsRule: 1.2,
  stressVsBattery: 49.3,
  peakVsBattery: 35.6,
  packKwh: 21.5,
  scKwh: 0.33,
};

function Plate({
  id, alt, className = "", priority, rate = 0.12, sizes = "(max-width: 860px) 100vw, 60vw", reveal = "wipe",
}: { id: keyof typeof CREDITS; alt: string; className?: string; priority?: boolean; rate?: number; sizes?: string; reveal?: "wipe" | "wipe-side" | "none" }) {
  const c = CREDITS[id];
  return (
    <div className={`lp-plate ${className}`} data-in={reveal === "none" ? undefined : reveal}>
      <Image src={c.file} alt={alt} fill sizes={sizes} priority={priority} data-parallax={rate} style={{ objectFit: "cover" }} />
    </div>
  );
}

function Credit({ id, children, label = "Photo" }: { id: keyof typeof CREDITS; children?: React.ReactNode; label?: string }) {
  const c = CREDITS[id];
  return (
    <figcaption className="mt-3 flex flex-wrap justify-between gap-x-6 gap-y-1 text-[12px] leading-5 text-[var(--ink-soft)]">
      <span>{children}</span>
      <span>
        {label}: {c.author}, <a className="lp-link" href={c.licenseUrl} target="_blank" rel="noreferrer">{c.license}</a>
      </span>
    </figcaption>
  );
}

function Count({ to, decimals = 1 }: { to: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useCountUp(ref, to, decimals);
  return <span ref={ref}>{to.toFixed(decimals)}</span>;
}

function Folio() {
  const [ch, setCh] = useState({ n: "", title: "", ground: "paper" });
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-chapter]"));
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (vis) {
          const d = (vis.target as HTMLElement).dataset;
          setCh({ n: d.chapter ?? "", title: d.title ?? "", ground: d.ground ?? "paper" });
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return (
    <header className="lp-folio" data-ground={ch.ground}>
      <Link href="/" className="lp-folio-strong text-[13px] tracking-tight" aria-label="VoltSplit, top of page">VoltSplit</Link>
      <span className="lp-folio-chapter hidden sm:inline" aria-live="polite">
        {ch.n && <><span className="lp-num">{ch.n}</span>&nbsp;&nbsp;{ch.title}</>}
      </span>
      <nav className="ml-auto flex items-center gap-5" aria-label="Account">
        <Link href="/login" className="lp-link lp-folio-strong">Sign in</Link>
        <Link href="/signup" className="lp-link lp-folio-strong">Create account</Link>
      </nav>
    </header>
  );
}

const RAIL: { id: keyof typeof CREDITS; title: string; note: string }[] = [
  { id: "taycan_4s", title: "Performance cars", note: "Hard launches are the biggest spikes of all." },
  { id: "ioniq5_cc0", title: "Family crossovers", note: "The everyday commute: lights, roundabouts, school runs." },
  { id: "bus_tgsrtc", title: "City buses", note: "Heavy, and stopping every few hundred metres." },
  { id: "ola_road", title: "Two-wheelers", note: "Small packs, so every surge costs proportionally more." },
  { id: "rickshaws", title: "Rickshaws", note: "Short hops, constant stop and go, tiny batteries." },
  { id: "truck_volvo", title: "Heavy trucks", note: "Tonnes of mass to move off the line and to slow down." },
];

function VehicleRail() {
  const sec = useRef<HTMLElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  useScrollFrame(() => {
    const r = rail.current;
    if (!r || window.innerWidth < 860) return;
    const p = pinProgress(sec.current);
    const travel = r.scrollWidth - window.innerWidth + 2 * parseFloat(getComputedStyle(r).paddingLeft || "0");
    r.style.transform = `translate3d(${(-p * Math.max(0, travel)).toFixed(1)}px,0,0)`;
  });
  return (
    <section ref={sec} id="ch-5" data-chapter="V" data-title="Every vehicle that brakes" className="lp-pin md:h-[260vh]" aria-labelledby="rail-h">
      <div className="flex flex-col justify-center gap-10 py-[clamp(72px,12vh,140px)] md:sticky md:top-0 md:h-[100svh] md:overflow-hidden md:py-0">
        <div className="grid gap-6 px-[var(--gutter)] md:grid-cols-[1fr_1fr] md:items-end">
          <div>
            <p className="lp-num text-xs tracking-[0.12em] text-[var(--ink-soft)]">V</p>
            <h2 id="rail-h" className="lp-serif mt-2 text-[clamp(36px,5.2vw,72px)] leading-[1.02]">Every vehicle that brakes.</h2>
          </div>
          <p className="lp-measure text-[17px] leading-7 text-[var(--ink-soft)] md:justify-self-end md:text-right">
            Anything that accelerates and brakes in traffic pays the same tax. The vehicle model in VoltSplit is fully
            configurable; the controller published today is trained for a compact EV.
          </p>
        </div>
        <div className="lp-rail-wrap">
          <div ref={rail} className="lp-rail px-[var(--gutter)]">
            {RAIL.map((v) => (
              <figure key={v.id} className="lp-rail-item">
                <div className="lp-plate aspect-[4/3]">
                  <Image src={CREDITS[v.id].file} alt={`${v.title}: ${CREDITS[v.id].title}`} fill sizes="(max-width: 860px) 78vw, 30vw" style={{ objectFit: "cover" }} />
                </div>
                <h3 className="lp-serif mt-4 text-2xl">{v.title}</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">{v.note}</p>
                <p className="mt-2 text-[11px] text-[var(--ink-soft)]">
                  Photo: {CREDITS[v.id].author}, <a className="lp-link" href={CREDITS[v.id].licenseUrl} target="_blank" rel="noreferrer">{CREDITS[v.id].license}</a>
                </p>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  usePageMotion(root);

  return (
    <div ref={root} className="lp lp-grain">
      <a href="#ch-1" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-12 focus:z-[70] focus:bg-[var(--paper)] focus:px-3 focus:py-2">Skip to content</a>
      <Folio />

      {/* ------------------------------------------------------------ Cover */}
      <section className="flex min-h-[100svh] flex-col px-[var(--gutter)] pb-[var(--gutter)] pt-24" data-chapter="" data-title="" aria-labelledby="cover-h">
        <div className="grid gap-8 md:grid-cols-[1fr_1.15fr] md:items-end">
          <h1 id="cover-h" className="lp-serif text-[clamp(52px,9.2vw,148px)] leading-[0.94]">
            <span className="lp-line"><span>Let the</span></span>
            <span className="lp-line"><span><em>battery</em></span></span>
            <span className="lp-line"><span>breathe.</span></span>
          </h1>
          <div className="lp-fade hidden md:block md:self-stretch">
            <CarModel className="h-full min-h-[380px] w-full" />
          </div>
        </div>
        <figure className="mt-10 flex flex-1 flex-col">
          <div className="lp-plate lp-cover-plate min-h-[34svh] flex-1">
            <Image src={CREDITS.ioniq5_iaa.file} alt="A silver Hyundai Ioniq 5 electric crossover, front three-quarter view" fill priority sizes="100vw" data-parallax="0.06" style={{ objectFit: "cover", objectPosition: "50% 62%" }} />
          </div>
          <Credit id="ioniq5_iaa">Plate 1. Hyundai Ioniq 5, IAA Munich 2021.</Credit>
        </figure>
      </section>

      {/* ------------------------------------------------------------ I. The spike */}
      <section id="ch-1" data-chapter="I" data-title="The spike" className="lp-rule px-[var(--gutter)] py-[clamp(96px,16vh,200px)]" aria-labelledby="ch1-h">
        <div className="grid gap-12 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-center md:gap-16">
          <div>
            <p className="lp-num text-xs tracking-[0.12em] text-[var(--ink-soft)]" data-in="rise">I</p>
            <h2 id="ch1-h" className="lp-serif mt-2 text-[clamp(36px,5.2vw,72px)] leading-[1.02]" data-in="rise">
              Every green light is a&nbsp;<em>spike.</em>
            </h2>
            <div className="lp-measure mt-8 space-y-5 text-[17px] leading-7" data-in="rise" data-delay="1">
              <p>
                Pulling away from a junction asks a battery for a surge of power in about a second, then nothing, then another.
                The battery can deliver it, but every surge is a small dose of heat and wear.
              </p>
              <p className="text-[var(--ink-soft)]">
                On the US06 test cycle, a standard aggressive drive, our compact EV&apos;s battery working alone peaks at
              </p>
            </div>
            <p className="mt-6 flex items-baseline gap-3" data-in="rise" data-delay="2">
              <span className="lp-serif text-[clamp(64px,8vw,120px)] leading-none"><Count to={FIG.peakCAloneUs06} decimals={2} /></span>
              <span className="text-[15px] leading-5 text-[var(--ink-soft)]">C<br />times its capacity, per hour</span>
            </p>
          </div>
          <figure>
            <Plate id="tesla_us95" alt="A black Tesla Model 3 accelerating along a multi-lane highway" className="aspect-[4/3]" rate={0.14} />
            <Credit id="tesla_us95">Plate 2. Tesla Model 3 on U.S. 95.</Credit>
          </figure>
        </div>
      </section>

      {/* ------------------------------------------------------------ II. Two kinds of storage */}
      <section id="ch-2" data-chapter="II" data-title="Two kinds of storage" className="bg-[var(--paper-2)] px-[var(--gutter)] py-[clamp(96px,16vh,200px)]" aria-labelledby="ch2-h">
        <div className="grid gap-12 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-16">
          <figure className="order-2 md:order-1">
            <Plate id="ioniq5_leon" alt="A silver Hyundai Ioniq 5 parked on a street" className="aspect-[16/11]" rate={0.1} reveal="wipe-side" />
            <Credit id="ioniq5_leon">Plate 3. The same car carries both stores in this study.</Credit>
          </figure>
          <div className="order-1 md:order-2">
            <p className="lp-num text-xs tracking-[0.12em] text-[var(--ink-soft)]" data-in="rise">II</p>
            <h2 id="ch2-h" className="lp-serif mt-2 text-[clamp(36px,5.2vw,72px)] leading-[1.02]" data-in="rise">
              One stores energy. One stores <em>impulse.</em>
            </h2>
            <p className="lp-measure mt-8 text-[17px] leading-7" data-in="rise" data-delay="1">
              A battery holds a great deal of energy and dislikes giving it up quickly. A supercapacitor holds very little, yet
              charges and discharges almost instantly, hundreds of thousands of times. Put both on the same power bus and one
              question remains: who pays for this second?
            </p>
            <div className="mt-10 space-y-6" data-in="rise" data-delay="2">
              {[
                { label: "Battery pack", val: FIG.packKwh, unit: "kWh", w: 100, color: "var(--bat)" },
                { label: "Supercapacitor bank", val: FIG.scKwh, unit: "kWh usable", w: (FIG.scKwh / FIG.packKwh) * 100, color: "var(--sc)" },
              ].map((b) => (
                <div key={b.label}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span>{b.label}</span>
                    <span className="lp-num">{b.val} {b.unit}</span>
                  </div>
                  <div className="mt-2 h-[6px] bg-[var(--paper)]">
                    <div className="h-full" style={{ width: `${Math.max(b.w, 0.8)}%`, background: b.color }} />
                  </div>
                </div>
              ))}
              <p className="text-[13px] text-[var(--ink-soft)]">Compact EV preset: 96-cell Li-ion pack and a 20.8 F supercapacitor bank. The supercapacitor holds about 1.5% of the battery&apos;s energy.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Intertitle (authored silence) */}
      <section className="lp-night grid min-h-[70svh] place-items-center px-[var(--gutter)]" data-chapter="" data-title="" data-ground="night" aria-label="Interlude">
        <p className="lp-serif max-w-[18ch] text-center text-[clamp(32px,4.6vw,64px)] leading-[1.08]" data-in="rise">
          So we taught a controller to <em>see the next ten seconds.</em>
        </p>
      </section>

      {/* ------------------------------------------------------------ III. The split (peak) */}
      <LiveSplit />

      {/* ------------------------------------------------------------ IV. The evidence */}
      <section id="ch-4" data-chapter="IV" data-title="The evidence" className="px-[var(--gutter)] pb-[clamp(56px,8vh,104px)] pt-[clamp(96px,16vh,200px)]" aria-labelledby="ch4-h">
        <div className="grid gap-12 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
          <div>
            <p className="lp-num text-xs tracking-[0.12em] text-[var(--ink-soft)]" data-in="rise">IV</p>
            <h2 id="ch4-h" className="lp-serif mt-2 text-[clamp(36px,5.2vw,72px)] leading-[1.02]" data-in="rise">Measured, not promised.</h2>
            <p className="lp-measure mt-8 text-[15px] leading-7 text-[var(--ink-soft)]" data-in="rise" data-delay="1">
              Averages over two drive cycles the models never saw in training (US06 and WLTC Class 3b), against the standard
              rule-based controller and against running on the battery alone.
            </p>
          </div>
          <div>
          <ul className="grid sm:grid-cols-2" aria-label="Results on held-out drive cycles">
            {[
              { v: FIG.energyVsRule, u: "%", k: "less energy", d: "than the rule-based HESS controller" },
              { v: FIG.stressVsBattery, u: "%", k: "less battery cycle stress", d: "than the battery working alone" },
              { v: FIG.peakVsBattery, u: "%", k: "lower peak battery current", d: "than the battery working alone" },
              { v: 0, u: "", k: "safety-limit violations", d: "across every held-out second" },
            ].map((f, i) => (
              <li key={f.k} className={`lp-rule py-8 sm:pr-10 ${i % 2 ? "sm:pl-10" : ""}`} data-in="rise" data-delay={String(i % 3)}>
                <p className="lp-serif flex items-baseline text-[clamp(56px,6.5vw,96px)] leading-none">
                  <Count to={f.v} decimals={f.v % 1 ? 1 : 0} />
                  <span className="ml-1 text-[0.45em]">{f.u}</span>
                </p>
                <p className="mt-3 text-[17px]">{f.k}</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">{f.d}</p>
              </li>
            ))}
          </ul>
        <p className="lp-measure mt-8 text-[13px] leading-6 text-[var(--ink-soft)]" data-in="rise">
          Method: an XGBoost demand forecaster, Gaussian-process loss models and a model-predictive controller, distilled into a
          tree ensemble that runs in under a microsecond in C. Trained on NREL FASTSim drive cycles and NASA battery-aging data.
          Every supercapacitor strategy, ours included, still uses slightly more energy than the battery alone, because energy
          that passes through the converter is lost twice. What the supercapacitor buys is battery life.
        </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ V. Rail */}
      <VehicleRail />

      {/* ------------------------------------------------------------ Colophon */}
      <section id="colophon" data-chapter="" data-title="" className="lp-rule px-[var(--gutter)] pb-16 pt-[clamp(96px,14vh,180px)]" aria-labelledby="close-h">
        <figure>
          <Plate id="charge_closeup" alt="Close-up of an electric car charging at night, traffic lights blurred behind" className="aspect-[21/9] min-h-[260px]" rate={0.08} sizes="100vw" />
          <Credit id="charge_closeup">Plate 4. Plugged in.</Credit>
        </figure>
        <div className="mt-16 grid gap-10 md:grid-cols-[1.4fr_1fr]">
          <h2 id="close-h" className="lp-serif text-[clamp(40px,6vw,88px)] leading-[1]" data-in="rise">
            Drive it <em>yourself.</em>
          </h2>
          <p className="self-end text-[19px] leading-8" data-in="rise" data-delay="1">
            The lab is open: <Link href="/signup" className="lp-link font-medium">create an account</Link> to run any drive
            cycle through the trained controllers, compare runs and download the ECU-ready C code. Already have one?{" "}
            <Link href="/login" className="lp-link font-medium">Sign in</Link>.
          </p>
        </div>

        <footer className="lp-rule mt-20 pt-6" aria-label="VoltSplit">
          <p
            aria-hidden
            data-in="rise"
            className="lp-wordmark select-none whitespace-nowrap font-sans font-extrabold leading-[0.8] text-[var(--ink)]"
          >
            VoltSplit
          </p>
          <div className="mt-6 flex flex-wrap justify-between gap-x-8 gap-y-2 text-[12px] leading-5 text-[var(--ink-soft)]">
            <p>Project 96 · Machine-learning energy management for hybrid energy storage EVs</p>
            <p>
              3D model:{" "}
              <a className="lp-link" href={CREDITS.car3d.source} target="_blank" rel="noreferrer">Car Concept</a>, {CREDITS.car3d.author},{" "}
              <a className="lp-link" href={CREDITS.car3d.licenseUrl} target="_blank" rel="noreferrer">{CREDITS.car3d.license}</a>
            </p>
          </div>
        </footer>
      </section>
    </div>
  );
}
