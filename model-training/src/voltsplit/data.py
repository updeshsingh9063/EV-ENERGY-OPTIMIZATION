"""Stages 1 and 2: data acquisition and preprocessing.

Sources (from problem statement #96):
  * NREL FASTSim drive cycles (fastsim-2 resources): UDDS, HWFET, US06, WLTC class 3b
  * NASA PCoE Li-ion battery aging data set (impedance → internal-resistance growth)
  * "Community driving cycles" (github.com/PathfinderAV/driving-cycles) returns HTTP 404; not available.
"""
from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"

FASTSIM_BASE = "https://raw.githubusercontent.com/NatLabRockies/fastsim/fastsim-2/python/fastsim/resources/cycles"
DATASET_CYCLES = {
    "udds": ("UDDS (EPA urban)", "US EPA Urban Dynamometer Driving Schedule"),
    "hwfet": ("HWFET (EPA highway)", "US EPA Highway Fuel Economy Test"),
    "us06": ("US06 (EPA aggressive)", "US EPA high-acceleration supplemental cycle"),
    "wltc_3b": ("WLTC Class 3b", "Worldwide harmonised light-vehicle test cycle, class 3b"),
}
NASA_URL = "https://phm-datasets.s3.amazonaws.com/NASA/5.+Battery+Data+Set.zip"
NASA_CELLS = ("B0005", "B0006", "B0007", "B0018")

# Held-out cycles are never used for training any model.
TRAIN_CYCLES = ("udds", "hwfet")
TEST_CYCLES = ("us06", "wltc_3b")


# ---------------------------------------------------------------- drive cycles
def download_cycles() -> None:
    (RAW / "cycles").mkdir(parents=True, exist_ok=True)
    for key in DATASET_CYCLES:
        dest = RAW / "cycles" / f"{key}.csv"
        if not dest.exists():
            r = requests.get(f"{FASTSIM_BASE}/{key}.csv", timeout=60)
            r.raise_for_status()
            dest.write_bytes(r.content)


def load_cycle(key: str) -> tuple[np.ndarray, np.ndarray]:
    """Returns (speed m/s, grade) resampled to 1 Hz."""
    df = pd.read_csv(RAW / "cycles" / f"{key}.csv")
    t = df["cycSecs"].to_numpy(float)
    grid = np.arange(t[0], t[-1] + 1e-9, 1.0)
    v = np.interp(grid, t, df["cycMps"].to_numpy(float)).clip(min=0)
    g = np.interp(grid, t, df["cycGrade"].to_numpy(float)) if "cycGrade" in df else np.zeros_like(v)
    return v, g


def load_synthetic(name: str) -> np.ndarray:
    fx = json.loads((ROOT / "tests" / "fixtures" / "ts_parity.json").read_text())
    return np.asarray(fx[name]["speedMs"], float)


def augment(speed: np.ndarray, rng: np.random.Generator, n: int) -> list[np.ndarray]:
    """Speed scaling + time warping + segment re-ordering → plausible new cycles."""
    out = []
    stops = np.flatnonzero((speed[1:] < 0.1) & (speed[:-1] >= 0.1)) + 1
    segments = np.split(speed, stops) if len(stops) > 2 else [speed]
    for _ in range(n):
        segs = [segments[i] for i in rng.permutation(len(segments))]
        s = np.concatenate(segs)
        warp = rng.uniform(0.8, 1.25)
        grid = np.arange(0, len(s) - 1, 1 / warp)
        s = np.interp(grid, np.arange(len(s)), s) * rng.uniform(0.85, 1.4)
        out.append(np.clip(s, 0, 40))  # ≤ 144 km/h
    return out


# ---------------------------------------------------------------- NASA battery data
def download_nasa() -> Path:
    dest = RAW / "nasa" / "battery_data_set.zip"
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        with requests.get(NASA_URL, stream=True, timeout=600) as r:
            r.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)
    return dest


def _find_mats(z: zipfile.ZipFile, wanted: tuple[str, ...]) -> dict[str, bytes]:
    found: dict[str, bytes] = {}
    for name in z.namelist():
        base = Path(name).stem
        if name.lower().endswith(".mat") and base in wanted:
            found[base] = z.read(name)
        elif name.lower().endswith(".zip"):
            found.update(_find_mats(zipfile.ZipFile(io.BytesIO(z.read(name))), wanted))
    return found


def nasa_resistance_table() -> pd.DataFrame:
    """Per impedance test: Re, Rct (Ω) and normalised resistance growth R/R0 for each cell."""
    out_csv = PROCESSED / "nasa_resistance.csv"
    if out_csv.exists():
        return pd.read_csv(out_csv)
    from scipy.io import loadmat

    mats = _find_mats(zipfile.ZipFile(download_nasa()), NASA_CELLS)
    rows = []
    for cell, blob in mats.items():
        m = loadmat(io.BytesIO(blob), simplify_cells=True)[cell]
        k = 0
        for cyc in m["cycle"]:
            if cyc["type"] != "impedance":
                continue
            re, rct = float(np.real(cyc["data"]["Re"])), float(np.real(cyc["data"]["Rct"]))
            if not (0 < re < 1 and 0 < rct < 1):
                continue
            rows.append({"cell": cell, "test": k, "Re": re, "Rct": rct, "R": re + rct})
            k += 1
    df = pd.DataFrame(rows)
    df["growth"] = df.groupby("cell")["R"].transform(lambda r: r / r.iloc[:3].median())
    PROCESSED.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_csv, index=False)
    return df
