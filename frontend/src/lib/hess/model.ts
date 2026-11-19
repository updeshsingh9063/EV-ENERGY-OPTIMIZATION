/**
 * HESS physics model: vehicle longitudinal dynamics, battery (Rint),
 * supercapacitor (ideal C + ESR) and DC/DC converter.
 *
 * This is the same model the Supabase `simulate` Edge Function will run.
 * All quantities are SI unless the name says otherwise (…Kw, …Kmh, …Pct).
 */

export interface VehicleParams {
  massKg: number;
  dragCoeff: number;
  frontalAreaM2: number;
  rollingCoeff: number;
  drivetrainEff: number; // motor + inverter + gearbox, traction
  regenEff: number; // fraction of braking power recoverable at the bus
  auxPowerW: number;
}

export interface BatteryParams {
  seriesCells: number;
  capacityAh: number;
  cellOcvMin: number; // V at SOC 0
  cellOcvMax: number; // V at SOC 1
  packResistanceOhm: number;
  socMin: number;
  socMax: number;
  maxCurrentA: number;
}

export interface SupercapParams {
  capacitanceF: number; // pack
  vMax: number;
  vMinRatio: number; // usable window lower bound as fraction of vMax
  esrOhm: number;
  maxCurrentA: number;
  converterEff: number;
}

export interface HessConfig {
  vehicle: VehicleParams;
  battery: BatteryParams;
  supercap: SupercapParams;
}

export const DEFAULT_CONFIG: HessConfig = {
  vehicle: {
    massKg: 1550,
    dragCoeff: 0.29,
    frontalAreaM2: 2.2,
    rollingCoeff: 0.0095,
    drivetrainEff: 0.9,
    regenEff: 0.65,
    auxPowerW: 600,
  },
  battery: {
    seriesCells: 96,
    capacityAh: 60,
    cellOcvMin: 3.3,
    cellOcvMax: 4.15,
    packResistanceOhm: 0.12,
    socMin: 0.1,
    socMax: 0.95,
    maxCurrentA: 360,
  },
  supercap: {
    capacitanceF: 20.8, // 144 × 3000 F cells in series
    vMax: 388,
    vMinRatio: 0.5,
    esrOhm: 0.042,
    maxCurrentA: 400,
    converterEff: 0.95,
  },
};

const RHO_AIR = 1.2;
const G = 9.81;

/** Electrical power demanded at the DC bus (W). Negative = regenerative braking. */
export function powerDemand(speedMs: number[], grade: number[] | null, v: VehicleParams, dt = 1): number[] {
  const out = new Array<number>(speedMs.length);
  for (let i = 0; i < speedMs.length; i++) {
    const s = speedMs[i];
    const a = i === 0 ? 0 : (s - speedMs[i - 1]) / dt;
    const theta = grade ? Math.atan(grade[i]) : 0;
    const fWheel =
      v.massKg * a +
      0.5 * RHO_AIR * v.dragCoeff * v.frontalAreaM2 * s * s +
      v.massKg * G * v.rollingCoeff * (s > 0.1 ? 1 : 0) * Math.cos(theta) +
      v.massKg * G * Math.sin(theta);
    const pWheel = fWheel * s;
    const pBus = pWheel >= 0 ? pWheel / v.drivetrainEff : pWheel * v.regenEff;
    out[i] = pBus + v.auxPowerW;
  }
  return out;
}

/** What a controller sees each step. */
export interface ControllerState {
  t: number;
  pReq: number;
  socBat: number;
  socSc: number; // energy-based state of charge of usable window, 0..1
  vSc: number;
}

/** A controller returns the commanded supercap power at the DC bus (W). */
export type Controller = (s: ControllerState, i: number, pReqTrace: number[]) => number;

export interface SimTrace {
  t: number[];
  pReq: number[];
  pBat: number[];
  pSc: number[];
  iBat: number[];
  socBat: number[];
  socSc: number[];
}

export interface SimKpis {
  /** Net energy drawn from storage incl. all losses and SC state change (kWh). */
  energyTotalKwh: number;
  batteryLossKwh: number;
  scLossKwh: number;
  converterLossKwh: number;
  peakCRate: number;
  rmsCurrentA: number;
  ahThroughput: number;
  /** Battery DoD cycle stress proxy: Σ|ΔSOC| weighted by C-rate^1.3 (dimensionless, relative). */
  dodStress: number;
  constraintViolations: number;
}

export interface SimResult {
  trace: SimTrace;
  kpis: SimKpis;
}

function ocvPack(b: BatteryParams, soc: number) {
  return b.seriesCells * (b.cellOcvMin + (b.cellOcvMax - b.cellOcvMin) * soc);
}

export function simulate(
  pReq: number[],
  controller: Controller,
  cfg: HessConfig = DEFAULT_CONFIG,
  init = { socBat: 0.8, socSc: 0.75 },
  dt = 1,
): SimResult {
  const { battery: b, supercap: c } = cfg;
  const vMin = c.vMax * c.vMinRatio;
  const eMax = 0.5 * c.capacitanceF * c.vMax ** 2;
  const eMin = 0.5 * c.capacitanceF * vMin ** 2;
  const eUse = eMax - eMin;

  let socBat = init.socBat;
  let eSc = eMin + init.socSc * eUse;
  const eSc0 = eSc;

  const n = pReq.length;
  const tr: SimTrace = { t: [], pReq: [], pBat: [], pSc: [], iBat: [], socBat: [], socSc: [] };
  let eChem = 0, lossBat = 0, lossSc = 0, lossConv = 0;
  let peakI = 0, sumI2 = 0, ah = 0, stress = 0, violations = 0;

  for (let i = 0; i < n; i++) {
    const vSc = Math.sqrt((2 * eSc) / c.capacitanceF);
    const socSc = (eSc - eMin) / eUse;
    let pSc = controller({ t: i * dt, pReq: pReq[i], socBat, socSc, vSc }, i, pReq);

    // Supercap terminal power and hard limits (energy window + current limit)
    const pScMaxByI = c.maxCurrentA * vSc;
    pSc = Math.max(-pScMaxByI, Math.min(pScMaxByI, pSc));
    let pTerm = pSc >= 0 ? pSc / c.converterEff : pSc * c.converterEff;
    const iSc = pTerm / vSc;
    const scLoss = iSc * iSc * c.esrOhm;
    let eNext = eSc - (pTerm + scLoss) * dt;
    if (eNext < eMin || eNext > eMax) {
      const target = eNext < eMin ? eMin : eMax;
      pTerm = (eSc - target) / dt - scLoss;
      pSc = pTerm >= 0 ? pTerm * c.converterEff : pTerm / c.converterEff;
      eNext = target;
    }
    lossConv += Math.abs(pTerm - pSc) * dt;
    lossSc += scLoss * dt;
    eSc = eNext;

    // Battery supplies the remainder
    const pBat = pReq[i] - pSc;
    const voc = ocvPack(b, socBat);
    const R = b.packResistanceOhm;
    const disc = Math.max(voc * voc - 4 * R * pBat, 0);
    const iBat = (voc - Math.sqrt(disc)) / (2 * R);
    const loss = iBat * iBat * R;
    socBat -= (iBat * dt) / (3600 * b.capacityAh);
    if (Math.abs(iBat) > b.maxCurrentA || socBat < b.socMin || socBat > b.socMax) violations++;

    eChem += voc * iBat * dt;
    lossBat += loss * dt;
    const aI = Math.abs(iBat);
    peakI = Math.max(peakI, aI);
    sumI2 += iBat * iBat;
    ah += (aI * dt) / 3600;
    stress += ((aI * dt) / (3600 * b.capacityAh)) * Math.pow(aI / b.capacityAh, 1.3);

    tr.t.push(i * dt);
    tr.pReq.push(pReq[i]);
    tr.pBat.push(pBat);
    tr.pSc.push(pSc);
    tr.iBat.push(iBat);
    tr.socBat.push(socBat);
    tr.socSc.push((eSc - eMin) / eUse);
  }

  const J_PER_KWH = 3.6e6;
  return {
    trace: tr,
    kpis: {
      energyTotalKwh: (eChem + (eSc0 - eSc)) / J_PER_KWH,
      batteryLossKwh: lossBat / J_PER_KWH,
      scLossKwh: lossSc / J_PER_KWH,
      converterLossKwh: lossConv / J_PER_KWH,
      peakCRate: peakI / b.capacityAh,
      rmsCurrentA: Math.sqrt(sumI2 / n),
      ahThroughput: ah,
      dodStress: stress * 1000,
      constraintViolations: violations,
    },
  };
}
