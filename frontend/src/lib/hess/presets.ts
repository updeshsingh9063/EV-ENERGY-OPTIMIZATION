import { DEFAULT_CONFIG, type HessConfig } from "./model";

export interface Vehicle {
  id: string;
  name: string;
  description: string;
  config: HessConfig;
  builtin?: boolean;
  createdAt: string;
}

/** Built-in vehicle presets. Also seeded into Supabase (backend/supabase/migrations/0002_seed.sql). */
export const BUILTIN_VEHICLES: Vehicle[] = [
  {
    id: "veh-compact",
    name: "Compact EV",
    description: "Passenger car · 96s Li-ion 60 Ah + 20.8 F SC bank",
    config: DEFAULT_CONFIG,
    builtin: true,
    createdAt: "2026-11-17T00:00:00.000Z",
  },
  {
    id: "veh-van",
    name: "Light commercial van",
    description: "Urban delivery · 108s Li-ion 100 Ah + 31 F SC bank",
    builtin: true,
    createdAt: "2026-11-17T00:00:00.000Z",
    config: {
      vehicle: { massKg: 2600, dragCoeff: 0.36, frontalAreaM2: 3.8, rollingCoeff: 0.011, drivetrainEff: 0.88, regenEff: 0.6, auxPowerW: 900 },
      battery: { seriesCells: 108, capacityAh: 100, cellOcvMin: 3.3, cellOcvMax: 4.15, packResistanceOhm: 0.09, socMin: 0.1, socMax: 0.95, maxCurrentA: 500 },
      supercap: { capacitanceF: 31.25, vMax: 432, vMinRatio: 0.5, esrOhm: 0.035, maxCurrentA: 500, converterEff: 0.95 },
    },
  },
];
