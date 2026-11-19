import type { Metadata } from "next";
import { Suspense } from "react";
import { DriveCycles } from "@/components/pages/DriveCycles";

export const metadata: Metadata = { title: "Drive cycles" };
export default function Page() {
  return <Suspense><DriveCycles /></Suspense>;
}
