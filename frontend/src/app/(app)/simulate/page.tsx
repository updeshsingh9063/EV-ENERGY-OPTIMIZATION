import type { Metadata } from "next";
import { Suspense } from "react";
import { Simulate } from "@/components/pages/Simulate";

export const metadata: Metadata = { title: "Simulate" };
export default function Page() {
  return <Suspense><Simulate /></Suspense>;
}
