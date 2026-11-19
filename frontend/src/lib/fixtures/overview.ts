/**
 * Overview dashboard: one drive cycle run through every controller for the active vehicle.
 * Prefers the FASTSim dataset cycles published by the training pipeline; falls back to the
 * built-in synthetic cycles if none are available.
 */
import type { DriveCycle } from "@/lib/hess/cycles";
import type { HessConfig, SimResult } from "@/lib/hess/model";
import { CONTROLLER_DEFS, runOne, type ControllerKey, type LoadedModels } from "@/lib/hess/registry";

export const CONTROLLERS = CONTROLLER_DEFS;
export type { ControllerKey };

const INIT = { socBat: 0.8, socSc: 0.75 };
const SHORT: Record<string, string> = {
  "ds-udds": "UDDS", "ds-hwfet": "HWFET", "ds-us06": "US06", "ds-wltc_3b": "WLTC 3b",
  "syn-urban": "Urban", "syn-highway": "Highway", "syn-aggressive": "Aggressive",
};
export const shortName = (c: DriveCycle) => SHORT[c.id] ?? c.name;

export function overviewCycles(all: DriveCycle[]): DriveCycle[] {
  const ds = all.filter((c) => c.source === "dataset");
  return ds.length ? ds : all.filter((c) => c.source === "synthetic");
}

export function runCycle(cycle: DriveCycle, config: HessConfig, models: LoadedModels): Record<ControllerKey, SimResult> & { speedKmh: number[] } {
  const out = { speedKmh: cycle.speedMs.map((s) => s * 3.6) } as Record<ControllerKey, SimResult> & { speedKmh: number[] };
  for (const c of CONTROLLER_DEFS) out[c.key] = runOne(config, cycle, c.key, INIT, models);
  return out;
}
