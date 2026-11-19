import type { Controller } from "./model";

/** Baseline: no supercapacitor contribution. */
export const batteryOnly: Controller = () => 0;

/**
 * Rule-based baseline (industry default):
 * SC takes demand above a threshold, absorbs all regen, and slowly
 * recharges toward a target state of charge when the vehicle is cruising.
 */
export function ruleBased(thresholdW = 18_000, socTarget = 0.7, kRecharge = 25_000): Controller {
  return (s) => {
    if (s.pReq > thresholdW) return s.pReq - thresholdW;
    if (s.pReq < 0) return s.pReq;
    return -kRecharge * (socTarget - s.socSc);
  };
}

// Trained controllers (forecast-MPC, distilled ML policy) live in ./ml.ts.
