import type { Metadata } from "next";
import { RunCompare } from "@/components/pages/RunDetail";

export const metadata: Metadata = { title: "Compare runs" };
export default async function Page({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a = "", b = "" } = await searchParams;
  return <RunCompare a={a} b={b} />;
}
