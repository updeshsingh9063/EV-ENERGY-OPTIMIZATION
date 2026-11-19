import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import { Landing } from "@/components/landing/Landing";

const serif = Instrument_Serif({ weight: "400", style: ["normal", "italic"], subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: { absolute: "VoltSplit · Let the battery breathe" },
  description:
    "Machine-learning energy management for battery and supercapacitor electric vehicles. Watch the trained controller split every power spike, live.",
};

export default function Page() {
  return (
    <div className={serif.variable}>
      <Landing />
    </div>
  );
}
