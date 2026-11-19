"use client";

import { Check, CheckCircle2, Copy, Cpu, Download, FileCode2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader, Stat, StatGrid } from "@/components/ui/form";
import { Button, Card, CardHeader, Skeleton, StatusBadge, Tag } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { guardrailC } from "@/lib/hess/guardrail";
import { downloadText } from "@/lib/hess/registry";
import { useActiveModel, useActiveVehicle, useStore, vehicleSummary } from "@/lib/store";

interface Sil {
  passed: boolean; max_abs_diff_kw: number; mean_abs_diff_kw: number; share_within_0p01_kw: number;
  steps_compared: number; us_per_inference: number; object_size_kb_Os: number; compiler: string; fallback_activations: number;
}

export function Controller() {
  const vehicle = useActiveVehicle();
  const toast = useToast();
  const { ready, signedUrl } = useStore();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const code = useMemo(() => guardrailC(vehicle.config, vehicle.name), [vehicle]);
  const policy = useActiveModel("policy");
  const sil = policy?.metrics.sil as Sil | undefined;
  const download = async (file: string) => {
    if (!policy) return;
    setBusy(file);
    try {
      const url = await signedUrl(`exports/${policy.version}/${file}`);
      const a = document.createElement("a");
      a.href = url;
      a.download = file;
      a.click();
    } catch (e) {
      toast({ tone: "critical", title: "Download failed", body: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };
  const sum = vehicleSummary(vehicle.config);
  const b = vehicle.config.battery, s = vehicle.config.supercap;

  const signals = [
    ["IN", "P_req", "Traction power demand", "W", `-${(b.maxCurrentA * sum.vNom / 1000).toFixed(0)}k … +${(b.maxCurrentA * sum.vNom / 1000).toFixed(0)}k`],
    ["IN", "SOC_bat", "Battery state of charge", "0 to 1", `${b.socMin} … ${b.socMax}`],
    ["IN", "SOC_sc", "Supercap state of charge (usable window)", "0 to 1", "0 … 1"],
    ["IN", "V_sc", "Supercap terminal voltage", "V", `${(s.vMax * s.vMinRatio).toFixed(0)} … ${s.vMax}`],
    ["IN", "v", "Vehicle speed", "m/s", "0 … 70"],
    ["OUT", "P_sc_cmd", "Supercap power command to DC/DC", "W", `±${((s.maxCurrentA * s.vMax) / 1000).toFixed(0)}k`],
    ["OUT", "flags", "Guardrail status bits (fallback / SC / battery limited)", "bitfield", "0 … 7"],
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Intelligence"
        title="ECU controller"
        description={`Deployment package for ${vehicle.name}: the distilled policy as lightweight C for the vehicle ECU, wrapped in a hard-limit safety guardrail.`}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rise" style={{ animationDelay: "40ms" }}>
          <CardHeader
            title="Distilled policy"
            description={policy ? String(policy.metrics.algorithm ?? "") : "Tree-ensemble policy distilled from MPC"}
            actions={!ready ? <Skeleton className="h-5 w-16" /> : policy ? <StatusBadge status="good">{policy.version}</StatusBadge> : <StatusBadge status="neutral">Not trained</StatusBadge>}
          />
          <div className="flex flex-col gap-3 p-5">
            {[
              ["hess_policy.c", "C99 · ECU", "Streaming features + tree inference + guardrail; no heap"],
              ["hess_policy.h", "C99 header", "hess_ctrl_init() / hess_ctrl_step() API"],
              ["hess_policy.ts", "TypeScript", "Same model as used by this app's simulator"],
              ["equivalence_report.json", "SIL verification", "C vs Python on held-out cycles"],
            ].map(([file, target, note]) => (
              <div key={file} className="flex items-center gap-3 rounded-md border border-line p-3">
                <FileCode2 className="size-4 shrink-0 text-ink-3" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="num truncate text-sm text-ink-1">{file}</div>
                  <div className="truncate text-2xs text-ink-3">{target} · {note}</div>
                </div>
                <Button size="sm" disabled={!policy} loading={busy === file} onClick={() => download(file)} aria-label={`Download ${file}`}>
                  {busy !== file && <Download className="size-3.5" aria-hidden />}
                </Button>
              </div>
            ))}
            {!policy && ready && (
              <p className="text-2xs text-ink-3">Run the training pipeline with --publish to make the exports available.</p>
            )}
          </div>
        </Card>

        <Card className="rise overflow-hidden" style={{ animationDelay: "80ms" }}>
          <CardHeader title="CAN signal interface" description="Inputs read and outputs written by the controller each step" />
          <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table">
            <table className="w-full min-w-[460px] text-sm">
              <thead>
                <tr className="border-y border-line bg-surface-2 text-left text-2xs uppercase tracking-[0.06em] text-ink-3">
                  <th className="py-2 pl-5 pr-2 font-medium">Dir</th>
                  <th className="px-2 py-2 font-medium">Signal</th>
                  <th className="px-2 py-2 font-medium">Unit</th>
                  <th className="py-2 pl-2 pr-5 text-right font-medium">Range</th>
                </tr>
              </thead>
              <tbody>
                {signals.map(([dir, sig, desc, unit, range]) => (
                  <tr key={sig} className="border-b border-line last:border-0">
                    <td className="py-2 pl-5 pr-2"><Tag>{dir}</Tag></td>
                    <td className="px-2 py-2">
                      <div className="num text-ink-1">{sig}</div>
                      <div className="text-2xs text-ink-3">{desc}</div>
                    </td>
                    <td className="num px-2 py-2 text-ink-2">{unit}</td>
                    <td className="num py-2 pl-2 pr-5 text-right text-ink-2">{range}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {sil && (
        <Card className="rise" style={{ animationDelay: "100ms" }}>
          <CardHeader
            title="Software-in-the-loop verification"
            description={`Compiled C controller replayed against the Python model on held-out US06 and WLTC 3b (${sil.compiler}).`}
            actions={
              sil.passed ? (
                <StatusBadge status="good">Equivalent</StatusBadge>
              ) : (
                <StatusBadge status="critical">Mismatch</StatusBadge>
              )
            }
          />
          <div className="p-5">
            <StatGrid cols={4}>
              <Stat label="Steps compared" value={sil.steps_compared.toLocaleString()} />
              <Stat label="Within 0.01 kW" value={(sil.share_within_0p01_kw * 100).toFixed(2)} unit="%" />
              <Stat label="Inference time" value={sil.us_per_inference.toFixed(2)} unit="µs" />
              <Stat label="Object size (-Os)" value={sil.object_size_kb_Os} unit="KB" />
            </StatGrid>
            <p className="mt-3 flex items-center gap-1.5 text-2xs text-ink-3">
              {sil.passed ? <CheckCircle2 className="size-3 text-good" aria-hidden /> : <XCircle className="size-3 text-critical" aria-hidden />}
              Max deviation {sil.max_abs_diff_kw.toFixed(4)} kW, mean {sil.mean_abs_diff_kw.toFixed(5)} kW · {sil.fallback_activations} guardrail fallbacks
            </p>
          </div>
        </Card>
      )}

      <Card className="rise overflow-hidden" style={{ animationDelay: "120ms" }}>
        <CardHeader
          title="Safety guardrail"
          description={`Generated from ${vehicle.name}'s limits. Every model command passes through it; invalid output falls back to the rule-based split.`}
          actions={
            <>
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(code);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch {
                    toast({ tone: "critical", title: "Copy failed", body: "Clipboard access was blocked by the browser." });
                  }
                }}
              >
                {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button size="sm" variant="primary" onClick={() => downloadText("hess_guardrail.h", code, "text/x-c")}>
                <Download className="size-3.5" aria-hidden /> hess_guardrail.h
              </Button>
            </>
          }
        />
        <div className="mt-4 flex items-center gap-2 border-y border-line bg-surface-2 px-5 py-2 text-2xs text-ink-3">
          <Cpu className="size-3" aria-hidden /> C99 · header-only · {code.split("\n").length} lines
        </div>
        <pre tabIndex={0} aria-label="Generated C source" className="num max-h-[480px] overflow-auto px-5 py-4 text-xs leading-5 text-ink-2">
          <code>{code}</code>
        </pre>
      </Card>
    </div>
  );
}
