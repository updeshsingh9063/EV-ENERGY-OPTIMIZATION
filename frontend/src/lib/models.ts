/**
 * The four learned components from problem statement #96: static specification here,
 * trained versions and metrics come from the Supabase `models` table (see useActiveModel).
 */
import type { ModelRecord } from "./store";

export interface ModelSpec {
  id: "forecaster" | "loss-bat" | "loss-sc" | "policy";
  name: string;
  role: string;
  algorithms: string;
  inputs: string;
  output: string;
  metric: string;
  target: string;
  data: string;
  /** Extracts the acceptance metric from a published model's metrics. */
  evaluate: (metrics: Record<string, unknown>) => { value: number; display: string; pass: boolean };
}

export const MODELS: ModelSpec[] = [
  {
    id: "forecaster",
    name: "Demand forecaster",
    role: "Predicts traction power for the next H seconds so the controller can prepare the supercapacitor.",
    algorithms: "XGBoost GBM (stacked multi-horizon) · Gaussian Process baseline",
    inputs: "P_req and 5 lags, speed, acceleration, speed lags, 10 s rolling mean/std, grade, horizon k",
    output: "P̂_req(t+1 … t+H), H = 10 s",
    metric: "MAE vs persistence",
    target: "≥ 10 % lower",
    data: "FASTSim drive cycles (UDDS, HWFET + augmentations); tested on held-out US06, WLTC 3b",
    evaluate: (m) => {
      const mae = Number(m.mae_kw), base = Number(m.baseline_persistence_mae_kw);
      const gain = Number.isFinite(mae) && base > 0 ? 1 - mae / base : NaN;
      return {
        value: gain,
        display: Number.isFinite(gain) ? `${mae.toFixed(2)} kW (-${(gain * 100).toFixed(0)} %)` : "n/a",
        pass: Number.isFinite(gain) && gain >= 0.1,
      };
    },
  },
  {
    id: "loss-bat",
    name: "Battery loss surrogate",
    role: "Fast estimate of battery losses L_bat(P_bat) used inside the MPC cost.",
    algorithms: "Gaussian Process with calibrated uncertainty",
    inputs: "P_bat, SOC, internal-resistance growth (NASA aging)",
    output: "L_bat (W)",
    metric: "R²",
    target: "≥ 0.97",
    data: "NASA PCoE Li-ion aging data (887 impedance tests → resistance growth)",
    evaluate: (m) => num(m.r2, (v) => v.toFixed(4), (v) => v >= 0.97),
  },
  {
    id: "loss-sc",
    name: "Supercap loss surrogate",
    role: "Fast estimate of supercapacitor + converter losses L_sc(P_sc).",
    algorithms: "Gaussian Process with calibrated uncertainty",
    inputs: "P_sc, V_sc, ESR",
    output: "L_sc (W)",
    metric: "R²",
    target: "≥ 0.97",
    data: "Physics model (datasheet ESR, capacitance, converter efficiency)",
    evaluate: (m) => num(m.r2, (v) => v.toFixed(4), (v) => v >= 0.97),
  },
  {
    id: "policy",
    name: "Power-split policy",
    role: "Real-time controller distilled from offline MPC solutions; runs on the ECU.",
    algorithms: "XGBoost vs Random Forest, selected on closed-loop validation",
    inputs: "P_req and lags, speed/acceleration, rolling stats, SOC_sc, SOC_bat, previous P_bat",
    output: "P_sc command (P_bat = P_req - P_sc)",
    metric: "Imitation MAE",
    target: "≤ 1.0 kW",
    data: "Forecast-MPC solutions on training cycles + one DAgger round",
    evaluate: (m) => num(m.imitation_mae_kw, (v) => `${v.toFixed(2)} kW`, (v) => v <= 1.0),
  },
];

function num(x: unknown, fmt: (v: number) => string, ok: (v: number) => boolean) {
  const v = typeof x === "number" ? x : NaN;
  return { value: v, display: Number.isFinite(v) ? fmt(v) : "n/a", pass: Number.isFinite(v) && ok(v) };
}

export type { ModelRecord };
