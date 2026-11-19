/**
 * Exports the frontend's vehicle presets, built-in cycles and reference simulation
 * KPIs for the Python pipeline (config + parity fixtures). Run: npx tsx scripts/export-for-training.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import * as cyclesMod from "../src/lib/hess/cycles";
import * as modelMod from "../src/lib/hess/model";
import * as ctrlMod from "../src/lib/hess/controllers";
import * as presetsMod from "../src/lib/hess/presets";

const pick = <T,>(m: T) => ((m as unknown as { default?: T }).default ?? m) as T;
const { BUILTIN_CYCLES } = pick(cyclesMod);
const { powerDemand, simulate } = pick(modelMod);
const { batteryOnly, ruleBased } = pick(ctrlMod);
const { BUILTIN_VEHICLES } = pick(presetsMod);

const root = new URL("../../model-training/", import.meta.url);
mkdirSync(new URL("config/", root), { recursive: true });
mkdirSync(new URL("tests/fixtures/", root), { recursive: true });

const names: Record<string, string> = { "veh-compact": "compact_ev", "veh-van": "light_van" };
for (const v of BUILTIN_VEHICLES) writeFileSync(new URL(`config/${names[v.id]}.json`, root), JSON.stringify(v.config, null, 2));

const parity: Record<string, unknown> = {};
for (const c of BUILTIN_CYCLES) {
  const cfg = BUILTIN_VEHICLES[0].config;
  const pReq = powerDemand(c.speedMs, null, cfg.vehicle);
  parity[c.id] = {
    speedMs: c.speedMs,
    pReqSum: pReq.reduce((a, b) => a + b, 0),
    battery: simulate(pReq, batteryOnly, cfg).kpis,
    rule: simulate(pReq, ruleBased(), cfg).kpis,
  };
}
writeFileSync(new URL("tests/fixtures/ts_parity.json", root), JSON.stringify(parity));
console.log("exported", BUILTIN_VEHICLES.length, "configs and parity for", BUILTIN_CYCLES.length, "cycles");
