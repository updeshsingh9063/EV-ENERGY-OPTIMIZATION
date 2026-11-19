/**
 * The in-browser controllers must reproduce the Python closed-loop results in
 * model-training/reports/evaluation.json on the held-out cycles.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { DEFAULT_CONFIG, powerDemand, simulate } from "../src/lib/hess/model";
import { loadModels, runOne } from "../src/lib/hess/registry";

const ROOT = new URL("../../model-training/", import.meta.url);
const reportPath = new URL("reports/evaluation.json", ROOT);

function loadCycle(key: string) {
  const lines = readFileSync(new URL(`data/raw/cycles/${key}.csv`, ROOT), "utf8").trim().split(/\r?\n/).slice(1);
  const t = lines.map((l) => Number(l.split(",")[0]));
  const v = lines.map((l) => Number(l.split(",")[1]));
  const out: number[] = [];
  let j = 0;
  for (let s = t[0]; s <= t[t.length - 1] + 1e-9; s += 1) {
    while (j < t.length - 2 && t[j + 1] < s) j++;
    const f = Math.min(1, Math.max(0, (s - t[j]) / (t[j + 1] - t[j])));
    out.push(Math.max(0, v[j] + f * (v[j + 1] - v[j])));
  }
  return out;
}

const available = existsSync(reportPath) && existsSync(new URL("data/raw/cycles/us06.csv", ROOT));

for (const key of ["us06", "wltc_3b"]) {
  test(`distilled policy and MPC match Python on ${key}`, { skip: !available && "run the training pipeline first" }, async () => {
    const models = await loadModels();
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const py = report.evaluation[key];
    const speedMs = loadCycle(key);
    const cycle = { id: key, name: key, source: "dataset" as const, description: "", speedMs, createdAt: "" };
    const pReq = powerDemand(speedMs, null, DEFAULT_CONFIG.vehicle);
    assert.ok(Math.abs(simulate(pReq, () => 0, DEFAULT_CONFIG).kpis.energyTotalKwh - py.battery_only.energyTotalKwh) < 1e-9);

    const init = { socBat: 0.8, socSc: 0.75 };
    const ml = runOne(DEFAULT_CONFIG, cycle, "ml", init, models).kpis;
    for (const k of ["energyTotalKwh", "dodStress", "peakCRate"] as const) {
      const rel = Math.abs(ml[k] / py.distilled_ml[k] - 1);
      assert.ok(rel < 0.005, `ml ${k}: ts ${ml[k]} vs py ${py.distilled_ml[k]} (${(rel * 100).toFixed(2)}%)`);
    }
    const mpc = runOne(DEFAULT_CONFIG, cycle, "mpc", init, models).kpis;
    for (const k of ["energyTotalKwh", "dodStress"] as const) {
      const rel = Math.abs(mpc[k] / py.mpc_forecast[k] - 1);
      assert.ok(rel < 0.03, `mpc ${k}: ts ${mpc[k]} vs py ${py.mpc_forecast[k]} (${(rel * 100).toFixed(2)}%)`);
    }
  });
}
