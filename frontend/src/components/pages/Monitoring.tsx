"use client";

import clsx from "clsx";
import { CalendarClock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { PageHeader, Stat, StatGrid } from "@/components/ui/form";
import { buttonClasses, Card, CardHeader, EmptyState, StatusBadge } from "@/components/ui/primitives";
import { CONTROLLER_DEFS, fmtPct, pctDelta } from "@/lib/hess/registry";
import { timeAgo } from "@/lib/format";
import { useStore } from "@/lib/store";

export function Monitoring() {
  const { runs, models } = useStore();
  const lineage = models.filter((m) => m.kind === "policy").slice(0, 6);

  const byCtrl = useMemo(
    () =>
      CONTROLLER_DEFS.filter((c) => c.key !== "battery").map((c) => {
        const rs = runs.filter((r) => r.controller === c.key);
        const mean = (f: (r: (typeof rs)[number]) => number) => (rs.length ? rs.reduce((a, r) => a + f(r), 0) / rs.length : 0);
        return {
          def: c,
          n: rs.length,
          peak: mean((r) => pctDelta(r.kpis.peakCRate, r.baseline.peakCRate)),
          energy: mean((r) => pctDelta(r.kpis.energyTotalKwh, r.baseline.energyTotalKwh)),
          stress: mean((r) => pctDelta(r.kpis.dodStress, r.baseline.dodStress)),
          violations: rs.reduce((a, r) => a + r.kpis.constraintViolations, 0),
        };
      }),
    [runs],
  );
  const totalViol = runs.reduce((a, r) => a + r.kpis.constraintViolations, 0);
  const maxAbs = Math.max(1, ...byCtrl.map((c) => Math.abs(c.peak)));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Intelligence"
        title="Monitoring"
        description="Controller performance across all runs, constraint safety, and the retraining schedule."
      />

      <div className="rise" style={{ animationDelay: "40ms" }}>
        <StatGrid cols={4}>
          <Stat label="Runs analysed" value={runs.length} />
          <Stat label="Constraint violations" value={totalViol} />
          <Stat label="Distinct drive cycles" value={new Set(runs.map((r) => r.cycleId)).size} />
          <Stat label="Distinct vehicles" value={new Set(runs.map((r) => r.vehicleId)).size} />
        </StatGrid>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="rise overflow-hidden" style={{ animationDelay: "80ms" }}>
          <CardHeader title="Average effect vs battery-only" description="Mean across every saved run of each controller" />
          {runs.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="size-4" />}
              title="Nothing to monitor yet"
              body="Run simulations and their results are aggregated here."
              action={<Link href="/simulate" className={buttonClasses("primary")}>New simulation</Link>}
            />
          ) : (
            <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-y border-line bg-surface-2 text-left text-2xs uppercase tracking-[0.06em] text-ink-3">
                    <th className="py-2 pl-5 pr-3 font-medium">Controller</th>
                    <th className="px-3 py-2 text-right font-medium">Runs</th>
                    <th className="px-3 py-2 font-medium">Peak C-rate</th>
                    <th className="px-3 py-2 text-right font-medium">E_tot</th>
                    <th className="px-3 py-2 text-right font-medium">DoD stress</th>
                    <th className="py-2 pl-3 pr-5 text-right font-medium">Safety</th>
                  </tr>
                </thead>
                <tbody>
                  {byCtrl.map((c) => (
                    <tr key={c.def.key} className="border-b border-line last:border-0">
                      <td className="py-3 pl-5 pr-3 font-medium text-ink-1">{c.def.label}</td>
                      <td className="num px-3 py-3 text-right text-ink-2">{c.n}</td>
                      <td className="px-3 py-3">
                        {c.n ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-3">
                              <div className="h-full rounded-full bg-[var(--series-bat)]" style={{ width: `${(Math.abs(c.peak) / maxAbs) * 100}%` }} />
                            </div>
                            <span className="num text-xs text-ink-1">{fmtPct(c.peak)}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-ink-3">n/a</span>
                        )}
                      </td>
                      <td className={clsx("num px-3 py-3 text-right", c.n ? "text-ink-1" : "text-ink-3")}>{c.n ? fmtPct(c.energy) : "n/a"}</td>
                      <td className={clsx("num px-3 py-3 text-right", c.n ? "text-ink-1" : "text-ink-3")}>{c.n ? fmtPct(c.stress) : "n/a"}</td>
                      <td className="py-3 pl-3 pr-5 text-right">
                        {c.n === 0 ? (
                          <StatusBadge status="neutral">No data</StatusBadge>
                        ) : c.violations ? (
                          <StatusBadge status="critical">{c.violations} violations</StatusBadge>
                        ) : (
                          <StatusBadge status="good">OK</StatusBadge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="rise" style={{ animationDelay: "120ms" }}>
          <CardHeader
            title="Retraining"
            description="Periodic cloud retraining with a promotion gate"
            actions={<StatusBadge status="good">Weekly</StatusBadge>}
          />
          <div className="flex flex-col gap-4 p-5">
            <div className="flex gap-3 rounded-md border border-line p-3">
              <CalendarClock className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
              <p className="text-xs text-ink-2">
                <span className="num text-ink-1">.github/workflows/retrain.yml</span> runs every Monday 02:00 UTC (or on demand):
                tests → retrain → evaluate on held-out US06 / WLTC → SIL-verify the C export → publish. It runs once the repository
                is on GitHub with the Supabase secrets set.
              </p>
            </div>
            <div>
              <div className="mb-2 text-2xs font-medium uppercase tracking-[0.08em] text-ink-3">Promotion gate</div>
              <ul className="flex flex-col gap-1.5 text-xs text-ink-2">
                {[
                  "C controller equivalent to Python (SIL)",
                  "Zero constraint violations on held-out cycles",
                  "Energy and battery stress not worse than the active model",
                  "Otherwise stored as a candidate; the active model keeps running",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-[var(--ink-3)]" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-2 text-2xs font-medium uppercase tracking-[0.08em] text-ink-3">Policy versions</div>
              {lineage.length === 0 ? (
                <p className="text-xs text-ink-3">No published models yet.</p>
              ) : (
                <ul className="divide-y divide-line rounded-md border border-line">
                  {lineage.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                      <span className="num w-14 text-ink-1">{m.version}</span>
                      <span className="flex-1 truncate text-ink-3">
                        {timeAgo(m.trainedAt)}
                        {(m.metrics.promotion as { reason?: string } | undefined)?.reason ? ` · ${(m.metrics.promotion as { reason: string }).reason}` : ""}
                      </span>
                      <StatusBadge status={m.status === "active" ? "good" : m.status === "candidate" ? "warning" : "neutral"}>{m.status}</StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
