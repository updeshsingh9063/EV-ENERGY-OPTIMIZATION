import {
  Activity,
  BatteryCharging,
  BrainCircuit,
  Car,
  Cpu,
  LayoutGrid,
  Palette,
  Play,
  Route,
} from "lucide-react";

/** Information architecture: single source for sidebar and route placeholders. */
export const NAV = [
  {
    group: "Workspace",
    items: [
      { href: "/", label: "Overview", icon: LayoutGrid },
      { href: "/simulate", label: "Simulate", icon: Play },
      { href: "/runs", label: "Runs", icon: Activity },
    ],
  },
  {
    group: "Inputs",
    items: [
      { href: "/drive-cycles", label: "Drive cycles", icon: Route },
      { href: "/vehicles", label: "Vehicle & HESS", icon: Car },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { href: "/models", label: "Models", icon: BrainCircuit },
      { href: "/controller", label: "ECU controller", icon: Cpu },
      { href: "/monitoring", label: "Monitoring", icon: BatteryCharging },
    ],
  },
  {
    group: "System",
    items: [{ href: "/design-system", label: "Design system", icon: Palette }],
  },
];
