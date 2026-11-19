"use client";

import clsx from "clsx";
import { Check, Copy, Lock, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { PageHeader, Stat, StatGrid } from "@/components/ui/form";
import { Button, Card, CardHeader, Field, StatusBadge, Tag } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { DEFAULT_CONFIG, type HessConfig } from "@/lib/hess/model";
import { uid, useStore, vehicleSummary, type Vehicle } from "@/lib/store";

type Section = keyof HessConfig;
interface FieldDef {
  section: Section;
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  /** display = stored × scale */
  scale?: number;
  hint?: string;
}

const FIELDS: FieldDef[] = [
  { section: "vehicle", key: "massKg", label: "Mass", unit: "kg", min: 100, max: 40000, hint: "Kerb mass + payload" },
  { section: "vehicle", key: "dragCoeff", label: "Drag coefficient", unit: "Cd", min: 0.1, max: 1.2 },
  { section: "vehicle", key: "frontalAreaM2", label: "Frontal area", unit: "m²", min: 0.5, max: 12 },
  { section: "vehicle", key: "rollingCoeff", label: "Rolling resistance", unit: "Crr", min: 0.003, max: 0.03 },
  { section: "vehicle", key: "drivetrainEff", label: "Drivetrain efficiency", unit: "%", min: 50, max: 99, scale: 100 },
  { section: "vehicle", key: "regenEff", label: "Regen recovery", unit: "%", min: 0, max: 95, scale: 100 },
  { section: "vehicle", key: "auxPowerW", label: "Auxiliary load", unit: "W", min: 0, max: 20000 },
  { section: "battery", key: "seriesCells", label: "Cells in series", unit: "s", min: 4, max: 300 },
  { section: "battery", key: "capacityAh", label: "Capacity", unit: "Ah", min: 1, max: 1000 },
  { section: "battery", key: "cellOcvMin", label: "Cell OCV at 0% SOC", unit: "V", min: 2, max: 4 },
  { section: "battery", key: "cellOcvMax", label: "Cell OCV at 100% SOC", unit: "V", min: 3, max: 4.4 },
  { section: "battery", key: "packResistanceOhm", label: "Pack resistance R_bat", unit: "Ω", min: 0.001, max: 2 },
  { section: "battery", key: "maxCurrentA", label: "Max current", unit: "A", min: 10, max: 3000 },
  { section: "battery", key: "socMin", label: "SOC lower limit", unit: "%", min: 0, max: 50, scale: 100 },
  { section: "battery", key: "socMax", label: "SOC upper limit", unit: "%", min: 50, max: 100, scale: 100 },
  { section: "supercap", key: "capacitanceF", label: "Bank capacitance", unit: "F", min: 0.5, max: 2000, hint: "Cell capacitance ÷ cells in series" },
  { section: "supercap", key: "vMax", label: "Rated voltage", unit: "V", min: 12, max: 1000 },
  { section: "supercap", key: "vMinRatio", label: "Min voltage", unit: "% of rated", min: 20, max: 80, scale: 100, hint: "50% unlocks 75% of stored energy" },
  { section: "supercap", key: "esrOhm", label: "ESR", unit: "Ω", min: 0.0001, max: 1 },
  { section: "supercap", key: "maxCurrentA", label: "Max current", unit: "A", min: 10, max: 3000 },
  { section: "supercap", key: "converterEff", label: "DC/DC efficiency", unit: "%", min: 70, max: 99.5, scale: 100 },
];

const SECTION_TITLES: Record<Section, [string, string]> = {
  vehicle: ["Vehicle", "Longitudinal dynamics → traction power P_req"],
  battery: ["Battery pack", "Equivalent-circuit (Rint) model"],
  supercap: ["Supercapacitor bank", "Ideal capacitor + ESR behind a DC/DC converter"],
};

type Draft = Record<string, string>;
const keyOf = (f: FieldDef) => `${f.section}.${f.key}`;

function toDraft(c: HessConfig): Draft {
  const d: Draft = {};
  for (const f of FIELDS) {
    const v = (c[f.section] as unknown as Record<string, number>)[f.key] * (f.scale ?? 1);
    d[keyOf(f)] = String(Number(v.toPrecision(6)));
  }
  return d;
}

function validate(d: Draft): { errors: Record<string, string>; config: HessConfig | null } {
  const errors: Record<string, string> = {};
  const cfg = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as HessConfig;
  for (const f of FIELDS) {
    const v = Number(d[keyOf(f)]);
    if (d[keyOf(f)].trim() === "" || !Number.isFinite(v)) errors[keyOf(f)] = "Enter a number.";
    else if (v < f.min || v > f.max) errors[keyOf(f)] = `Between ${f.min} and ${f.max}.`;
    else (cfg[f.section] as unknown as Record<string, number>)[f.key] = v / (f.scale ?? 1);
  }
  if (!errors["battery.cellOcvMax"] && Number(d["battery.cellOcvMax"]) <= Number(d["battery.cellOcvMin"]))
    errors["battery.cellOcvMax"] = "Must exceed the 0% OCV.";
  if (!errors["battery.socMax"] && Number(d["battery.socMax"]) <= Number(d["battery.socMin"]))
    errors["battery.socMax"] = "Must exceed the lower limit.";
  return { errors, config: Object.keys(errors).length ? null : cfg };
}

export function Vehicles() {
  const { vehicles, activeVehicleId, setActiveVehicle, saveVehicle, deleteVehicle, runs } = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const selectedId = params.get("v") ?? activeVehicleId;
  const vehicle = vehicles.find((v) => v.id === selectedId) ?? vehicles[0];

  const [name, setName] = useState(vehicle.name);
  const [desc, setDesc] = useState(vehicle.description);
  const [draft, setDraft] = useState<Draft>(() => toDraft(vehicle.config));
  const [touched, setTouched] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    setName(vehicle.name);
    setDesc(vehicle.description);
    setDraft(toDraft(vehicle.config));
    setTouched(false);
  }, [vehicle]);

  const { errors, config } = useMemo(() => validate(draft), [draft]);
  const summary = config ? vehicleSummary(config) : null;
  const ro = !!vehicle.builtin;
  const dirty = touched && !ro;
  const nameErr = !name.trim() ? "Name is required." : undefined;

  const [busy, setBusy] = useState<null | "create" | "save" | "delete" | "active">(null);
  const err = (title: string, e: unknown) =>
    toast({ tone: "critical", title, body: e instanceof Error ? e.message : String(e) });

  const create = async (base: Vehicle, suffix: string) => {
    setBusy("create");
    try {
      const v = await saveVehicle({
        id: uid("veh"),
        name: `${base.name} ${suffix}`.trim().slice(0, 60),
        description: base.description,
        config: JSON.parse(JSON.stringify(base.config)),
        createdAt: new Date().toISOString(),
      });
      toast({ tone: "good", title: "Vehicle created", body: v.name });
      router.push(`/vehicles?v=${v.id}`);
    } catch (e) {
      err("Could not create vehicle", e);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!config || nameErr) return;
    setBusy("save");
    try {
      await saveVehicle({ ...vehicle, name: name.trim(), description: desc.trim(), config });
      setTouched(false);
      toast({ tone: "good", title: "Vehicle saved", body: name.trim() });
    } catch (e) {
      err("Save failed", e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Inputs"
        title="Vehicle & HESS"
        description="Physical parameters of the vehicle, battery pack and supercapacitor bank used by every simulation."
        actions={
          <Button variant="primary" loading={busy === "create"} onClick={() => create({ ...vehicles[0], name: "New vehicle" }, "")}>
            <Plus className="size-3.5" aria-hidden /> New vehicle
          </Button>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[280px_1fr]">
        <div className="rise flex flex-col gap-2" role="list" aria-label="Vehicles">
          {vehicles.map((v) => {
            const s = vehicleSummary(v.config);
            return (
              <Link
                key={v.id}
                role="listitem"
                href={`/vehicles?v=${v.id}`}
                scroll={false}
                aria-current={v.id === vehicle.id || undefined}
                className={clsx(
                  "block rounded-md border p-3 transition-colors",
                  v.id === vehicle.id ? "border-line-strong bg-surface-1 shadow-card" : "border-line hover:bg-surface-1",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink-1">{v.name}</span>
                  {v.id === activeVehicleId && <StatusBadge status="good">Active</StatusBadge>}
                </div>
                <div className="num mt-1 text-2xs text-ink-3">
                  {s.packKwh.toFixed(1)} kWh · {(s.scUsableKwh * 1000).toFixed(0)} Wh SC · {v.config.vehicle.massKg} kg
                </div>
              </Link>
            );
          })}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card className="rise" style={{ animationDelay: "40ms" }}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div className="flex items-center gap-2">
                {ro && <Tag><Lock className="mr-1 size-2.5" aria-hidden />built-in</Tag>}
                {dirty && <Tag>unsaved changes</Tag>}
              </div>
              <div className="flex flex-wrap gap-2">
                {vehicle.id !== activeVehicleId && (
                  <Button
                    size="sm"
                    loading={busy === "active"}
                    onClick={async () => {
                      setBusy("active");
                      try {
                        await setActiveVehicle(vehicle.id);
                        toast({ tone: "good", title: `${vehicle.name} is now active` });
                      } catch (e) {
                        err("Could not set active vehicle", e);
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    <Check className="size-3.5" aria-hidden /> Set active
                  </Button>
                )}
                <Button size="sm" onClick={() => create(vehicle, "copy")}>
                  <Copy className="size-3.5" aria-hidden /> Duplicate
                </Button>
                {!ro && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(true)} aria-label="Delete vehicle">
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                    <Button size="sm" variant="primary" loading={busy === "save"} disabled={!dirty || !config || !!nameErr} onClick={save}>
                      <Save className="size-3.5" aria-hidden /> Save
                    </Button>
                  </>
                )}
              </div>
            </div>
            {ro && (
              <p className="border-b border-line bg-surface-2 px-5 py-2.5 text-xs text-ink-2">
                Built-in presets are read-only. Duplicate this vehicle to change its parameters.
              </p>
            )}
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field id="veh-name" label="Name" value={name} disabled={ro} maxLength={60} error={nameErr}
                onChange={(e) => { setName(e.target.value); setTouched(true); }} />
              <Field id="veh-desc" label="Description" value={desc} disabled={ro} maxLength={120}
                onChange={(e) => { setDesc(e.target.value); setTouched(true); }} />
            </div>
          </Card>

          {summary && (
            <div className="rise" style={{ animationDelay: "60ms" }}>
              <StatGrid cols={4}>
                <Stat label="Pack voltage (nom.)" value={summary.vNom.toFixed(0)} unit="V" />
                <Stat label="Pack energy" value={summary.packKwh.toFixed(1)} unit="kWh" />
                <Stat label="SC usable energy" value={(summary.scUsableKwh * 1000).toFixed(0)} unit="Wh" />
                <Stat label="SC : battery energy" value={((summary.scUsableKwh / summary.packKwh) * 100).toFixed(2)} unit="%" />
              </StatGrid>
            </div>
          )}

          {(Object.keys(SECTION_TITLES) as Section[]).map((sec, i) => (
            <Card key={sec} className="rise" style={{ animationDelay: `${80 + i * 40}ms` }}>
              <CardHeader title={SECTION_TITLES[sec][0]} description={SECTION_TITLES[sec][1]} />
              <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
                {FIELDS.filter((f) => f.section === sec).map((f) => (
                  <Field
                    key={keyOf(f)}
                    id={keyOf(f)}
                    label={f.label}
                    unit={f.unit}
                    inputMode="decimal"
                    disabled={ro}
                    value={draft[keyOf(f)]}
                    hint={f.hint}
                    error={errors[keyOf(f)]}
                    onChange={(e) => { setDraft((d) => ({ ...d, [keyOf(f)]: e.target.value })); setTouched(true); }}
                  />
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Delete “${vehicle.name}”?`}
        description={`${runs.filter((r) => r.vehicleId === vehicle.id).length} saved run(s) keep their own configuration snapshot. This cannot be undone.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={busy === "delete"}
              onClick={async () => {
                setBusy("delete");
                try {
                  await deleteVehicle(vehicle.id);
                  setConfirm(false);
                  toast({ tone: "good", title: "Vehicle deleted" });
                  router.push("/vehicles");
                } catch (e) {
                  err("Delete failed", e);
                } finally {
                  setBusy(null);
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      />
    </div>
  );
}
