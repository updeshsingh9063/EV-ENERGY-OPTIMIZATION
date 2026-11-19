import { batteryOnly, ruleBased } from "./controllers";
import type { DriveCycle } from "./cycles";
import { distilledController, forecastMpcController, type CycleContext, type MpcParams, type TreeTable } from "./ml";

/** Trained models, loaded lazily from ./generated (≈1.3 MB); see loadModels(). */
export interface LoadedModels {
  version: string;
  policy: TreeTable;
  forecaster: TreeTable;
  mpc: MpcParams;
}

let modelsPromise: Promise<LoadedModels> | null = null;
export function loadModels(): Promise<LoadedModels> {
  modelsPromise ??= Promise.all([import("./generated/policy"), import("./generated/forecaster"), import("./generated/mpc")]).then(
    ([p, f, m]) => ({
      version: p.POLICY.version,
      policy: p.POLICY.table,
      forecaster: f.FORECASTER.table as unknown as TreeTable,
      mpc: m.MPC_PARAMS as unknown as MpcParams,
    }),
  );
  return modelsPromise;
}
import { powerDemand, simulate, type Controller, type HessConfig, type SimKpis, type SimResult } from "./model";

export type ControllerKey = "battery" | "rule" | "mpc" | "ml";

export interface ControllerDef {
  key: ControllerKey;
  label: string;
  kind: string;
  description: string;
  /** true when the controller is not a trained/production model (kept for future stand-ins). */
  preview: boolean;
  make: (ctx: CycleContext, cfg: HessConfig, models: LoadedModels) => Controller;
}

/** MPC weights from training; physical limits recomputed for the selected vehicle. */
export function mpcParamsFor(cfg: HessConfig, base: MpcParams): MpcParams {
  const b = cfg.battery, c = cfg.supercap;
  const vMin = c.vMax * c.vMinRatio;
  const eUse = 0.5 * c.capacitanceF * (c.vMax ** 2 - vMin ** 2);
  const vNom = (b.seriesCells * (b.cellOcvMin + b.cellOcvMax)) / 2;
  return {
    ...base,
    e_use_kj: eUse / 1000,
    u_abs_max: (c.maxCurrentA * vMin) / 1000,
    b_abs_max: (0.95 * b.maxCurrentA * vNom) / 1000,
  };
}

export const CONTROLLER_DEFS: ControllerDef[] = [
  {
    key: "battery",
    label: "Battery only",
    kind: "Baseline",
    description: "No supercapacitor. The reference every result is compared with.",
    preview: false,
    make: () => batteryOnly,
  },
  {
    key: "rule",
    label: "Rule-based",
    kind: "Baseline",
    description: "SC covers demand above 18 kW and all regen; recharges toward 70% while cruising.",
    preview: false,
    make: () => ruleBased(),
  },
  {
    key: "mpc",
    label: "MPC",
    kind: "Optimiser",
    description:
      "Model predictive control over a 10 s horizon using the learned demand forecaster and GP-fitted loss surrogates. Solved with OSQP offline and an equivalent FISTA solver in the browser.",
    preview: false,
    make: (ctx, cfg, m) => forecastMpcController(ctx, m.forecaster, mpcParamsFor(cfg, m.mpc)),
  },
  {
    key: "ml",
    label: "Distilled ML",
    kind: "Distilled tree-ensemble policy",
    description:
      "Tree-ensemble policy distilled from the forecast-MPC (with a DAgger round), wrapped in the hard-limit safety guardrail. Same model as the exported ECU C code.",
    preview: false,
    make: (ctx, cfg, m) => distilledController(ctx, m.policy, mpcParamsFor(cfg, m.mpc)),
  },
];

export const controllerDef = (k: ControllerKey) => CONTROLLER_DEFS.find((c) => c.key === k)!;

export interface InitialState {
  socBat: number;
  socSc: number;
}

export function runOne(config: HessConfig, cycle: DriveCycle, key: ControllerKey, init: InitialState, models: LoadedModels): SimResult {
  const pReq = powerDemand(cycle.speedMs, cycle.grade ?? null, config.vehicle);
  const ctx: CycleContext = { speedMs: cycle.speedMs, grade: cycle.grade, pReqW: pReq };
  return simulate(pReq, controllerDef(key).make(ctx, config, models), config, init);
}

export const pctDelta = (a: number, b: number) => (b === 0 ? 0 : ((a - b) / b) * 100);
export const fmtPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(1)}%`;

export const KPI_DEFS: { key: keyof SimKpis; label: string; unit: string; digits: number; hint: string }[] = [
  { key: "energyTotalKwh", label: "Total energy E_tot", unit: "kWh", digits: 3, hint: "Storage energy incl. converter and ESR losses" },
  { key: "peakCRate", label: "Peak C-rate", unit: "C", digits: 2, hint: "Highest battery current ÷ capacity" },
  { key: "rmsCurrentA", label: "RMS current", unit: "A", digits: 1, hint: "Drives I²R heating and ageing" },
  { key: "dodStress", label: "DoD cycle stress", unit: "idx", digits: 1, hint: "ΔSOC weighted by C-rate^1.3" },
  { key: "ahThroughput", label: "Ah throughput", unit: "Ah", digits: 2, hint: "Charge moved through the battery" },
  { key: "batteryLossKwh", label: "Battery I²R loss", unit: "kWh", digits: 4, hint: "Resistive loss inside the pack" },
];

export function toTraceData(res: SimResult, speedMs: number[]) {
  return {
    t: res.trace.t,
    speedKmh: speedMs.map((s) => s * 3.6),
    pReqKw: res.trace.pReq.map((p) => p / 1000),
    pBatKw: res.trace.pBat.map((p) => p / 1000),
    pScKw: res.trace.pSc.map((p) => p / 1000),
    socScPct: res.trace.socSc.map((s) => s * 100),
  };
}

export function traceCsv(res: SimResult, speedMs: number[]) {
  const rows = ["time_s,speed_kmh,p_req_kw,p_bat_kw,p_sc_kw,i_bat_a,soc_bat_pct,soc_sc_pct"];
  for (let i = 0; i < res.trace.t.length; i++) {
    rows.push(
      [
        res.trace.t[i],
        (speedMs[i] * 3.6).toFixed(2),
        (res.trace.pReq[i] / 1000).toFixed(3),
        (res.trace.pBat[i] / 1000).toFixed(3),
        (res.trace.pSc[i] / 1000).toFixed(3),
        res.trace.iBat[i].toFixed(2),
        (res.trace.socBat[i] * 100).toFixed(3),
        (res.trace.socSc[i] * 100).toFixed(2),
      ].join(","),
    );
  }
  return rows.join("\n");
}

export function downloadText(filename: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
