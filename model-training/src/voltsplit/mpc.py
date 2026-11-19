"""Stage 4: model predictive control of the power split.

Corrected formulation (problem statement's objective minimised P_req, which is not a
decision variable). Units: kW, kJ, 1 s steps. Decision u_k = supercap power at the bus.

  min  Σ_k  (a_b + w_s)·b_k²  +  a_s·u_k² + c_s·|u_k|  +  w_d·(b_k - b_{k-1})²  +  ρ·(lo_k² + hi_k²)
       + w_T·(E_H - E_ref)²
  s.t. b_k = p̂_k - u_k                       (power balance)
       E_{k+1} = E_k - u_k                    (supercap energy, kJ)
       lo_k ≥ E_lo - E_{k+1}, hi_k ≥ E_{k+1} - E_hi, lo, hi ≥ 0   (soft SOC window)
       u_min_k ≤ u_k ≤ u_max_k                (SC current limit ∩ battery current limit)

a_b, a_s, c_s come from the loss surrogates (converter loss is ~linear in |u|);
w_s weights battery stress (I² ∝ b²). The projected-gradient twin smooths |u| as √(u²+δ²).
Teacher solver: OSQP via CVXPY. `solve_pg` is the dependency-free projected-gradient
solver mirrored in TypeScript for the in-app simulator (agreement tested).
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

import cvxpy as cp
import numpy as np

from .features import H
from .physics import sc_limits


@dataclass
class MpcParams:
    a_b: float          # battery loss surrogate coefficient (kW per kW²)
    a_s: float          # supercap + converter loss surrogate coefficient
    w_s: float          # battery stress weight
    c_s: float = 0.0    # supercap/converter linear loss coefficient (kW per kW)
    delta: float = 0.5  # |u| smoothing for the gradient solver (kW)
    w_d: float = 0.002  # battery power smoothness
    w_T: float = 2e-4   # terminal SC energy
    rho: float = 0.05   # soft SOC window
    soc_ref: float = 0.7
    soc_lo: float = 0.1
    soc_hi: float = 0.95
    e_use_kj: float = 0.0
    u_abs_max: float = 0.0  # SC power limit (kW)
    b_abs_max: float = 0.0  # battery power limit (kW)

    def to_json(self) -> dict:
        return asdict(self)


def params_for(cfg: dict, a_b: float, a_s: float, w_s: float, c_s: float = 0.0) -> MpcParams:
    b, c = cfg["battery"], cfg["supercap"]
    _, _, e_use = sc_limits(c)
    v_nom = b["seriesCells"] * (b["cellOcvMin"] + b["cellOcvMax"]) / 2
    return MpcParams(
        a_b=a_b, a_s=a_s, w_s=w_s, c_s=c_s, e_use_kj=e_use / 1000,
        u_abs_max=c["maxCurrentA"] * c["vMax"] * c["vMinRatio"] / 1000,  # conservative (lowest V)
        b_abs_max=0.95 * b["maxCurrentA"] * v_nom / 1000,
    )


def bounds(p_hat: np.ndarray, m: MpcParams) -> tuple[np.ndarray, np.ndarray]:
    lo = np.maximum(-m.u_abs_max, p_hat - m.b_abs_max)
    hi = np.minimum(m.u_abs_max, p_hat + m.b_abs_max)
    return lo, np.maximum(hi, lo)


class OsqpMpc:
    """Parametrised (DPP) problem, compiled once and re-solved each step with warm start."""

    def __init__(self, m: MpcParams):
        self.m = m
        self.u = cp.Variable(H)
        self.lo = cp.Variable(H, nonneg=True)
        self.hi = cp.Variable(H, nonneg=True)
        self.p_hat = cp.Parameter(H)
        self.e0 = cp.Parameter()
        self.b_prev = cp.Parameter()
        self.u_lo = cp.Parameter(H)
        self.u_hi = cp.Parameter(H)
        L = np.tril(np.ones((H, H)))
        b = self.p_hat - self.u
        e = self.e0 - L @ self.u
        db = cp.hstack([b[0] - self.b_prev, b[1:] - b[:-1]])
        e_lo, e_hi, e_ref = m.soc_lo * m.e_use_kj, m.soc_hi * m.e_use_kj, m.soc_ref * m.e_use_kj
        cost = (
            (m.a_b + m.w_s) * cp.sum_squares(b)
            + m.a_s * cp.sum_squares(self.u)
            + m.c_s * cp.norm1(self.u)
            + m.w_d * cp.sum_squares(db)
            + m.rho * (cp.sum_squares(self.lo) + cp.sum_squares(self.hi))
            + m.w_T * cp.square(e[H - 1] - e_ref)
        )
        cons = [self.lo >= e_lo - e, self.hi >= e - e_hi, self.u >= self.u_lo, self.u <= self.u_hi]
        self.prob = cp.Problem(cp.Minimize(cost), cons)

    def solve(self, p_hat_kw: np.ndarray, soc_sc: float, b_prev_kw: float) -> np.ndarray:
        self.p_hat.value = p_hat_kw
        self.e0.value = soc_sc * self.m.e_use_kj
        self.b_prev.value = b_prev_kw
        lo, hi = bounds(p_hat_kw, self.m)
        self.u_lo.value, self.u_hi.value = lo, hi
        self.prob.solve(solver=cp.OSQP, warm_start=True, eps_abs=1e-6, eps_rel=1e-6, max_iter=20000)
        if self.u.value is None:
            return np.clip(np.zeros(H), lo, hi)
        return np.clip(self.u.value, lo, hi)


def objective_grad(u: np.ndarray, p_hat: np.ndarray, e0: float, b_prev: float, m: MpcParams):
    b = p_hat - u
    e = e0 - np.cumsum(u)
    db = np.diff(np.concatenate([[b_prev], b]))
    e_lo, e_hi, e_ref = m.soc_lo * m.e_use_kj, m.soc_hi * m.e_use_kj, m.soc_ref * m.e_use_kj
    lo = np.maximum(0, e_lo - e)
    hi = np.maximum(0, e - e_hi)
    term = e[-1] - e_ref
    sm = np.sqrt(u * u + m.delta * m.delta)
    f = ((m.a_b + m.w_s) * b @ b + m.a_s * u @ u + m.c_s * np.sum(sm) + m.w_d * db @ db
         + m.rho * (lo @ lo + hi @ hi) + m.w_T * term**2)
    g = -2 * (m.a_b + m.w_s) * b + 2 * m.a_s * u + m.c_s * u / sm
    # smoothness: d/du_k of Σ (b_j - b_{j-1})², b = p - u
    gdb = 2 * m.w_d * db
    g += -gdb + np.concatenate([gdb[1:], [0.0]])
    # E_k depends on u_0..u_k with coefficient -1 → gradient is a reverse cumulative sum
    de = 2 * m.rho * (-lo + hi)
    de[-1] += 2 * m.w_T * term
    g += -np.cumsum(de[::-1])[::-1]
    return f, g


def lipschitz(m: MpcParams) -> float:
    return 2 * (m.a_b + m.w_s + m.a_s + 4 * m.w_d) + m.c_s / m.delta + 2 * (m.rho + m.w_T) * H * H


def solve_pg(p_hat: np.ndarray, soc_sc: float, b_prev: float, m: MpcParams, u0: np.ndarray | None = None, iters: int = 200) -> np.ndarray:
    """Accelerated projected gradient (FISTA). Mirrors mpcSolve() in frontend/src/lib/hess/ml.ts."""
    lo, hi = bounds(p_hat, m)
    e0 = soc_sc * m.e_use_kj
    step = 1.0 / lipschitz(m)
    x = np.clip(np.zeros(H) if u0 is None else u0, lo, hi)
    y, t = x.copy(), 1.0
    for _ in range(iters):
        _, g = objective_grad(y, p_hat, e0, b_prev, m)
        x_new = np.clip(y - step * g, lo, hi)
        t_new = (1 + np.sqrt(1 + 4 * t * t)) / 2
        y = x_new + ((t - 1) / t_new) * (x_new - x)
        x, t = x_new, t_new
    return x
