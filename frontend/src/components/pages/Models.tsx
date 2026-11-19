"use client";

import clsx from "clsx";
import { BrainCircuit, CheckCircle2, CircleDashed, ExternalLink, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/form";
import { Card, CardHeader, Skeleton, StatusBadge, Tag } from "@/components/ui/primitives";
import { timeAgo } from "@/lib/format";
import { fmtPct } from "@/lib/hess/registry";
import { MODELS } from "@/lib/models";
import { useStore, type ModelRecord } from "@/lib/store";

const PIPELINE = [
  ["Data acquisition", "FASTSim UDDS / HWFET / US06 / WLTC 3b, NASA PCoE impedance data"],
  ["Preprocessing & features", "1 Hz resampling, P_req, accel, lags, rolling stats, SOC, V_sc, R growth"],
  ["Predictive modelling", "XGBoost forecaster vs GP vs persistence; GP loss surrogates"],
  ["Policy / optimisation", "Forecast-MPC (OSQP) → distil to XGBoost / RF + DAgger"],
  ["Validation", "Closed-loop on held-out US06 & WLTC: E_tot, peak C, DoD stress"],
  ["Deployment", "C99 ECU controller (SIL-verified) + TypeScript for the app"],
  ["Monitoring", "Scheduled retraining; promote only if it beats the active model"],
];

const DATASETS = [
  { name: "NASA PCoE Li-ion battery aging datasets", url: "https://www.nasa.gov/intelligent-systems-division/discovery-and-systems-health/pcoe/pcoe-data-set-repository/", use: "Battery loss surrogate (resistance growth)", ok: true },
  { name: "NREL FASTSim drive cycles", url: "https://github.com/NatLabRockies/fastsim", use: "UDDS, HWFET (train) · US06, WLTC 3b (held-out test)", ok: true },
  { name: "Community driving cycles (PathfinderAV)", url: "https://github.com/PathfinderAV/driving-cycles", use: "Link from the problem statement returns HTTP 404, so it is not available", ok: false },
];

type Avg = Record<string, { energy_vs_battery_only_pct: number; energy_vs_rule_based_pct: number; peak_c_vs_battery_only_pct: number; stress_vs_battery_only_pct: number; violations: number }>;

function PolicyResults({ rec }: { rec: ModelRecord }) {
  const avg = rec.metrics.test_avg as Avg | undefined;
  if (!avg) return null;
  const rows: [string, string][] = [
    ["rule_based", "Rule-based"],
    ["mpc_forecast", "MPC (forecast)"],
    ["mpc_oracle", "MPC (perfect foresight)"],
    ["distilled_ml", "Distilled ML"],
  ];
  return (
    <Card className="rise overflow-hidden">
      <CardHeader
        title="Held-out test results"
        description="Average over US06 and WLTC 3b (never seen in training). Energy vs the rule-based HESS baseline; battery metrics vs battery-only."
      />
      <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-y border-line bg-surface-2 text-left text-2xs uppercase tracking-[0.06em] text-ink-3">
              <th className="py-2 pl-5 pr-3 font-medium">Controller</th>
              <th className="px-3 py-2 text-right font-medium">E_tot vs rule-based</th>
              <th className="px-3 py-2 text-right font-medium">E_tot vs battery-only</th>
              <th className="px-3 py-2 text-right font-medium">Peak C-rate</th>
              <th className="px-3 py-2 text-right font-medium">DoD stress</th>
              <th className="py-2 pl-3 pr-5 text-right font-medium">Violations</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, label]) => {
              const r = avg[k];
              if (!r) return null;
              const cell = (v: number) => (
                <span className={clsx(v < -0.05 ? "text-good-ink" : v > 0.05 ? "text-critical-ink" : "text-ink-3")}>{fmtPct(v)}</span>
              );
              return (
                <tr key={k} className={clsx("border-b border-line last:border-0", k === "distilled_ml" && "bg-surface-2/60")}>
                  <td className="py-2.5 pl-5 pr-3 font-medium text-ink-1">{label}</td>
                  <td className="num px-3 py-2.5 text-right">{k === "rule_based" ? <span className="text-ink-3">baseline</span> : cell(r.energy_vs_rule_based_pct)}</td>
                  <td className="num px-3 py-2.5 text-right">{cell(r.energy_vs_battery_only_pct)}</td>
                  <td className="num px-3 py-2.5 text-right">{cell(r.peak_c_vs_battery_only_pct)}</td>
                  <td className="num px-3 py-2.5 text-right">{cell(r.stress_vs_battery_only_pct)}</td>
                  <td className="num py-2.5 pl-3 pr-5 text-right text-ink-2">{r.violations}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function Models() {
  const { models, ready } = useStore();
  const active = (id: string) => models.find((m) => m.kind === id && m.status === "active");
  const trained = MODELS.filter((m) => active(m.id)).length;
  const policy = active("policy");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Intelligence"
        title="Models"
        description="The learned components of the energy-management framework, their acceptance targets and measured results."
      />

      <Card className="rise overflow-hidden" style={{ animationDelay: "40ms" }}>
        <CardHeader
          title="ML lifecycle"
          description="Problem-statement methodology, as implemented in model-training/."
          actions={
            !ready ? <Skeleton className="h-5 w-28" /> :
            <StatusBadge status={trained === MODELS.length ? "good" : "neutral"}>{trained}/{MODELS.length} models trained</StatusBadge>
          }
        />
        <ol className="mt-4 grid border-t border-line sm:grid-cols-2 xl:grid-cols-7">
          {PIPELINE.map(([t, d], i) => (
            <li key={t} className={clsx("flex gap-3 border-b border-line p-4 xl:flex-col xl:border-b-0", i < PIPELINE.length - 1 && "xl:border-r", i % 2 === 0 && "sm:border-r xl:border-r")}>
              <span className={clsx("num grid size-6 shrink-0 place-items-center rounded-full border text-2xs", trained === MODELS.length ? "border-good bg-good-bg text-good-ink" : "border-line-strong text-ink-2")}>{i + 1}</span>
              <div>
                <div className="text-sm font-medium text-ink-1">{t}</div>
                <div className="mt-0.5 text-2xs text-ink-3">{d}</div>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {policy && <PolicyResults rec={policy} />}

      <div className="grid gap-6 xl:grid-cols-2">
        {MODELS.map((spec, i) => {
          const rec = active(spec.id);
          const ev = rec ? spec.evaluate(rec.metrics) : null;
          return (
            <Card key={spec.id} className="rise" style={{ animationDelay: `${80 + i * 40}ms` }}>
              <div className="flex items-start justify-between gap-3 px-5 pt-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-8 place-items-center rounded-sm border border-line bg-surface-2 text-ink-2">
                    <BrainCircuit className="size-4" aria-hidden />
                  </span>
                  <div>
                    <h2 className="text-sm font-medium text-ink-1">{spec.name}</h2>
                    <p className="text-2xs text-ink-3">{rec ? String(rec.metrics.algorithm ?? spec.algorithms) : spec.algorithms}</p>
                  </div>
                </div>
                {!ready ? <Skeleton className="h-5 w-16" /> : rec ? <StatusBadge status="good">{rec.version}</StatusBadge> : <StatusBadge status="neutral">Not trained</StatusBadge>}
              </div>
              <p className="px-5 pt-3 text-sm text-ink-2">{spec.role}</p>
              <dl className="m-5 grid grid-cols-[110px_1fr] gap-x-4 gap-y-2 rounded-md border border-line p-4 text-xs">
                <dt className="text-ink-3">Inputs</dt><dd className="text-ink-1">{spec.inputs}</dd>
                <dt className="text-ink-3">Output</dt><dd className="text-ink-1">{spec.output}</dd>
                <dt className="text-ink-3">Training data</dt><dd className="text-ink-1">{spec.data}</dd>
                <dt className="text-ink-3">Acceptance</dt><dd className="num text-ink-1">{spec.metric} {spec.target}</dd>
                <dt className="text-ink-3">Result</dt>
                <dd className="flex items-center gap-1.5">
                  {ev ? (
                    <>
                      {ev.pass ? <CheckCircle2 className="size-3.5 text-good" aria-hidden /> : <XCircle className="size-3.5 text-critical" aria-hidden />}
                      <span className="num text-ink-1">{ev.display}</span>
                      <span className={ev.pass ? "text-good-ink" : "text-critical-ink"}>{ev.pass ? "meets target" : "below target"}</span>
                    </>
                  ) : (
                    <span className="flex items-center gap-1.5 text-ink-3"><CircleDashed className="size-3" aria-hidden /> Run the training pipeline to publish</span>
                  )}
                </dd>
                {rec && spec.id === "forecaster" && (
                  <>
                    <dt className="text-ink-3">Baselines</dt>
                    <dd className="num text-ink-1">
                      persistence {Number(rec.metrics.baseline_persistence_mae_kw).toFixed(2)} kW · GP {Number(rec.metrics.baseline_gp_mae_kw).toFixed(2)} kW
                    </dd>
                  </>
                )}
                {rec && <><dt className="text-ink-3">Trained</dt><dd className="text-ink-1">{timeAgo(rec.trainedAt)}</dd></>}
              </dl>
            </Card>
          );
        })}
      </div>

      <Card className="rise overflow-hidden">
        <CardHeader title="Datasets" description="Sources named in the problem statement" />
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {DATASETS.map((d) => (
            <li key={d.name} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-ink-1 hover:underline">
                  {d.name} <ExternalLink className="size-3 text-ink-3" aria-hidden />
                </a>
                <div className="text-2xs text-ink-3">{d.use}</div>
              </div>
              {d.ok ? <StatusBadge status="good">Used</StatusBadge> : <Tag>unavailable</Tag>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
