"""Stages 3 and 4: predictive models (forecaster, loss surrogates), MPC rollouts and policy distillation."""
from __future__ import annotations

import time
from dataclasses import dataclass

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.ensemble import RandomForestRegressor
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import RBF, ConstantKernel, WhiteKernel
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.preprocessing import StandardScaler

from .features import H, base_features, forecast_dataset, forecast_rows, policy_row
from .mpc import MpcParams, OsqpMpc
from .physics import State, simulate

SEED = 7


# ================================================================= forecaster
@dataclass
class Forecaster:
    booster: xgb.XGBRegressor

    def predict_horizon(self, X0_t: np.ndarray) -> np.ndarray:
        return self.booster.predict(forecast_rows(X0_t).astype(np.float32))


def train_forecaster(train: list[tuple], test: list[tuple]) -> tuple[Forecaster, dict]:
    """train/test: lists of (p_req_w, speed, grade). Compares GBM vs Gaussian Process vs persistence."""
    Xtr, ytr = _stack(train)
    Xte, yte = _stack(test)
    gbm = xgb.XGBRegressor(n_estimators=160, max_depth=5, learning_rate=0.08, subsample=0.9,
                           colsample_bytree=0.9, min_child_weight=3, random_state=SEED, n_jobs=4)
    t0 = time.perf_counter()
    gbm.fit(Xtr, ytr)
    fit_s = time.perf_counter() - t0
    pred = gbm.predict(Xte)

    k_te = Xte[:, -1].astype(int)
    per_h = {int(k): float(mean_absolute_error(yte[k_te == k], pred[k_te == k])) for k in range(1, H + 1)}
    persistence = float(mean_absolute_error(yte, Xte[:, 0]))

    # Gaussian Process baseline on a subsample (GP training is O(n³))
    rng = np.random.default_rng(SEED)
    sub = rng.choice(len(Xtr), size=min(1500, len(Xtr)), replace=False)
    sc = StandardScaler().fit(Xtr[sub])
    gp = GaussianProcessRegressor(ConstantKernel() * RBF(np.ones(Xtr.shape[1])) + WhiteKernel(), normalize_y=True, random_state=SEED)
    gp.fit(sc.transform(Xtr[sub]), ytr[sub])
    te_sub = rng.choice(len(Xte), size=min(4000, len(Xte)), replace=False)
    gp_pred, gp_std = gp.predict(sc.transform(Xte[te_sub]), return_std=True)
    gp_mae = float(mean_absolute_error(yte[te_sub], gp_pred))
    coverage = float(np.mean(np.abs(yte[te_sub] - gp_pred) <= 1.96 * gp_std))

    metrics = {
        "algorithm": "XGBoost (GBM), stacked multi-horizon",
        "horizon_s": H,
        "mae_kw": float(mean_absolute_error(yte, pred)),
        "rmse_kw": float(np.sqrt(np.mean((yte - pred) ** 2))),
        "mae_per_horizon_kw": per_h,
        "baseline_persistence_mae_kw": persistence,
        "baseline_gp_mae_kw": gp_mae,
        "gp_95ci_coverage": coverage,
        "train_rows": int(len(Xtr)),
        "test_rows": int(len(Xte)),
        "fit_seconds": round(fit_s, 2),
        "test_cycles": "US06, WLTC 3b (held out)",
    }
    return Forecaster(gbm), metrics


def _stack(cycles):
    Xs, ys = zip(*[forecast_dataset(*c) for c in cycles])
    return np.vstack(Xs).astype(np.float32), np.concatenate(ys)


# ================================================================= loss surrogates
def battery_loss_w(p_w, soc, growth, b):
    r = b["packResistanceOhm"] * growth
    voc = b["seriesCells"] * (b["cellOcvMin"] + (b["cellOcvMax"] - b["cellOcvMin"]) * soc)
    i = (voc - np.sqrt(np.maximum(voc * voc - 4 * r * p_w, 0))) / (2 * r)
    return i * i * r


def sc_loss_w(p_w, v_sc, c):
    p_term = np.where(p_w >= 0, p_w / c["converterEff"], p_w * c["converterEff"])
    i = p_term / v_sc
    return i * i * c["esrOhm"] + np.abs(p_term - p_w)


def train_surrogates(cfg: dict, nasa: pd.DataFrame) -> tuple[dict, dict, float, float, float]:
    """GP surrogates L_bat(P, SOC, R-growth) and L_sc(P, V_sc); returns MPC quadratic coefficients."""
    b, c = cfg["battery"], cfg["supercap"]
    rng = np.random.default_rng(SEED)
    growth_pool = nasa["growth"].clip(0.9, 2.0).to_numpy()

    def bat_samples(n):
        P = rng.uniform(-80, 80, n)
        S = rng.uniform(b["socMin"], b["socMax"], n)
        Gr = rng.choice(growth_pool, n)
        return np.column_stack([P, S, Gr]), battery_loss_w(P * 1000, S, Gr, b) / 1000

    def sc_samples(n):
        P = rng.uniform(-60, 60, n)
        V = rng.uniform(c["vMax"] * c["vMinRatio"], c["vMax"], n)
        return np.column_stack([P, V]), sc_loss_w(P * 1000, V, c) / 1000

    out, gps = {}, {}
    for name, sampler in (("loss-bat", bat_samples), ("loss-sc", sc_samples)):
        Xtr, ytr = sampler(700)
        Xte, yte = sampler(3000)
        sc = StandardScaler().fit(Xtr)
        k = (ConstantKernel(1.0, (1e-3, 1e3)) * RBF(np.ones(Xtr.shape[1]), (0.05, 100.0))
             + WhiteKernel(1e-4, (1e-8, 1e-1)))
        gp = GaussianProcessRegressor(k, normalize_y=True, n_restarts_optimizer=3, random_state=SEED).fit(sc.transform(Xtr), ytr)
        pred, std = gp.predict(sc.transform(Xte), return_std=True)
        out[name] = {
            "algorithm": "Gaussian Process (RBF-ARD + white noise)",
            "r2": float(r2_score(yte, pred)),
            "mae_w": float(mean_absolute_error(yte, pred) * 1000),
            "ci95_coverage": float(np.mean(np.abs(yte - pred) <= 1.96 * std + 1e-9)),
            "train_points": 700,
            "test_points": 3000,
            "inputs": ["P_bat_kW", "SOC", "R_growth (NASA PCoE)"] if name == "loss-bat" else ["P_sc_kW", "V_sc"],
        }
        gps[name] = (gp, sc)

    # Quadratic coefficients for the MPC, fitted to the GP surrogate over the operating range.
    Pq = np.linspace(-40, 40, 161)
    gp, sc = gps["loss-bat"]
    Lb = gp.predict(sc.transform(np.column_stack([Pq, np.full_like(Pq, 0.6), np.ones_like(Pq)])))
    a_b = max(float(np.sum(Lb * Pq**2) / np.sum(Pq**4)), 0.0)
    Ps = np.linspace(-40, 40, 161)
    gp, sc = gps["loss-sc"]
    Ls = gp.predict(sc.transform(np.column_stack([Ps, np.full_like(Ps, 0.85 * c["vMax"])])))
    A = np.column_stack([np.abs(Ps), Ps**2])
    (c_s, a_s), *_ = np.linalg.lstsq(A, Ls, rcond=None)
    c_s, a_s = max(float(c_s), 0.0), max(float(a_s), 0.0)  # keep the MPC convex
    out["loss-bat"]["mpc_fit"] = {"a_b_kw_per_kw2": a_b}
    out["loss-sc"]["mpc_fit"] = {"c_s_kw_per_kw": float(c_s), "a_s_kw_per_kw2": float(a_s)}
    return out, gps, a_b, float(a_s), float(c_s)


# ================================================================= MPC rollouts
def mpc_controller(m: MpcParams, forecaster: Forecaster | None, X0: np.ndarray, record: list | None = None):
    """Closed-loop MPC; uses the forecaster (or the true future when forecaster is None)."""
    solver = OsqpMpc(m)
    prev = {"b": 0.0}

    def ctrl(s: State, trace: np.ndarray) -> float:
        p_now = trace[s.i] / 1000
        if forecaster is None:
            fut = trace[s.i + 1 : s.i + H] / 1000
            fut = np.concatenate([fut, np.full(H - 1 - len(fut), fut[-1] if len(fut) else p_now)])
        else:
            fut = forecaster.predict_horizon(X0[s.i])[: H - 1]
        p_hat = np.concatenate([[p_now], fut])
        u = solver.solve(p_hat, s.soc_sc, prev["b"])
        u0 = float(u[0])
        if record is not None:
            record.append((policy_row(X0[s.i], s.soc_sc, s.soc_bat, prev["b"]), u0))
        prev["b"] = p_now - u0
        return u0 * 1000

    return ctrl


def tune_stress_weight(cfg, m_base: MpcParams, cycles, base_kpis, rule_kpis, margin=0.0025):
    """Pick w_s: the largest battery-stress reduction whose E_tot is at least `margin` below the
    rule-based HESS controller (the industry baseline) on the training cycles."""
    rows = []
    for w_s in (0.0, 0.00025, 0.0005, 0.001, 0.002, 0.004, 0.008):
        m = MpcParams(**{**m_base.to_json(), "w_s": w_s})
        e_rel, s_rel, e_rule = [], [], []
        for (p, v, g), bk, rk in zip(cycles, base_kpis, rule_kpis):
            r = simulate(p, mpc_controller(m, None, base_features(p, v, g)), cfg)
            e_rel.append(r.kpis["energyTotalKwh"] / bk["energyTotalKwh"] - 1)
            e_rule.append(r.kpis["energyTotalKwh"] / rk["energyTotalKwh"] - 1)
            s_rel.append(r.kpis["dodStress"] / bk["dodStress"] - 1)
        rows.append({"w_s": w_s, "energy_vs_battery_only": float(np.mean(e_rel)),
                     "energy_vs_rule_based": float(np.mean(e_rule)), "stress_vs_battery_only": float(np.mean(s_rel))})
    ok = [r for r in rows if r["energy_vs_rule_based"] <= -margin] or [min(rows, key=lambda r: r["energy_vs_rule_based"])]
    best = min(ok, key=lambda r: r["stress_vs_battery_only"])
    return best["w_s"], rows


# ================================================================= distillation
def policy_controller(model, m: MpcParams, X0: np.ndarray, record: list | None = None, teacher: OsqpMpc | None = None,
                      forecaster: Forecaster | None = None):
    """Distilled policy + guardrail. With `teacher`, also logs MPC labels at visited states (DAgger)."""
    prev = {"b": 0.0}

    def ctrl(s: State, trace: np.ndarray) -> float:
        p_now = trace[s.i] / 1000
        row = policy_row(X0[s.i], s.soc_sc, s.soc_bat, prev["b"])
        u = float(model.predict(row[None, :].astype(np.float32))[0])
        u = float(np.clip(u, max(-m.u_abs_max, p_now - m.b_abs_max), min(m.u_abs_max, p_now + m.b_abs_max)))
        if teacher is not None and record is not None:
            fut = forecaster.predict_horizon(X0[s.i])[: H - 1]
            label = teacher.solve(np.concatenate([[p_now], fut]), s.soc_sc, prev["b"])[0]
            record.append((row, float(label)))
        prev["b"] = p_now - u
        return u * 1000

    return ctrl


def fit_policies(X: np.ndarray, y: np.ndarray):
    xg = xgb.XGBRegressor(n_estimators=180, max_depth=6, learning_rate=0.08, subsample=0.9, colsample_bytree=0.9,
                          min_child_weight=2, random_state=SEED, n_jobs=4).fit(X, y)
    rf = RandomForestRegressor(n_estimators=60, max_leaf_nodes=256, min_samples_leaf=3, random_state=SEED, n_jobs=4).fit(X, y)
    return {"xgboost": xg, "random_forest": rf}


def model_nodes(model) -> int:
    if isinstance(model, xgb.XGBRegressor):
        return int(model.get_booster().trees_to_dataframe().shape[0])
    return int(sum(e.tree_.node_count for e in model.estimators_))


def time_inference(model, X: np.ndarray, n: int = 2000) -> float:
    rows = X[:n]
    t0 = time.perf_counter()
    for r in rows:
        model.predict(r[None, :])
    return (time.perf_counter() - t0) / len(rows) * 1e6
