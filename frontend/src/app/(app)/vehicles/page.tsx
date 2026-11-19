import type { Metadata } from "next";
import { Suspense } from "react";
import { Vehicles } from "@/components/pages/Vehicles";

export const metadata: Metadata = { title: "Vehicle & HESS" };
export default function Page() {
  return <Suspense><Vehicles /></Suspense>;
}
