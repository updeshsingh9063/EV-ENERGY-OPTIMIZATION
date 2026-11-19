/**
 * Trained controllers for the in-app simulator.
 *
 * Mirrors model-training/src/voltsplit/{features,mpc,export}.py. The models themselves are
 * generated into ./generated/*.ts by the training pipeline.
 */
import type { Controller } from "./model";

export interface TreeTable {
  feat: number[];
  thr: number[];
  left: number[];
  right: number[];
  value: number[];
  roots: number[];
  base: number;
  scale: number;
  cmpLe: boolean;
}

/** Tree-ensemble inference with the same float32 comparison semantics as XGBoost / scikit-learn. */
export function predictTable(t: TreeTable, x: ArrayLike<number>): number {
  let s = 0;
  for (let r = 0; r < t.roots.length; r++) {
    let n = t.roots[r];
    while (t.feat[n] >= 0) {
      const xv = Math.fround(x[t.feat[n]]);
      n = (t.cmpLe ? xv <= t.thr[n] : xv < t.thr[n]) ? t.left[n] : t.right[n];
    }
    s += t.value[n];
  }
  return t.base + s * t.scale;
}

export const H = 10;
const LAGS = 5;

/**
 * Causal base features per time step (identical to features.base_features):
 * p, p lags 1..5, v, a, v lag1, v lag2, mean10(p), std10(p), grade.  p in kW.
 */
export function baseFeatures(pReqW: number[], speed: number[], grade?: number[]): Float64Array[] {
  const n = pReqW.length;
  const p = pReqW.map((x) => x / 1000);
  const rows: Float64Array[] = new Array(n);
  let cs = 0, cs2 = 0;
  const csArr = [0], cs2Arr = [0];
  for (let i = 0; i < n; i++) {
    cs += p[i]; cs2 += p[i] * p[i];
    csArr.push(cs); cs2Arr.push(cs2);
  }
  const lag = (arr: number[], i: number, k: number) => (i - k >= 0 ? arr[i - k] : arr[0]);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - 9), cnt = i - lo + 1;
    const mean = (csArr[i + 1] - csArr[lo]) / cnt;
    const v = Math.max((cs2Arr[i + 1] - cs2Arr[lo]) / cnt - mean * mean, 0);
    const r = new Float64Array(6 + 4 + 3);
    r[0] = p[i];
    for (let k = 1; k <= LAGS; k++) r[k] = lag(p, i, k);
    r[6] = speed[i];
    r[7] = i === 0 ? 0 : speed[i] - speed[i - 1];
    r[8] = lag(speed, i, 1);
    r[9] = lag(speed, i, 2);
    r[10] = mean;
    r[11] = Math.sqrt(v);
    r[12] = grade ? grade[i] : 0;
    rows[i] = r;
  }
  return rows;
}

export interface MpcParams {
  a_b: number; a_s: number; c_s: number; delta: number; w_s: number; w_d: number; w_T: number; rho: number;
  soc_ref: number; soc_lo: number; soc_hi: number; e_use_kj: number; u_abs_max: number; b_abs_max: number;
}

function bounds(pHat: number[], m: MpcParams) {
  const lo = pHat.map((p) => Math.max(-m.u_abs_max, p - m.b_abs_max));
  const hi = pHat.map((p, k) => Math.max(lo[k], Math.min(m.u_abs_max, p + m.b_abs_max)));
  return { lo, hi };
}

function gradient(u: number[], pHat: number[], e0: number, bPrev: number, m: MpcParams): number[] {
  const g = new Array<number>(H);
  const b = pHat.map((p, k) => p - u[k]);
  const db = b.map((bk, k) => bk - (k === 0 ? bPrev : b[k - 1]));
  const eLo = m.soc_lo * m.e_use_kj, eHi = m.soc_hi * m.e_use_kj, eRef = m.soc_ref * m.e_use_kj;
  const de = new Array<number>(H);
  let e = e0;
  for (let k = 0; k < H; k++) {
    e -= u[k];
    de[k] = 2 * m.rho * (-Math.max(0, eLo - e) + Math.max(0, e - eHi));
    if (k === H - 1) de[k] += 2 * m.w_T * (e - eRef);
  }
  let rev = 0;
  for (let k = H - 1; k >= 0; k--) {
    rev += de[k];
    const sm = Math.sqrt(u[k] * u[k] + m.delta * m.delta);
    g[k] =
      -2 * (m.a_b + m.w_s) * b[k] + 2 * m.a_s * u[k] + (m.c_s * u[k]) / sm
      - 2 * m.w_d * db[k] + (k < H - 1 ? 2 * m.w_d * db[k + 1] : 0)
      - rev;
  }
  return g;
}

/** Accelerated projected gradient (FISTA) on the MPC QP, twin of mpc.solve_pg. */
export function mpcSolve(pHat: number[], socSc: number, bPrev: number, m: MpcParams, u0?: number[], iters = 300): number[] {
  const { lo, hi } = bounds(pHat, m);
  const e0 = socSc * m.e_use_kj;
  const L = 2 * (m.a_b + m.w_s + m.a_s + 4 * m.w_d) + m.c_s / m.delta + 2 * (m.rho + m.w_T) * H * H;
  const step = 1 / L;
  const clip = (v: number, k: number) => Math.min(hi[k], Math.max(lo[k], v));
  let x = (u0 ?? new Array(H).fill(0)).map(clip);
  let y = x.slice();
  let t = 1;
  for (let it = 0; it < iters; it++) {
    const g = gradient(y, pHat, e0, bPrev, m);
    const xn = y.map((v, k) => clip(v - step * g[k], k));
    const tn = (1 + Math.sqrt(1 + 4 * t * t)) / 2;
    y = xn.map((v, k) => v + ((t - 1) / tn) * (v - x[k]));
    x = xn;
    t = tn;
  }
  return x;
}

export interface CycleContext {
  speedMs: number[];
  grade?: number[];
  pReqW: number[];
}

/** MPC using the learned demand forecaster (realistic, causal). */
export function forecastMpcController(ctx: CycleContext, forecaster: TreeTable, m: MpcParams): Controller {
  const X0 = baseFeatures(ctx.pReqW, ctx.speedMs, ctx.grade);
  let bPrev = 0;
  let warm: number[] | undefined;
  const row = new Float64Array(14);
  return (s, i) => {
    const pNow = ctx.pReqW[i] / 1000;
    row.set(X0[i]);
    const pHat = [pNow];
    for (let k = 1; k < H; k++) {
      row[13] = k;
      pHat.push(predictTable(forecaster, row));
    }
    const u = mpcSolve(pHat, s.socSc, bPrev, m, warm);
    warm = [...u.slice(1), u[H - 1]];
    bPrev = pNow - u[0];
    return u[0] * 1000;
  };
}

/** Distilled tree-ensemble policy + hard-limit guardrail (same as the exported C controller). */
export function distilledController(ctx: CycleContext, policy: TreeTable, m: MpcParams): Controller {
  const X0 = baseFeatures(ctx.pReqW, ctx.speedMs, ctx.grade);
  let bPrev = 0;
  const row = new Float64Array(15);
  return (s, i) => {
    const pNow = ctx.pReqW[i] / 1000;
    row.set(X0[i].subarray(0, 12));
    row[12] = s.socSc;
    row[13] = s.socBat;
    row[14] = bPrev;
    let u = predictTable(policy, row);
    if (!Number.isFinite(u) || Math.abs(u) > 1e4) u = pNow > 18 ? pNow - 18 : pNow < 0 ? pNow : 0; // fallback
    const lo = Math.max(-m.u_abs_max, pNow - m.b_abs_max);
    const hi = Math.min(m.u_abs_max, pNow + m.b_abs_max);
    u = Math.min(hi, Math.max(lo, u));
    bPrev = pNow - u;
    return u * 1000;
  };
}
