"use client";

import clsx from "clsx";
import { ArrowLeft, Download, FileQuestion, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CycleTrace } from "@/components/charts/CycleTrace";
import { Dialog } from "@/components/ui/Dialog";
import { PageHeader, Stat, StatGrid } from "@/components/ui/form";
import { Button, buttonClasses, Card, CardHeader, EmptyState, SeriesKey, Skeleton, StatusBadge, Tag } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { timeAgo } from "@/lib/format";
import { controllerDef, downloadText, fmtPct, KPI_DEFS, pctDelta, runOne, toTraceData, traceCsv } from "@/lib/hess/registry";
import { useStore, vehicleSummary, type Run } from "@/lib/store";
import { useModels } from "@/lib/useModels";

function Missing({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <EmptyState
        icon={<FileQuestion className="size-4" />}
        title={title}
        body={body}
        action={<Link href="/runs" className={buttonClasses("secondary")}>Back to runs</Link>}
      />
    </Card>
  );
}

export function KpiCompareTable({ columns }: { columns: { title: string; kpis: Run["kpis"] }[] }) {
  const base = columns[0].kpis;
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-y border-line bg-surface-2 text-left text-2xs uppercase tracking-[0.06em] text-ink-3">
            <th className="py-2 pl-5 pr-3 font-medium">Metric</th>
            {columns.map((c) => (
              <th key={c.title} className="px-3 py-2 text-right font-medium">{c.title}</th>
            ))}
            <th className="py-2 pl-3 pr-5 text-right font-medium">Δ</th>
          </tr>
        </thead>
        <tbody>
          {KPI_DEFS.map((k) => {
            const d = pctDelta(columns[columns.length - 1].kpis[k.key], base[k.key]);
            return (
              <tr key={k.key} className="border-b border-line last:border-0">
                <td className="py-2.5 pl-5 pr-3">
                  <div className="text-ink-1">{k.label}</div>
                  <div className="text-2xs text-ink-3">{k.hint}</div>
                </td>
                {columns.map((c) => (
                  <td key={c.title} className="num px-3 py-2.5 text-right text-ink-1">
                    {c.kpis[k.key].toFixed(k.digits)} <span className="text-ink-3">{k.unit}</span>
                  </td>
                ))}
                <td className={clsx("num py-2.5 pl-3 pr-5 text-right", d < -0.05 ? "text-good-ink" : d > 0.05 ? "text-critical-ink" : "text-ink-3")}>
                  {fmtPct(d)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RunDetail({ id }: { id: string }) {
  const { runs, cycles, ready, deleteRuns } = useStore();
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const { models } = useModels();
  const run = runs.find((r) => r.id === id);
  const cycle = run && cycles.find((c) => c.id === run.cycleId);
  const result = useMemo(
    () => (run && cycle && models ? runOne(run.config, cycle, run.controller, run.init, models) : null),
    [run, cycle, models],
  );

  if (!ready || (!models && cycle)) return <Skeleton className="h-96" />;
  if (!run) return <Missing title="Run not found" body="It may have been deleted, or it was created in another browser." />;

  const def = controllerDef(run.controller);
  const sum = vehicleSummary(run.config);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/runs" className="inline-flex w-fit items-center gap-1 text-xs text-ink-3 hover:text-ink-1">
        <ArrowLeft className="size-3.5" aria-hidden /> Runs
      </Link>
      <PageHeader
        eyebrow={`Run #${run.seq} · ${timeAgo(run.createdAt)}`}
        title={`${def.label} on ${run.cycleName}`}
        description={`${run.vehicleName} · battery SOC₀ ${(run.init.socBat * 100).toFixed(0)}% · supercap SOC₀ ${(run.init.socSc * 100).toFixed(0)}%`}
        actions={
          <>
            <Link href={`/simulate?vehicle=${run.vehicleId}&cycle=${run.cycleId}`} className={buttonClasses("secondary")}>
              <RotateCcw className="size-3.5" aria-hidden /> Re-run
            </Link>
            <Button disabled={!result || !cycle} onClick={() => result && cycle && downloadText(`run-${run.seq}-trace.csv`, traceCsv(result, cycle.speedMs))}>
              <Download className="size-3.5" aria-hidden /> Trace CSV
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(true)} aria-label="Delete run">
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        {def.preview && <Tag>stand-in controller</Tag>}
        {run.kpis.constraintViolations ? (
          <StatusBadge status="critical">{run.kpis.constraintViolations} constraint violations</StatusBadge>
        ) : (
          <StatusBadge status="good">Constraints respected</StatusBadge>
        )}
        <StatusBadge status="neutral">Computed in {run.computeMs.toFixed(0)} ms</StatusBadge>
      </div>

      {result && cycle ? (
        <Card className="rise">
          <CardHeader
            title="Power split"
            description={cycle.description}
            actions={
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <SeriesKey color="var(--series-bat)" label="Battery" />
                <SeriesKey color="var(--series-sc)" label="Supercap" />
                <SeriesKey color="var(--ink-3)" label="Demand" />
              </div>
            }
          />
          <div className="px-3 pb-4 pt-3 sm:px-5">
            <CycleTrace data={toTraceData(result, cycle.speedMs)} />
          </div>
        </Card>
      ) : (
        <Missing title="Drive cycle no longer available" body="The cycle used by this run was deleted, so its time-series cannot be rebuilt. Saved KPIs are shown below." />
      )}

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="rise overflow-hidden">
          <CardHeader title="Results vs battery-only" />
          <div className="mt-4">
            <KpiCompareTable columns={[{ title: "Battery only", kpis: run.baseline }, { title: def.label, kpis: run.kpis }]} />
          </div>
        </Card>
        <Card className="rise">
          <CardHeader title="Configuration snapshot" description="Parameters at the time of the run" />
          <div className="flex flex-col gap-3 p-5">
            <StatGrid cols={2}>
              <Stat label="Vehicle mass" value={run.config.vehicle.massKg} unit="kg" />
              <Stat label="Pack energy" value={sum.packKwh.toFixed(1)} unit="kWh" />
              <Stat label="Pack voltage (nom.)" value={sum.vNom.toFixed(0)} unit="V" />
              <Stat label="Pack resistance" value={run.config.battery.packResistanceOhm} unit="Ω" />
              <Stat label="SC capacitance" value={run.config.supercap.capacitanceF} unit="F" />
              <Stat label="SC usable energy" value={(sum.scUsableKwh * 1000).toFixed(0)} unit="Wh" />
            </StatGrid>
            <p className="text-2xs text-ink-3">{def.description}</p>
            {pctDelta(run.kpis.energyTotalKwh, run.baseline.energyTotalKwh) > 0 && (
              <p className="text-2xs text-ink-3">
                E_tot is higher than battery-only because energy cycled through the supercapacitor passes the DC/DC
                converter twice. The gain is in battery stress.
              </p>
            )}
          </div>
        </Card>
      </div>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Delete run #${run.seq}?`}
        description="This removes the saved results. It cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  await deleteRuns([run.id]);
                  toast({ tone: "good", title: `Run #${run.seq} deleted` });
                  router.push("/runs");
                } catch (e) {
                  setDeleting(false);
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

export function RunCompare({ a, b }: { a: string; b: string }) {
  const { runs, cycles, ready } = useStore();
  const { models } = useModels();
  const ra = runs.find((r) => r.id === a);
  const rb = runs.find((r) => r.id === b);
  const traces = useMemo(
    () =>
      [ra, rb].map((r) => {
        const c = r && cycles.find((x) => x.id === r.cycleId);
        return r && c && models ? toTraceData(runOne(r.config, c, r.controller, r.init, models), c.speedMs) : null;
      }),
    [ra, rb, cycles, models],
  );

  if (!ready || !models) return <Skeleton className="h-96" />;
  if (!ra || !rb) return <Missing title="Pick two runs to compare" body="One or both runs could not be found. Select two runs from the list." />;

  const title = (r: Run) => `#${r.seq} ${controllerDef(r.controller).label}`;
  return (
    <div className="flex flex-col gap-6">
      <Link href="/runs" className="inline-flex w-fit items-center gap-1 text-xs text-ink-3 hover:text-ink-1">
        <ArrowLeft className="size-3.5" aria-hidden /> Runs
      </Link>
      <PageHeader
        eyebrow="Compare"
        title={`${title(ra)} vs ${title(rb)}`}
        description={ra.cycleId === rb.cycleId ? `Both on ${ra.cycleName}` : `${ra.cycleName} vs ${rb.cycleName} (different cycles, compare with care)`}
      />
      <Card className="rise overflow-hidden">
        <CardHeader title="Metrics" description="Δ is run B relative to run A" />
        <div className="mt-4">
          <KpiCompareTable columns={[{ title: `A · ${title(ra)}`, kpis: ra.kpis }, { title: `B · ${title(rb)}`, kpis: rb.kpis }]} />
        </div>
      </Card>
      <div className="grid gap-6 2xl:grid-cols-2">
        {[ra, rb].map((r, i) => (
          <Card key={r.id} className="rise">
            <CardHeader title={`${i ? "B" : "A"} · ${title(r)}`} description={`${r.cycleName} · ${r.vehicleName}`} />
            <div className="px-3 pb-4 pt-3 sm:px-5">
              {traces[i] ? <CycleTrace data={traces[i]!} /> : <p className="p-6 text-sm text-ink-3">Drive cycle no longer available.</p>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
