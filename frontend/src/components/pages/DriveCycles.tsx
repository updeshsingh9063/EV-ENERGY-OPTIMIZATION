"use client";

import clsx from "clsx";
import { AlertTriangle, Database, FileUp, Play, Trash2, Upload, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { LineChart, Sparkline } from "@/components/charts/LineChart";
import { Dialog } from "@/components/ui/Dialog";
import { PageHeader, Stat, StatGrid } from "@/components/ui/form";
import { Button, buttonClasses, Card, CardHeader, Field, Tag } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { cycleStats, parseCycleCsv, type CsvParseResult } from "@/lib/hess/cycles";
import { fmtDuration } from "@/lib/format";
import { uid, useStore } from "@/lib/store";

const DATASETS = [
  { ids: ["ds-udds", "ds-hwfet", "ds-us06", "ds-wltc_3b"], name: "UDDS, HWFET, US06, WLTC Class 3b", source: "NREL FASTSim drive cycles", url: "https://github.com/NatLabRockies/fastsim" },
  { ids: [], name: "Community driving cycles", source: "github.com/PathfinderAV/driving-cycles (link returns HTTP 404)", url: "https://github.com/PathfinderAV/driving-cycles" },
];

function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addCycle } = useStore();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<CsvParseResult | null>(null);
  const [drag, setDrag] = useState(false);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => { setName(""); setFile(null); setParsed(null); };
  const close = () => { reset(); onClose(); };

  const load = async (f: File) => {
    setFile(f);
    if (f.size > 20 * 1024 * 1024) {
      setParsed({ ok: false, errors: ["File is larger than 20 MB."], warnings: [] });
      return;
    }
    if (!name) setName(f.name.replace(/\.(csv|txt)$/i, ""));
    setParsed(parseCycleCsv(await f.text()));
  };

  const stats = parsed?.ok && parsed.speedMs ? cycleStats(parsed.speedMs) : null;
  const nameErr = parsed?.ok && !name.trim() ? "Give the cycle a name." : undefined;

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Upload drive cycle"
      description="CSV with a time column (s) and a speed column (speed_kmh, speed_mph or speed_ms). Optional grade column. Resampled to 1 Hz."
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!parsed?.ok || !name.trim()}
            loading={saving}
            onClick={async () => {
              if (!parsed?.speedMs) return;
              const id = uid("cyc");
              setSaving(true);
              try {
              await addCycle({
                id,
                name: name.trim(),
                source: "upload",
                description: `Uploaded from ${file?.name}`,
                speedMs: parsed.speedMs,
                grade: parsed.grade,
              });
              toast({ tone: "good", title: "Drive cycle added", body: name.trim() });
              close();
              router.push(`/drive-cycles?c=${id}`);
              } catch (e) {
                toast({ tone: "critical", title: "Upload failed", body: e instanceof Error ? e.message : String(e) });
              } finally {
                setSaving(false);
              }
            }}
          >
            Add cycle
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) load(f);
          }}
          className={clsx(
            "flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-7 text-center transition-colors",
            drag ? "border-focus bg-surface-2" : "border-line-strong hover:bg-surface-2",
          )}
        >
          <FileUp className="size-5 text-ink-3" aria-hidden />
          <span className="text-sm text-ink-1">{file ? file.name : "Drop a CSV here or click to browse"}</span>
          <span className="text-2xs text-ink-3">Up to 20 MB · max 4 hours</span>
        </button>
        <input
          ref={input}
          type="file"
          accept=".csv,.txt,text/csv"
          className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ""; }}
        />
        {parsed && !parsed.ok && (
          <ul className="flex flex-col gap-1 rounded-sm bg-critical-bg p-3 text-xs text-critical-ink">
            {parsed.errors.map((er) => (
              <li key={er} className="flex gap-1.5"><XCircle className="mt-0.5 size-3 shrink-0" aria-hidden />{er}</li>
            ))}
          </ul>
        )}
        {parsed && parsed.warnings.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-sm bg-warning-bg p-3 text-xs text-warning-ink">
            {parsed.warnings.map((w) => (
              <li key={w} className="flex gap-1.5"><AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />{w}</li>
            ))}
          </ul>
        )}
        {stats && parsed?.speedMs && (
          <>
            <Sparkline values={parsed.speedMs} height={40} className="w-full" />
            <StatGrid cols={3}>
              <Stat label="Duration" value={fmtDuration(stats.durationS)} />
              <Stat label="Distance" value={stats.distanceKm.toFixed(1)} unit="km" />
              <Stat label="Max speed" value={stats.maxKmh.toFixed(0)} unit="km/h" />
            </StatGrid>
            <Field id="cyc-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} error={nameErr} maxLength={60} />
          </>
        )}
      </div>
    </Dialog>
  );
}

export function DriveCycles() {
  const { cycles, deleteCycle, runs } = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [upload, setUpload] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const selectedId = params.get("c") ?? cycles[0].id;
  const cycle = cycles.find((c) => c.id === selectedId) ?? cycles[0];
  const stats = useMemo(() => cycleStats(cycle.speedMs), [cycle]);
  const speedKmh = useMemo(() => cycle.speedMs.map((v) => v * 3.6), [cycle]);
  const usedBy = runs.filter((r) => r.cycleId === cycle.id).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Inputs"
        title="Drive cycles"
        description="Speed profiles the vehicle is simulated over. Traction power P_req is derived from speed, acceleration and road grade."
        actions={
          <Button variant="primary" onClick={() => setUpload(true)}>
            <Upload className="size-3.5" aria-hidden /> Upload CSV
          </Button>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[320px_1fr]">
        <div className="rise flex flex-col gap-2" role="list" aria-label="Drive cycles">
          {cycles.map((c) => {
            const s = cycleStats(c.speedMs);
            const active = c.id === cycle.id;
            return (
              <Link
                key={c.id}
                role="listitem"
                href={`/drive-cycles?c=${c.id}`}
                scroll={false}
                aria-current={active || undefined}
                className={clsx(
                  "block rounded-md border p-3 transition-colors",
                  active ? "border-line-strong bg-surface-1 shadow-card" : "border-line hover:bg-surface-1",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink-1">{c.name}</span>
                  <Tag>{c.source}</Tag>
                </div>
                <Sparkline values={c.speedMs} height={28} className="mt-2 w-full" />
                <div className="num mt-1.5 text-2xs text-ink-3">
                  {fmtDuration(s.durationS)} · {s.distanceKm.toFixed(1)} km · max {s.maxKmh.toFixed(0)} km/h
                </div>
              </Link>
            );
          })}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card className="rise" style={{ animationDelay: "40ms" }}>
            <CardHeader
              title={cycle.name}
              description={cycle.description}
              actions={
                <>
                  {cycle.source === "upload" && (
                    <Button variant="ghost" size="sm" onClick={() => setConfirm(true)} aria-label="Delete cycle">
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  )}
                  <Link href={`/simulate?cycle=${cycle.id}`} className={buttonClasses("secondary", "sm")}>
                    <Play className="size-3.5" aria-hidden /> Simulate
                  </Link>
                </>
              }
            />
            <div className="px-3 pb-2 pt-4 sm:px-5">
              <LineChart values={speedKmh} unit="km/h" label="Vehicle speed" height={220} />
            </div>
            <div className="p-5 pt-3">
              <StatGrid cols={3}>
                <Stat label="Duration" value={fmtDuration(stats.durationS)} />
                <Stat label="Distance" value={stats.distanceKm.toFixed(2)} unit="km" />
                <Stat label="Average speed" value={stats.avgKmh.toFixed(1)} unit="km/h" />
                <Stat label="Max speed" value={stats.maxKmh.toFixed(0)} unit="km/h" />
                <Stat label="Max acceleration" value={stats.maxAccel.toFixed(2)} unit="m/s²" />
                <Stat label="Time stopped" value={(stats.stopShare * 100).toFixed(0)} unit="%" />
              </StatGrid>
            </div>
          </Card>

          <Card className="rise" style={{ animationDelay: "80ms" }}>
            <CardHeader title="Standard datasets" description="From the problem statement. Imported and published by the model-training pipeline." />
            <ul className="mt-3 divide-y divide-line border-t border-line">
              {DATASETS.map((d) => (
                <li key={d.name} className="flex items-center gap-3 px-5 py-3">
                  <Database className="size-4 shrink-0 text-ink-3" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-ink-1">{d.name}</div>
                    <a href={d.url} target="_blank" rel="noreferrer" className="truncate text-2xs text-ink-3 underline-offset-2 hover:underline">
                      {d.source}
                    </a>
                  </div>
                  {d.ids.length === 0 ? (
                    <Tag>unavailable</Tag>
                  ) : d.ids.every((id) => cycles.some((c) => c.id === id)) ? (
                    <Tag>imported</Tag>
                  ) : (
                    <Tag>not imported</Tag>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <UploadDialog open={upload} onClose={() => setUpload(false)} />
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Delete “${cycle.name}”?`}
        description={usedBy ? `${usedBy} saved run(s) use this cycle. Their KPIs stay, but their time-series can no longer be rebuilt.` : "This cannot be undone."}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await deleteCycle(cycle.id);
                  setConfirm(false);
                  toast({ tone: "good", title: "Drive cycle deleted" });
                  router.push("/drive-cycles");
                } catch (e) {
                  toast({ tone: "critical", title: "Delete failed", body: e instanceof Error ? e.message : String(e) });
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
