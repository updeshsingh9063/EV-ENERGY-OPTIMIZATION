"""HESS physics model: exact port of frontend/src/lib/hess/model.ts.

Parity with the TypeScript implementation is enforced by tests/test_parity.py.
SI units unless the name says otherwise.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Sequence

import numpy as np

RHO_AIR = 1.2
G = 9.81
J_PER_KWH = 3.6e6

CONFIG_DIR = Path(__file__).resolve().parents[2] / "config"


def load_config(name: str = "compact_ev") -> dict:
    return json.loads((CONFIG_DIR / f"{name}.json").read_text())


def power_demand(speed_ms: Sequence[float], grade: Sequence[float] | None, v: dict, dt: float = 1.0) -> np.ndarray:
    """Electrical power at the DC bus (W). Negative = regenerative braking."""
    s = np.asarray(speed_ms, dtype=float)
    a = np.zeros_like(s)
    a[1:] = (s[1:] - s[:-1]) / dt
    theta = np.arctan(np.asarray(grade, dtype=float)) if grade is not None else np.zeros_like(s)
    moving = (s > 0.1).astype(float)
    f_wheel = (
        v["massKg"] * a
        + 0.5 * RHO_AIR * v["dragCoeff"] * v["frontalAreaM2"] * s * s
        + v["massKg"] * G * v["rollingCoeff"] * moving * np.cos(theta)
        + v["massKg"] * G * np.sin(theta)
    )
    p_wheel = f_wheel * s
    p_bus = np.where(p_wheel >= 0, p_wheel / v["drivetrainEff"], p_wheel * v["regenEff"])
    return p_bus + v["auxPowerW"]


@dataclass
class State:
    i: int
    t: float
    p_req: float
    soc_bat: float
    soc_sc: float
    v_sc: float


Controller = Callable[[State, np.ndarray], float]


@dataclass
class SimResult:
    p_req: np.ndarray
    p_bat: np.ndarray
    p_sc: np.ndarray
    i_bat: np.ndarray
    soc_bat: np.ndarray
    soc_sc: np.ndarray
    kpis: dict = field(default_factory=dict)
    states: list = field(default_factory=list)  # controller inputs per step (for distillation)


def sc_limits(c: dict) -> tuple[float, float, float]:
    v_min = c["vMax"] * c["vMinRatio"]
    e_max = 0.5 * c["capacitanceF"] * c["vMax"] ** 2
    e_min = 0.5 * c["capacitanceF"] * v_min**2
    return e_min, e_max, e_max - e_min


def ocv_pack(b: dict, soc: float) -> float:
    return b["seriesCells"] * (b["cellOcvMin"] + (b["cellOcvMax"] - b["cellOcvMin"]) * soc)


def simulate(
    p_req: np.ndarray,
    controller: Controller,
    cfg: dict,
    init: dict | None = None,
    dt: float = 1.0,
    record_states: bool = False,
) -> SimResult:
    init = init or {"socBat": 0.8, "socSc": 0.75}
    b, c = cfg["battery"], cfg["supercap"]
    e_min, e_max, e_use = sc_limits(c)

    soc_bat = init["socBat"]
    e_sc = e_min + init["socSc"] * e_use
    e_sc0 = e_sc
    n = len(p_req)
    out = {k: np.zeros(n) for k in ("p_bat", "p_sc", "i_bat", "soc_bat", "soc_sc")}
    e_chem = loss_bat = loss_sc = loss_conv = 0.0
    peak_i = sum_i2 = ah = stress = 0.0
    violations = 0
    states = []

    for i in range(n):
        v_sc = math.sqrt(2 * e_sc / c["capacitanceF"])
        soc_sc = (e_sc - e_min) / e_use
        st = State(i, i * dt, float(p_req[i]), soc_bat, soc_sc, v_sc)
        if record_states:
            states.append(st)
        p_sc = float(controller(st, p_req))

        p_sc_max = c["maxCurrentA"] * v_sc
        p_sc = max(-p_sc_max, min(p_sc_max, p_sc))
        p_term = p_sc / c["converterEff"] if p_sc >= 0 else p_sc * c["converterEff"]
        i_sc = p_term / v_sc
        sc_loss = i_sc * i_sc * c["esrOhm"]
        e_next = e_sc - (p_term + sc_loss) * dt
        if e_next < e_min or e_next > e_max:
            target = e_min if e_next < e_min else e_max
            p_term = (e_sc - target) / dt - sc_loss
            p_sc = p_term * c["converterEff"] if p_term >= 0 else p_term / c["converterEff"]
            e_next = target
        loss_conv += abs(p_term - p_sc) * dt
        loss_sc += sc_loss * dt
        e_sc = e_next

        p_bat = p_req[i] - p_sc
        voc = ocv_pack(b, soc_bat)
        r = b["packResistanceOhm"]
        disc = max(voc * voc - 4 * r * p_bat, 0.0)
        i_bat = (voc - math.sqrt(disc)) / (2 * r)
        loss = i_bat * i_bat * r
        soc_bat -= (i_bat * dt) / (3600 * b["capacityAh"])
        if abs(i_bat) > b["maxCurrentA"] or soc_bat < b["socMin"] or soc_bat > b["socMax"]:
            violations += 1

        e_chem += voc * i_bat * dt
        loss_bat += loss * dt
        a_i = abs(i_bat)
        peak_i = max(peak_i, a_i)
        sum_i2 += i_bat * i_bat
        ah += a_i * dt / 3600
        stress += (a_i * dt / (3600 * b["capacityAh"])) * (a_i / b["capacityAh"]) ** 1.3

        out["p_bat"][i] = p_bat
        out["p_sc"][i] = p_sc
        out["i_bat"][i] = i_bat
        out["soc_bat"][i] = soc_bat
        out["soc_sc"][i] = (e_sc - e_min) / e_use

    kpis = {
        "energyTotalKwh": (e_chem + (e_sc0 - e_sc)) / J_PER_KWH,
        "batteryLossKwh": loss_bat / J_PER_KWH,
        "scLossKwh": loss_sc / J_PER_KWH,
        "converterLossKwh": loss_conv / J_PER_KWH,
        "peakCRate": peak_i / b["capacityAh"],
        "rmsCurrentA": math.sqrt(sum_i2 / n),
        "ahThroughput": ah,
        "dodStress": stress * 1000,
        "constraintViolations": violations,
    }
    return SimResult(np.asarray(p_req, float), out["p_bat"], out["p_sc"], out["i_bat"], out["soc_bat"], out["soc_sc"], kpis, states)


# ------------------------------------------------------------------ baselines (match controllers.ts)
def battery_only(_s: State, _trace: np.ndarray) -> float:
    return 0.0


def rule_based(threshold_w: float = 18_000, soc_target: float = 0.7, k_recharge: float = 25_000) -> Controller:
    def ctrl(s: State, _trace: np.ndarray) -> float:
        if s.p_req > threshold_w:
            return s.p_req - threshold_w
        if s.p_req < 0:
            return s.p_req
        return -k_recharge * (soc_target - s.soc_sc)

    return ctrl
