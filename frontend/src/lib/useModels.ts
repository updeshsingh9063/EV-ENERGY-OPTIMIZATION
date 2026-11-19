"use client";

import { useEffect, useState } from "react";
import { loadModels, type LoadedModels } from "./hess/registry";

/** Loads the trained controller models on demand (kept out of the initial bundle). */
export function useModels() {
  const [models, setModels] = useState<LoadedModels | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadModels()
      .then((m) => live && setModels(m))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, []);
  return { models, error };
}
