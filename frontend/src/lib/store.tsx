"use client";

/**
 * Client data layer backed by Supabase (Postgres + Row Level Security).
 *
 * Pages only use this hook. Every query runs with the signed-in user's session
 * and the publishable key; RLS restricts rows to the user's own data plus the
 * shared built-in vehicles and drive cycles.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { BUILTIN_CYCLES, type DriveCycle } from "./hess/cycles";
import type { HessConfig, SimKpis } from "./hess/model";
import { BUILTIN_VEHICLES, type Vehicle } from "./hess/presets";
import type { ControllerKey, InitialState } from "./hess/registry";
import { createClient } from "./supabase/client";

export { BUILTIN_VEHICLES };
export type { Vehicle };

export interface Run {
  id: string;
  seq: number;
  vehicleId: string;
  vehicleName: string;
  config: HessConfig;
  cycleId: string;
  cycleName: string;
  controller: ControllerKey;
  init: InitialState;
  kpis: SimKpis;
  baseline: SimKpis;
  createdAt: string;
  computeMs: number;
}
export type NewRun = Omit<Run, "id" | "seq" | "createdAt">;

export type ModelKind = "forecaster" | "loss-bat" | "loss-sc" | "policy";
export interface ModelRecord {
  id: string;
  kind: ModelKind;
  version: string;
  status: "training" | "candidate" | "active" | "archived";
  metrics: Record<string, unknown>;
  artifactPath: string | null;
  notes: string | null;
  trainedAt: string;
}

/* ---------------------------------------------------------------- row mapping */

interface VehicleRow { id: string; name: string; description: string; config: HessConfig; is_builtin: boolean; created_at: string }
interface CycleRow { id: string; name: string; description: string; source: DriveCycle["source"]; speed_ms: number[]; grade: number[] | null; created_at: string }
interface RunRow {
  id: string; seq: number; vehicle_id: string | null; vehicle_name: string; config: HessConfig;
  cycle_id: string | null; cycle_name: string; controller: ControllerKey; init: InitialState;
  kpis: SimKpis; baseline: SimKpis; compute_ms: number; created_at: string;
}

const toVehicle = (r: VehicleRow): Vehicle => ({
  id: r.id, name: r.name, description: r.description, config: r.config, builtin: r.is_builtin, createdAt: r.created_at,
});
const toCycle = (r: CycleRow): DriveCycle => ({
  id: r.id, name: r.name, description: r.description, source: r.source, speedMs: r.speed_ms, grade: r.grade ?? undefined, createdAt: r.created_at,
});
const toRun = (r: RunRow): Run => ({
  id: r.id, seq: r.seq, vehicleId: r.vehicle_id ?? "", vehicleName: r.vehicle_name, config: r.config,
  cycleId: r.cycle_id ?? "", cycleName: r.cycle_name, controller: r.controller, init: r.init,
  kpis: r.kpis, baseline: r.baseline, computeMs: r.compute_ms, createdAt: r.created_at,
});

const byBuiltinThenDate = <T extends { createdAt: string }>(builtin: (x: T) => boolean) => (a: T, b: T) =>
  Number(builtin(b)) - Number(builtin(a)) || a.createdAt.localeCompare(b.createdAt);

/* ---------------------------------------------------------------- context */

interface StoreShape {
  ready: boolean;
  error: string | null;
  user: User | null;
  displayName: string;
  vehicles: Vehicle[];
  cycles: DriveCycle[];
  runs: Run[];
  models: ModelRecord[];
  activeVehicleId: string;
  signedUrl: (path: string) => Promise<string>;
  setActiveVehicle: (id: string) => Promise<void>;
  saveVehicle: (v: Vehicle) => Promise<Vehicle>;
  deleteVehicle: (id: string) => Promise<void>;
  addCycle: (c: Omit<DriveCycle, "createdAt">) => Promise<DriveCycle>;
  deleteCycle: (id: string) => Promise<void>;
  addRuns: (r: NewRun[]) => Promise<Run[]>;
  deleteRuns: (ids: string[]) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}

const Ctx = createContext<StoreShape | null>(null);

export function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function fail(e: { message: string } | null): asserts e is null {
  if (e) throw new Error(e.message);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState("");
  // Built-ins from code render instantly; replaced by the identical seeded rows once loaded.
  const [vehicles, setVehicles] = useState<Vehicle[]>(BUILTIN_VEHICLES);
  const [cycles, setCycles] = useState<DriveCycle[]>(BUILTIN_CYCLES);
  const [runs, setRuns] = useState<Run[]>([]);
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [activeVehicleId, setActiveVehicleId] = useState(BUILTIN_VEHICLES[0].id);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      setUser(auth.user);
      if (!auth.user) return;
      const [v, c, r, p, m] = await Promise.all([
        supabase.from("vehicles").select("id,name,description,config,is_builtin,created_at"),
        supabase.from("drive_cycles").select("id,name,description,source,speed_ms,grade,created_at"),
        supabase.from("runs").select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("profiles").select("display_name,active_vehicle_id").eq("id", auth.user.id).maybeSingle(),
        supabase.from("models").select("*").order("trained_at", { ascending: false }),
      ]);
      fail(v.error); fail(c.error); fail(r.error); fail(p.error); fail(m.error);
      setModels(
        (m.data as { id: string; kind: ModelKind; version: string; status: ModelRecord["status"]; metrics: Record<string, unknown>; artifact_path: string | null; notes: string | null; trained_at: string }[]).map((x) => ({
          id: x.id, kind: x.kind, version: x.version, status: x.status, metrics: x.metrics,
          artifactPath: x.artifact_path, notes: x.notes, trainedAt: x.trained_at,
        })),
      );
      setVehicles((v.data as VehicleRow[]).map(toVehicle).sort(byBuiltinThenDate((x) => !!x.builtin)));
      setCycles((c.data as CycleRow[]).map(toCycle).sort(byBuiltinThenDate((x) => x.source !== "upload")));
      setRuns((r.data as RunRow[]).map(toRun));
      setDisplayName(p.data?.display_name ?? auth.user.email ?? "");
      if (p.data?.active_vehicle_id) setActiveVehicleId(p.data.active_vehicle_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReady(true);
    }
  }, [supabase]);

  useEffect(() => {
    load();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") window.location.href = "/login";
    });
    return () => data.subscription.unsubscribe();
  }, [load, supabase]);

  const setActiveVehicle = useCallback(
    async (id: string) => {
      const prev = activeVehicleId;
      setActiveVehicleId(id);
      const { error } = await supabase.from("profiles").update({ active_vehicle_id: id }).eq("id", user!.id);
      if (error) {
        setActiveVehicleId(prev);
        throw new Error(error.message);
      }
    },
    [supabase, user, activeVehicleId],
  );

  const saveVehicle = useCallback(
    async (v: Vehicle) => {
      if (v.builtin) throw new Error("Built-in vehicles are read-only.");
      const { data, error } = await supabase
        .from("vehicles")
        .upsert({ id: v.id, owner_id: user!.id, name: v.name, description: v.description, config: v.config })
        .select("id,name,description,config,is_builtin,created_at")
        .single();
      fail(error);
      const saved = toVehicle(data as VehicleRow);
      setVehicles((s) => (s.some((x) => x.id === saved.id) ? s.map((x) => (x.id === saved.id ? saved : x)) : [...s, saved]));
      return saved;
    },
    [supabase, user],
  );

  const deleteVehicle = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      fail(error);
      setVehicles((s) => s.filter((x) => x.id !== id));
      setRuns((s) => s.map((r) => (r.vehicleId === id ? { ...r, vehicleId: "" } : r)));
      if (activeVehicleId === id) setActiveVehicleId(BUILTIN_VEHICLES[0].id);
    },
    [supabase, activeVehicleId],
  );

  const addCycle = useCallback(
    async (c: Omit<DriveCycle, "createdAt">) => {
      const { data, error } = await supabase
        .from("drive_cycles")
        .insert({
          id: c.id, owner_id: user!.id, name: c.name, description: c.description, source: "upload",
          speed_ms: c.speedMs.map((x) => Math.round(x * 1e4) / 1e4),
          grade: c.grade ? c.grade.map((x) => Math.round(x * 1e5) / 1e5) : null,
        })
        .select("id,name,description,source,speed_ms,grade,created_at")
        .single();
      fail(error);
      const saved = toCycle(data as CycleRow);
      setCycles((s) => [...s, saved]);
      return saved;
    },
    [supabase, user],
  );

  const deleteCycle = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("drive_cycles").delete().eq("id", id);
      fail(error);
      setCycles((s) => s.filter((x) => x.id !== id));
      setRuns((s) => s.map((r) => (r.cycleId === id ? { ...r, cycleId: "" } : r)));
    },
    [supabase],
  );

  const addRuns = useCallback(
    async (rs: NewRun[]) => {
      const created: Run[] = [];
      // Sequential inserts keep per-user #numbers in controller order.
      for (const r of rs) {
        const { data, error } = await supabase
          .from("runs")
          .insert({
            owner_id: user!.id,
            vehicle_id: r.vehicleId || null,
            vehicle_name: r.vehicleName,
            config: r.config,
            cycle_id: r.cycleId || null,
            cycle_name: r.cycleName,
            controller: r.controller,
            init: r.init,
            kpis: r.kpis,
            baseline: r.baseline,
            compute_ms: r.computeMs,
          })
          .select("*")
          .single();
        fail(error);
        created.push(toRun(data as RunRow));
      }
      setRuns((s) => [...created.slice().reverse(), ...s]);
      return created;
    },
    [supabase, user],
  );

  const deleteRuns = useCallback(
    async (ids: string[]) => {
      const { error } = await supabase.from("runs").delete().in("id", ids);
      fail(error);
      setRuns((s) => s.filter((x) => !ids.includes(x.id)));
    },
    [supabase],
  );

  /** Short-lived download link for a private Storage object ("bucket/path"). */
  const signedUrl = useCallback(
    async (path: string) => {
      const [bucket, ...rest] = path.split("/");
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(rest.join("/"), 120, { download: true });
      fail(error);
      return data!.signedUrl;
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, [supabase]);

  const value: StoreShape = {
    ready, error, user, displayName, vehicles, cycles, runs, models, activeVehicleId, signedUrl,
    setActiveVehicle, saveVehicle, deleteVehicle, addCycle, deleteCycle, addRuns, deleteRuns, signOut, reload: load,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside <StoreProvider>");
  return s;
}

export function useActiveModel(kind: ModelKind) {
  const { models } = useStore();
  return models.find((m) => m.kind === kind && m.status === "active") ?? null;
}

export function useActiveVehicle() {
  const { vehicles, activeVehicleId } = useStore();
  return vehicles.find((v) => v.id === activeVehicleId) ?? vehicles[0];
}

export function vehicleSummary(c: HessConfig) {
  const b = c.battery, s = c.supercap;
  const vNom = (b.seriesCells * (b.cellOcvMin + b.cellOcvMax)) / 2;
  const packKwh = (vNom * b.capacityAh) / 1000;
  const scUsableKwh = (0.5 * s.capacitanceF * (s.vMax ** 2 - (s.vMax * s.vMinRatio) ** 2)) / 3.6e6;
  return { vNom, packKwh, scUsableKwh };
}
