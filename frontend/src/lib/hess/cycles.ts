/** Drive-cycle utilities: synthetic builder, statistics, CSV parsing. */

export interface DriveCycle {
  id: string;
  name: string;
  source: "synthetic" | "upload" | "dataset";
  description: string;
  /** Vehicle speed in m/s, uniformly sampled at 1 Hz. */
  speedMs: number[];
  /** Optional road grade (rise/run) per sample. */
  grade?: number[];
  createdAt: string;
}

type Trip = [targetKmh: number, accel: number, cruiseS: number, decel: number, stopS: number];

export function buildSyntheticCycle(trips: Trip[], seed: number): number[] {
  const v: number[] = [];
  let x = seed;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280) - 0.5;
  for (const [kmh, acc, cruise, dec, stop] of trips) {
    const target = kmh / 3.6;
    let s = 0;
    while (s < target) {
      s = Math.min(target, s + acc * (1 + 0.3 * rnd()) * (1 - 0.45 * (s / target)));
      v.push(s);
    }
    for (let k = 0; k < cruise; k++)
      v.push(Math.max(0, target + Math.sin(k / 9 + seed) * 0.7 + Math.sin(k / 3.1) * 0.12 + rnd() * 0.06));
    s = v[v.length - 1];
    while (s > 0) {
      s = Math.max(0, s - dec);
      v.push(s);
    }
    for (let k = 0; k < stop; k++) v.push(0);
  }
  return v;
}

const EPOCH = "2026-11-17T00:00:00.000Z";

export const BUILTIN_CYCLES: DriveCycle[] = [
  {
    id: "syn-urban",
    name: "Urban (synthetic)",
    source: "synthetic",
    description: "Stop-and-go city driving",
    createdAt: EPOCH,
    speedMs: buildSyntheticCycle(
      [
        [32, 1.1, 22, 1.3, 14], [48, 1.0, 40, 1.4, 20], [25, 1.3, 12, 1.5, 9],
        [55, 0.9, 60, 1.2, 26], [38, 1.2, 25, 1.6, 12], [50, 1.0, 45, 1.3, 30],
        [30, 1.4, 18, 1.5, 10], [45, 1.1, 34, 1.3, 18], [60, 0.9, 52, 1.1, 22],
        [28, 1.3, 15, 1.4, 16],
      ],
      7,
    ),
  },
  {
    id: "syn-highway",
    name: "Highway (synthetic)",
    source: "synthetic",
    description: "Sustained high-speed cruising",
    createdAt: EPOCH,
    speedMs: buildSyntheticCycle(
      [[70, 0.9, 80, 0.8, 4], [105, 0.6, 210, 0.5, 0], [88, 0.6, 140, 0.9, 6], [118, 0.7, 160, 1.0, 20]],
      19,
    ),
  },
  {
    id: "syn-aggressive",
    name: "Aggressive (synthetic)",
    source: "synthetic",
    description: "Hard accelerations, high power peaks",
    createdAt: EPOCH,
    speedMs: buildSyntheticCycle(
      [
        [62, 2.6, 18, 2.8, 8], [95, 2.3, 30, 2.6, 6], [45, 2.9, 10, 3.0, 5],
        [120, 2.1, 40, 2.4, 10], [70, 2.7, 20, 2.9, 7], [105, 2.2, 28, 2.7, 15],
      ],
      31,
    ),
  },
];

export interface CycleStats {
  durationS: number;
  distanceKm: number;
  avgKmh: number;
  maxKmh: number;
  maxAccel: number;
  stopShare: number;
}

export function cycleStats(speedMs: number[]): CycleStats {
  const n = speedMs.length;
  let dist = 0, maxV = 0, maxA = 0, stops = 0;
  for (let i = 0; i < n; i++) {
    dist += speedMs[i];
    maxV = Math.max(maxV, speedMs[i]);
    if (i) maxA = Math.max(maxA, speedMs[i] - speedMs[i - 1]);
    if (speedMs[i] < 0.1) stops++;
  }
  return {
    durationS: n,
    distanceKm: dist / 1000,
    avgKmh: (dist / Math.max(n, 1)) * 3.6,
    maxKmh: maxV * 3.6,
    maxAccel: maxA,
    stopShare: stops / Math.max(n, 1),
  };
}

export interface CsvParseResult {
  ok: boolean;
  speedMs?: number[];
  grade?: number[];
  rows?: number;
  errors: string[];
  warnings: string[];
}

/**
 * Parses a drive-cycle CSV. Requires a time column (`time`/`t`/`time_s`) and a speed
 * column (`speed_kmh`, `speed_mph` or `speed_ms`). Optional `grade` column.
 * Resamples to 1 Hz by linear interpolation.
 */
export function parseCycleCsv(text: string): CsvParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 3) return { ok: false, errors: ["File has fewer than 3 rows."], warnings };

  const delim = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const head = lines[0].split(delim).map((h) => h.trim().toLowerCase().replace(/[\s()/]+/g, "_").replace(/_+$/, ""));
  const tCol = head.findIndex((h) => ["time", "t", "time_s", "seconds", "s"].includes(h));
  const speedCols: [string, number][] = [
    ["speed_kmh", 1 / 3.6], ["kmh", 1 / 3.6], ["speed_km_h", 1 / 3.6],
    ["speed_mph", 0.44704], ["mph", 0.44704],
    ["speed_ms", 1], ["speed_m_s", 1], ["speed", 1 / 3.6],
  ];
  let vCol = -1, factor = 1;
  for (const [name, f] of speedCols) {
    const i = head.indexOf(name);
    if (i >= 0) { vCol = i; factor = f; break; }
  }
  const gCol = head.findIndex((h) => h === "grade" || h === "grade_pct" || h === "slope");
  if (tCol < 0) errors.push("Missing time column (expected `time`, `t` or `time_s`).");
  if (vCol < 0) errors.push("Missing speed column (expected `speed_kmh`, `speed_mph` or `speed_ms`).");
  if (errors.length) return { ok: false, errors, warnings };
  if (head[vCol] === "speed") warnings.push("Column `speed` assumed to be km/h.");

  const t: number[] = [], v: number[] = [], g: number[] = [];
  let bad = 0;
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(delim);
    const ti = parseFloat(c[tCol]), vi = parseFloat(c[vCol]);
    if (!Number.isFinite(ti) || !Number.isFinite(vi)) { bad++; continue; }
    if (t.length && ti <= t[t.length - 1]) { bad++; continue; }
    t.push(ti);
    v.push(Math.max(0, vi * factor));
    if (gCol >= 0) {
      const gi = parseFloat(c[gCol]);
      g.push(Number.isFinite(gi) ? (head[gCol] === "grade_pct" ? gi / 100 : gi) : 0);
    }
  }
  if (bad) warnings.push(`${bad} row(s) skipped (non-numeric or non-increasing time).`);
  if (t.length < 10) return { ok: false, errors: ["Fewer than 10 valid rows."], warnings };
  const dur = t[t.length - 1] - t[0];
  if (dur > 4 * 3600) return { ok: false, errors: ["Cycle longer than 4 hours."], warnings };
  if (Math.max(...v) > 70) errors.push("Speeds above 250 km/h. Check the unit column.");
  if (errors.length) return { ok: false, errors, warnings };

  // Resample to 1 Hz
  const out: number[] = [], og: number[] = [];
  let j = 0;
  for (let s = t[0]; s <= t[t.length - 1]; s += 1) {
    while (j < t.length - 2 && t[j + 1] < s) j++;
    const f = Math.min(1, Math.max(0, (s - t[j]) / (t[j + 1] - t[j])));
    out.push(v[j] + f * (v[j + 1] - v[j]));
    if (g.length) og.push(g[j] + f * (g[j + 1] - g[j]));
  }
  return { ok: true, speedMs: out, grade: g.length ? og : undefined, rows: t.length, errors, warnings };
}
