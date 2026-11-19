"use client";

import { Download, Play, Route } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/Dialog";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Segmented,
  SeriesKey,
  Skeleton,
  StatusBadge,
  Tag,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-line pt-8 lg:grid-cols-[220px_1fr] lg:gap-10">
      <div>
        <h2 className="text-md font-medium text-ink-1">{title}</h2>
        <p className="mt-1 text-xs text-ink-3">{note}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

const SURFACES = [
  ["--bg", "Canvas"],
  ["--surface-1", "Surface 1"],
  ["--surface-2", "Surface 2"],
  ["--surface-3", "Surface 3"],
  ["--line", "Line"],
  ["--line-strong", "Line strong"],
];
const INK = [
  ["--ink-1", "Ink 1 · primary"],
  ["--ink-2", "Ink 2 · secondary"],
  ["--ink-3", "Ink 3 · muted"],
];
const DATA = [
  ["--series-bat", "Battery"],
  ["--series-sc", "Supercap"],
  ["--series-demand", "Demand"],
  ["--volt", "Volt (brand only)"],
];
const STATUS = [
  ["--good", "Good"],
  ["--warning", "Warning"],
  ["--critical", "Critical"],
];

function Swatches({ list }: { list: string[][] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {list.map(([v, name]) => (
        <div key={v} className="overflow-hidden rounded-md border border-line bg-surface-1">
          <div className="h-14 border-b border-line" style={{ background: `var(${v})` }} />
          <div className="p-2.5">
            <div className="text-xs font-medium text-ink-1">{name}</div>
            <div className="num text-2xs text-ink-3">{v}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

const TYPE = [
  ["text-3xl", "56 / 56", "Hero number", "-36.4%"],
  ["text-2xl", "40 / 44", "Display", "Energy, split well"],
  ["text-xl", "28 / 34", "Page title", "Hybrid storage energy management"],
  ["text-lg", "20 / 28", "Section", "Controller comparison"],
  ["text-md", "16 / 24", "Card title", "Model registry"],
  ["text-base", "14 / 22", "Body", "The supercapacitor absorbs transients."],
  ["text-sm", "13 / 20", "UI / table", "Rule-based · Baseline"],
  ["text-xs", "12 / 16", "Caption", "Deltas vs battery-only"],
  ["text-2xs", "11 / 16", "Micro / overline", "ACTIVE VEHICLE"],
];

export function DesignSystem() {
  const [seg, setSeg] = useState<"a" | "b" | "c">("a");
  const [dlg, setDlg] = useState(false);
  const toast = useToast();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-xs font-medium text-ink-3">System</p>
        <h1 className="mt-1 text-xl font-semibold tracking-[-0.02em] sm:text-[32px] sm:leading-[38px]">Design system</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-2">
          <em className="not-italic text-ink-1">Instrument-grade calm.</em> A neutral, warm-graphite interface where colour is
          reserved for energy. Blue is always the battery, orange is always the supercapacitor, and nothing else
          competes with them. Toggle the theme in the top bar to review dark mode.
        </p>
      </div>

      <Section title="Surfaces & ink" note="Warm neutrals. Depth comes from hairlines and tone steps, not heavy shadows.">
        <div className="flex flex-col gap-4">
          <Swatches list={SURFACES} />
          <Swatches list={INK} />
        </div>
      </Section>

      <Section
        title="Energy & status colour"
        note="Series colours validated for colour-vision deficiency in both themes. Status colours are reserved and always ship with an icon and label."
      >
        <div className="flex flex-col gap-4">
          <Swatches list={DATA} />
          <Swatches list={STATUS} />
        </div>
      </Section>

      <Section title="Typography" note="Geist Sans for interface, Geist Mono with tabular figures for every number.">
        <Card className="divide-y divide-line">
          {TYPE.map(([cls, spec, role, sample]) => (
            <div key={cls} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-5 py-3">
              <div className="w-32 shrink-0">
                <div className="text-xs font-medium text-ink-1">{role}</div>
                <div className="num text-2xs text-ink-3">{spec}</div>
              </div>
              <div className={`${cls} min-w-0 truncate ${cls === "text-3xl" ? "num tracking-[-0.04em]" : ""} ${cls === "text-2xs" ? "uppercase tracking-[0.08em] text-ink-3" : ""}`}>
                {sample}
              </div>
            </div>
          ))}
        </Card>
      </Section>

      <Section title="Spacing, radius, depth" note="4px base grid. Radii step 4 → 20. Three elevation levels.">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-4">
            <div className="mb-3 text-xs text-ink-2">Spacing (4px grid)</div>
            <div className="flex flex-col gap-1.5">
              {[4, 8, 12, 16, 24, 32, 48].map((s) => (
                <div key={s} className="flex items-center gap-3">
                  <span className="num w-6 text-2xs text-ink-3">{s}</span>
                  <span className="h-2 rounded-xs bg-ink-2" style={{ width: s * 2 }} />
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <div className="mb-3 text-xs text-ink-2">Radius</div>
            <div className="flex flex-wrap gap-3">
              {["xs", "sm", "md", "lg", "xl"].map((r) => (
                <div key={r} className="text-center">
                  <div className="size-12 border border-line-strong bg-surface-2" style={{ borderRadius: `var(--r-${r})` }} />
                  <div className="num mt-1 text-2xs text-ink-3">{r}</div>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <div className="mb-3 text-xs text-ink-2">Elevation</div>
            <div className="flex gap-3">
              {["card", "pop", "modal"].map((s) => (
                <div key={s} className="text-center">
                  <div className={`size-12 rounded-md border border-line bg-surface-1 shadow-${s}`} />
                  <div className="num mt-1 text-2xs text-ink-3">{s}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </Section>

      <Section title="Buttons & controls" note="One primary action per view. Press feedback is a 1px drop, not a bounce.">
        <Card className="flex flex-col gap-5 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary">
              <Play className="size-3.5" /> Run simulation
            </Button>
            <Button>
              <Download className="size-3.5" /> Export C
            </Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger">Delete run</Button>
            <Button variant="primary" loading>
              Training
            </Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
          <div>
          <Segmented
            label="Example"
            value={seg}
            onChange={setSeg}
            options={[
              { value: "a", label: "Urban" },
              { value: "b", label: "Highway" },
              { value: "c", label: "Aggressive" },
            ]}
          />
          </div>
        </Card>
      </Section>

      <Section title="Forms" note="Labels above, units inline, help or error text below. Errors never rely on colour alone.">
        <Card className="grid gap-4 p-5 sm:grid-cols-3">
          <Field id="f-mass" label="Vehicle mass" unit="kg" defaultValue="1550" inputMode="decimal" hint="Kerb mass + 1 occupant" />
          <Field id="f-cap" label="SC capacitance" unit="F" defaultValue="20.8" inputMode="decimal" />
          <Field id="f-esr" label="SC ESR" unit="Ω" defaultValue="-0.04" inputMode="decimal" error="ESR must be greater than 0." />
        </Card>
      </Section>

      <Section title="Status & tags" note="Badges carry state; tags carry metadata.">
        <Card className="flex flex-wrap items-center gap-2 p-5">
          <StatusBadge status="good">Healthy</StatusBadge>
          <StatusBadge status="warning">Review</StatusBadge>
          <StatusBadge status="critical">Failed</StatusBadge>
          <StatusBadge status="running">Running</StatusBadge>
          <StatusBadge status="neutral">Queued</StatusBadge>
          <Tag>stand-in</Tag>
          <Tag>v0.3.1</Tag>
          <span className="mx-2 h-4 w-px bg-line" />
          <SeriesKey color="var(--series-bat)" label="Battery" />
          <SeriesKey color="var(--series-sc)" label="Supercap" />
        </Card>
      </Section>

      <Section title="Feedback" note="Modal dialogs for decisions, toasts for outcomes, skeletons for loading, empty states that tell you what to do next.">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="flex flex-col gap-3 p-5">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setDlg(true)}>Open dialog</Button>
              <Button onClick={() => toast({ tone: "good", title: "Simulation complete", body: "WLTP · Distilled ML · -11.2% peak C" })}>
                Success toast
              </Button>
              <Button onClick={() => toast({ tone: "critical", title: "Run failed", body: "Drive-cycle CSV is missing a speed column." })}>
                Error toast
              </Button>
            </div>
            <div className="mt-2 flex flex-col gap-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </Card>
          <Card>
            <CardHeader title="Drive cycles" description="Empty state example" />
            <EmptyState
              icon={<Route className="size-4" />}
              title="No custom cycles yet"
              body="Upload a CSV with time and speed columns, or start from WLTP, US06 or UDDS."
              action={<Button variant="primary">Upload cycle</Button>}
            />
          </Card>
        </div>
      </Section>

      <Dialog
        open={dlg}
        onClose={() => setDlg(false)}
        title="Retrain power-split policy?"
        description="Distils the current MPC solutions into a new XGBoost policy. The active version keeps running until you promote the new one."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDlg(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => setDlg(false)}>
              Start retraining
            </Button>
          </>
        }
      />
    </div>
  );
}
