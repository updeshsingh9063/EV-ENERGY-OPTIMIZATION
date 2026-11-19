import type { Metadata } from "next";
import { Models } from "@/components/pages/Models";

export const metadata: Metadata = { title: "Models" };
export default function Page() {
  return <Models />;
}
