import type { Metadata } from "next";
import { Controller } from "@/components/pages/Controller";

export const metadata: Metadata = { title: "ECU controller" };
export default function Page() {
  return <Controller />;
}
