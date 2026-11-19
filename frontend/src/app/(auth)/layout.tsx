import Link from "next/link";

function BrandPanel() {
  // A stylised power split: battery (blue) smooth, supercap (orange) taking the transients.
  const pts = Array.from({ length: 60 }, (_, i) => {
    const demand = 40 + 28 * Math.sin(i / 4) + 18 * Math.sin(i / 1.3) * (i % 7 < 3 ? 1 : 0.2);
    const bat = 40 + 26 * Math.sin(i / 4);
    return { x: (i / 59) * 400, demand, bat, sc: demand - bat };
  });
  const path = (k: "demand" | "bat" | "sc", off: number) => pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${(off - p[k]).toFixed(1)}`).join("");
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-surface-1 p-10 lg:flex">
      <Link href="/login" className="flex items-center gap-2.5" aria-label="VoltSplit">
        <span className="grid size-7 place-items-center rounded-sm bg-ink-1">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <path d="M3 3h4v10H3z" fill="var(--bg)" opacity="0.9" />
            <path d="M9 9h4v4H9z" fill="var(--volt)" />
            <path d="M9 3h4v4H9z" fill="var(--bg)" opacity="0.45" />
          </svg>
        </span>
        <span className="text-[15px] font-semibold tracking-tight">VoltSplit</span>
      </Link>
      <div>
        <svg viewBox="0 0 400 170" className="w-full" aria-hidden>
          <path d={path("demand", 110)} fill="none" stroke="var(--ink-3)" strokeWidth="1" opacity="0.5" />
          <path d={path("sc", 150)} fill="none" stroke="var(--series-sc)" strokeWidth="1.5" />
          <path d={path("bat", 110)} fill="none" stroke="var(--series-bat)" strokeWidth="2" />
        </svg>
        <p className="mt-8 max-w-sm text-xl font-semibold tracking-[-0.02em] text-ink-1">
          Let the supercapacitor take the spikes. Let the battery live longer.
        </p>
        <p className="mt-3 max-w-sm text-sm text-ink-2">
          ML-based energy management for battery + supercapacitor electric vehicles: simulate, compare and export ECU-ready
          controllers.
        </p>
      </div>
      <p className="text-2xs text-ink-3">Project 96 · Hybrid energy storage EV</p>
    </div>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel />
      <main className="flex items-center justify-center px-4 py-12 sm:px-6">
        <div className="rise w-full max-w-[380px]">{children}</div>
      </main>
    </div>
  );
}
