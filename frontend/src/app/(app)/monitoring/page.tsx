import type { Metadata } from "next";
import { Monitoring } from "@/components/pages/Monitoring";

export const metadata: Metadata = { title: "Monitoring" };
export default function Page() {
  return <Monitoring />;
}
