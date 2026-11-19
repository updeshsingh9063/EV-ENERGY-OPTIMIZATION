"use client";

import clsx from "clsx";
import { Activity, Download, GitCompareArrows, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { PageHeader, Select } from "@/components/ui/form";
import { Button, buttonClasses, Card, EmptyState, Skeleton, Tag } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { timeAgo } from "@/lib/format";
import { CONTROLLER_DEFS, controllerDef, downloadText, fmtPct, pctDelta } from "@/lib/hess/registry";
import { useStore } from "@/lib/store";

export function Runs() {
  const { runs, ready, deleteRuns } = useStore();
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const [ctrl, setCtrl] = useState("all");
  const [cycle, setCycle] = useState("all");
  const [sel, setSel] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<string[] | null>(null);

  const cyclesInRuns = useMemo(() => [...new Map(runs.map((r) => [r.cycleId, r.cycleName])).entries()], [runs]);
  const rows = runs.filter((r) => (ctrl === "all" || r.controller === ctrl) && (cycle === "all" || r.cycleId === cycle));

  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 2 ? [s[1], id] : [...s, id]));

  const exportCsv = () => {
    const head = "run,created_at,vehicle,cycle,controller,e_tot_kwh,peak_c,rms_a,dod_stress,ah,baseline_e_tot_kwh,baseline_peak_c,baseline_rms_a,baseline_dod_stress";
    const lines = rows.map((r) =>
      [
        r.seq, r.createdAt, JSON.stringify(r.vehicleName), JSON.stringify(r.cycleName), r.controller,
        r.kpis.energyTotalKwh.toFixed(4), r.kpis.peakCRate.toFixed(3), r.kpis.rmsCurrentA.toFixed(2), r.kpis.dodStress.toFixed(3), r.kpis.ahThroughput.toFixed(3),
        r.baseline.energyTotalKwh.toFixed(4), r.baseline.peakCRate.toFixed(3), r.baseline.rmsCurrentA.toFixed(2), r.baseline.dodStress.toFixed(3),
      ].join(","),
    );
    downloadText("voltsplit-runs.csv", [head, ...lines].join("\n"));
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Workspace"
        title="Runs"
        description="Every simulation you have run. Select two to compare them side by side."
        actions={
          <>
            <Button onClick={exportCsv} disabled={!rows.length}>
              <Download className="size-3.5" aria-hidden /> Export CSV
            </Button>
            <Button
              variant="primary"
              disabled={sel.length !== 2}
              onClick={() => router.push(`/runs/compare?a=${sel[0]}&b=${sel[1]}`)}
            >
              <GitCompareArrows className="size-3.5" aria-hidden /> Compare {sel.length}/2
            </Button>
          </>
        }
      />

      <div className="rise flex flex-wrap items-end gap-3" style={{ animationDelay: "40ms" }}>
        <Select id="f-ctrl" label="Controller" value={ctrl} onChange={(e) => setCtrl(e.target.value)} className="w-44">
          <option value="all">All controllers</option>
          {CONTROLLER_DEFS.filter((c) => c.key !== "battery").map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </Select>
        <Select id="f-cycle" label="Drive cycle" value={cycle} onChange={(e) => setCycle(e.target.value)} className="w-56">
          <option value="all">All cycles</option>
          {cyclesInRuns.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </Select>
        {sel.length > 0 && (
          <Button variant="ghost" onClick={() => setConfirm(sel)}>
            <Trash2 className="size-3.5" aria-hidden /> Delete selected
          </Button>
        )}
        <span className="num ml-auto text-xs text-ink-3">{rows.length} run{rows.length === 1 ? "" : "s"}</span>
      </div>

      <Card className="rise overflow-hidden" style={{ animationDelay: "80ms" }}>
        {!ready ? (
          <div className="flex flex-col gap-3 p-5">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Activity className="size-4" />}
            title={runs.length ? "No runs match these filters" : "No runs yet"}
            body={runs.length ? "Try a different controller or drive cycle." : "Simulations you run are saved here automatically."}
            action={!runs.length && <Link href="/simulate" className={buttonClasses("primary")}>New simulation</Link>}
          />
        ) : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left text-2xs uppercase tracking-[0.06em] text-ink-3">
                  <th className="w-10 py-2 pl-5"><span className="sr-only">Select</span></th>
                  <th className="px-3 py-2 font-medium">Run</th>
                  <th className="px-3 py-2 font-medium">Cycle · vehicle</th>
                  <th className="px-3 py-2 font-medium">Controller</th>
                  <th className="px-3 py-2 text-right font-medium">ΔE<sub>tot</sub></th>
                  <th className="px-3 py-2 text-right font-medium">ΔPeak C</th>
                  <th className="px-3 py-2 text-right font-medium">ΔRMS</th>
                  <th className="px-3 py-2 text-right font-medium">ΔDoD stress</th>
                  <th className="py-2 pl-3 pr-5 text-right font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const on = sel.includes(r.id);
                  return (
                    <tr key={r.id} className={clsx("border-b border-line transition-colors last:border-0 hover:bg-surface-2", on && "bg-surface-2/70")}>
                      <td className="py-2.5 pl-5">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(r.id)}
                          aria-label={`Select run ${r.seq}`}
                          className="size-4 accent-[var(--brand)]"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Link href={`/runs/${r.id}`} className="num font-medium text-ink-1 hover:underline">#{r.seq}</Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-ink-1">{r.cycleName}</div>
                        <div className="text-2xs text-ink-3">{r.vehicleName}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-1.5 text-ink-2">
                          {controllerDef(r.controller).label}
                          {controllerDef(r.controller).preview && <Tag>stand-in</Tag>}
                        </span>
                      </td>
                      {(["energyTotalKwh", "peakCRate", "rmsCurrentA", "dodStress"] as const).map((k) => {
                        const d = pctDelta(r.kpis[k], r.baseline[k]);
                        return (
                          <td key={k} className={clsx("num px-3 py-2.5 text-right", d < -0.05 ? "text-good-ink" : d > 0.05 ? "text-critical-ink" : "text-ink-3")}>
                            {fmtPct(d)}
                          </td>
                        );
                      })}
                      <td className="py-2.5 pl-3 pr-5 text-right text-xs text-ink-3">{timeAgo(r.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={`Delete ${confirm?.length ?? 0} run(s)?`}
        description="This removes the saved results. It cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={deleting}
              onClick={async () => {
                if (!confirm) return;
                setDeleting(true);
                try {
                  await deleteRuns(confirm);
                  toast({ tone: "good", title: `Deleted ${confirm.length} run(s)` });
                  setSel([]);
                  setConfirm(null);
                } catch (e) {
                  toast({ tone: "critical", title: "Delete failed", body: e instanceof Error ? e.message : String(e) });
                } finally {
                  setDeleting(false);
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
