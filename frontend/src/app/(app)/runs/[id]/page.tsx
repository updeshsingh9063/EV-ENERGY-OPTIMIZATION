import type { Metadata } from "next";
import { RunDetail } from "@/components/pages/RunDetail";

export const metadata: Metadata = { title: "Run" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RunDetail id={id} />;
}
