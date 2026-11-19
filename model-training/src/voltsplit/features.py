"""Stage 2: feature engineering shared by the forecaster and the distilled policy.

Every feature is causal (uses only the present and the past), so the same
code can run on an ECU. The TypeScript twin lives in
frontend/src/lib/hess/ml.ts and must stay in the same order.
"""
from __future__ import annotations

import numpy as np

H = 10  # forecast / MPC horizon (s)
LAGS = 5

FORECAST_FEATURES = [
    "p_kw", *[f"p_lag{k}_kw" for k in range(1, LAGS + 1)],
    "v_ms", "a_ms2", "v_lag1_ms", "v_lag2_ms", "p_mean10_kw", "p_std10_kw", "grade", "k",
]

POLICY_FEATURES = [
    "p_kw", *[f"p_lag{k}_kw" for k in range(1, LAGS + 1)],
    "v_ms", "a_ms2", "v_lag1_ms", "v_lag2_ms", "p_mean10_kw", "p_std10_kw",
    "soc_sc", "soc_bat", "pbat_prev_kw",
]


def _lag(x: np.ndarray, k: int) -> np.ndarray:
    out = np.empty_like(x)
    out[:k] = x[0]
    out[k:] = x[:-k]
    return out


def base_features(p_req_w: np.ndarray, speed: np.ndarray, grade: np.ndarray | None = None) -> np.ndarray:
    """Columns: p, p lags 1..5, v, a, v lag1, v lag2, rolling mean/std(10) of p, grade."""
    p = np.asarray(p_req_w, float) / 1000.0
    v = np.asarray(speed, float)
    a = np.diff(v, prepend=v[0])
    n = len(p)
    cs = np.concatenate([[0.0], np.cumsum(p)])
    cs2 = np.concatenate([[0.0], np.cumsum(p * p)])
    idx = np.arange(n)
    lo = np.maximum(0, idx - 9)
    cnt = idx - lo + 1
    mean = (cs[idx + 1] - cs[lo]) / cnt
    var = np.maximum((cs2[idx + 1] - cs2[lo]) / cnt - mean**2, 0)
    g = np.zeros(n) if grade is None else np.asarray(grade, float)
    cols = [p, *[_lag(p, k) for k in range(1, LAGS + 1)], v, a, _lag(v, 1), _lag(v, 2), mean, np.sqrt(var), g]
    return np.column_stack(cols)


def forecast_dataset(p_req_w: np.ndarray, speed: np.ndarray, grade: np.ndarray | None = None):
    """Stacked multi-horizon samples: one row per (t, k), target p(t+k) in kW."""
    X0 = base_features(p_req_w, speed, grade)
    p = np.asarray(p_req_w, float) / 1000.0
    n = len(p)
    Xs, ys = [], []
    for k in range(1, H + 1):
        valid = np.arange(n - k)
        Xs.append(np.column_stack([X0[valid], np.full(len(valid), k)]))
        ys.append(p[valid + k])
    return np.vstack(Xs), np.concatenate(ys)


def forecast_rows(X0_t: np.ndarray) -> np.ndarray:
    """Rows for predicting k = 1..H from one time step's base features."""
    return np.column_stack([np.repeat(X0_t[None, :], H, axis=0), np.arange(1, H + 1)])


def policy_row(X0_t: np.ndarray, soc_sc: float, soc_bat: float, pbat_prev_kw: float) -> np.ndarray:
    return np.concatenate([X0_t[:-1], [soc_sc, soc_bat, pbat_prev_kw]])  # drop grade
