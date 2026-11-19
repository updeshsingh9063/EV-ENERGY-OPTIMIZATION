import assert from "node:assert/strict";
import { test } from "node:test";
import { cycleStats, parseCycleCsv } from "../src/lib/hess/cycles";

test("parses km/h CSV and resamples to 1 Hz", () => {
  const r = parseCycleCsv("time,speed_kmh\n0,0\n2,36\n4,72\n" + Array.from({ length: 10 }, (_, i) => `${6 + i},72`).join("\n"));
  assert.equal(r.ok, true);
  assert.equal(r.speedMs!.length, 16);
  assert.ok(Math.abs(r.speedMs![1] - 5) < 1e-9); // 18 km/h interpolated
});

test("converts mph and reads percent grade", () => {
  const rows = Array.from({ length: 12 }, (_, i) => `${i},${i},2`).join("\n");
  const r = parseCycleCsv(`t,speed_mph,grade_pct\n${rows}`);
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.speedMs![10] - 4.4704) < 1e-9);
  assert.ok(Math.abs(r.grade![3] - 0.02) < 1e-12);
});

test("rejects files without required columns", () => {
  const r = parseCycleCsv("a,b\n1,2\n3,4\n5,6\n");
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /time column/);
});

test("skips bad rows with a warning", () => {
  const rows = Array.from({ length: 12 }, (_, i) => `${i},${10 + i}`).join("\n");
  const r = parseCycleCsv(`time,speed_kmh\n${rows}\nx,y\n5,99`);
  assert.equal(r.ok, true);
  assert.match(r.warnings.join(" "), /2 row/);
});

test("cycle statistics", () => {
  const s = cycleStats([0, 10, 10, 0]);
  assert.equal(s.durationS, 4);
  assert.equal(s.distanceKm, 0.02);
  assert.equal(s.maxKmh, 36);
});
