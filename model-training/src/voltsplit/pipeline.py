"""End-to-end ML lifecycle for problem statement #96.

    python -m voltsplit.pipeline            # train, evaluate, export (no upload)
    python -m voltsplit.pipeline --publish  # …and publish to Supabase

Splits (never mixed):
  train      UDDS, HWFET, synthetic urban + highway, and augmentations of each
  validation synthetic aggressive        (policy model selection)
  test       US06, WLTC class 3b        (all reported results)
"""
from __future__ import annotations

import argparse
import json
import pickle
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import xgboost as xgb

from . import data
from .export import table_from_model, write_c, write_ts
from .features import H, POLICY_FEATURES, FORECAST_FEATURES, base_features
from .models import (
    SEED, fit_policies, model_nodes, mpc_controller, policy_controller, time_inference,
    train_forecaster, train_surrogates, tune_stress_weight,
)
from .mpc import OsqpMpc, params_for
from .physics import battery_only, load_config, power_demand, rule_based, simulate
from .sil import run_sil

ROOT = Path(__file__).resolve().parents[2]
FRONTEND_GEN = ROOT.parent / "frontend" / "src" / "lib" / "hess" / "generated"
REPORTS = ROOT / "reports"
MODELS_DIR = ROOT / "models"
EXPORTS = ROOT / "exports"


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def rel(a: float, b: float) -> float:
    return (a / b - 1) * 100 if b else 0.0


CHECKPOINT = MODELS_DIR / "checkpoint.pkl"
CTX_KEYS = ("rng", "cfg", "cyc", "nasa", "train", "test", "forecaster", "f_metrics", "s_metrics", "m", "sweep",
            "X", "policy", "best", "sel", "evaluation", "imitation", "sil_inputs", "sil_expected", "t_start")


def train_all() -> dict:
    """Stages 1 to 5: data, models, MPC, distillation, held-out evaluation. Result is checkpointed."""
    t_start = time.perf_counter()
    rng = np.random.default_rng(SEED)
    cfg = load_config("compact_ev")
    veh = cfg["vehicle"]

    # ---------------------------------------------------------------- 1. data
    log("1/7 data acquisition")
    data.download_cycles()
    cyc = {k: data.load_cycle(k) for k in data.DATASET_CYCLES}
    nasa = data.nasa_resistance_table()

    def mk(v, g=None):
        g = np.zeros_like(v) if g is None else g
        return power_demand(v, g, veh), v, g

    train_speeds = [cyc["udds"][0], cyc["hwfet"][0], data.load_synthetic("syn-urban"), data.load_synthetic("syn-highway")]
    aug = []
    for s, n in zip(train_speeds, (6, 5, 3, 3)):
        aug += data.augment(s, rng, n)
    train = [mk(cyc["udds"][0], cyc["udds"][1]), mk(cyc["hwfet"][0], cyc["hwfet"][1])] + [mk(s) for s in train_speeds[2:]] + [mk(s) for s in aug]
    val = [mk(data.load_synthetic("syn-aggressive"))]
    test = {k: mk(*cyc[k]) for k in data.TEST_CYCLES}
    log(f"   train {len(train)} cycles / {sum(len(c[0]) for c in train)} s, val 1, test {list(test)}; NASA impedance tests {len(nasa)}")

    # ---------------------------------------------------------------- 2 and 3. predictive models
    log("2/7 demand forecaster")
    forecaster, f_metrics = train_forecaster(train, list(test.values()))
    log(f"   MAE {f_metrics['mae_kw']:.2f} kW (persistence {f_metrics['baseline_persistence_mae_kw']:.2f}, GP {f_metrics['baseline_gp_mae_kw']:.2f})")

    log("3/7 loss surrogates (Gaussian Process)")
    s_metrics, _, a_b, a_s, c_s = train_surrogates(cfg, nasa)
    log(f"   R² battery {s_metrics['loss-bat']['r2']:.4f}, supercap {s_metrics['loss-sc']['r2']:.4f}; a_b={a_b:.2e} a_s={a_s:.2e} c_s={c_s:.3f}")

    # ---------------------------------------------------------------- 4. MPC
    log("4/7 MPC weight tuning on training cycles (vs rule-based baseline)")
    m0 = params_for(cfg, a_b, a_s, 0.0, c_s)
    tune_set = train[:2] + val  # UDDS, HWFET, synthetic aggressive, never the test cycles
    base_k = [simulate(p, battery_only, cfg).kpis for p, _, _ in tune_set]
    rule_k = [simulate(p, rule_based(), cfg).kpis for p, _, _ in tune_set]
    w_s, sweep = tune_stress_weight(cfg, m0, tune_set, base_k, rule_k)
    m = params_for(cfg, a_b, a_s, w_s, c_s)
    log(f"   chosen w_s = {w_s}")

    log("5/7 MPC teacher rollouts + policy distillation (with one DAgger round)")
    X, y = [], []
    for p, v, g in train:
        rec: list = []
        simulate(p, mpc_controller(m, forecaster, base_features(p, v, g), rec), cfg)
        X += [r[0] for r in rec]
        y += [r[1] for r in rec]
    X, y = np.asarray(X, np.float32), np.asarray(y)
    policies = fit_policies(X, y)
    teacher = OsqpMpc(m)
    for p, v, g in train:  # DAgger: label the states the student actually visits
        rec = []
        simulate(p, policy_controller(policies["xgboost"], m, base_features(p, v, g), rec, teacher, forecaster), cfg)
        X = np.vstack([X, np.asarray([r[0] for r in rec], np.float32)])
        y = np.concatenate([y, [r[1] for r in rec]])
    policies = fit_policies(X, y)
    log(f"   distillation set {len(X)} samples")

    # model selection on validation (closed loop)
    pv, vv, gv = val[0]
    bk = simulate(pv, battery_only, cfg).kpis
    sel = {}
    for name, mdl in policies.items():
        k = simulate(pv, policy_controller(mdl, m, base_features(pv, vv, gv)), cfg).kpis
        sel[name] = {"stress_vs_battery_only_pct": rel(k["dodStress"], bk["dodStress"]),
                     "energy_vs_battery_only_pct": rel(k["energyTotalKwh"], bk["energyTotalKwh"]),
                     "violations": k["constraintViolations"]}
    score = lambda r: r["stress_vs_battery_only_pct"] + 10 * r["energy_vs_battery_only_pct"] + 100 * r["violations"]
    best = min(sel, key=lambda n: score(sel[n]))
    policy = policies[best]
    log(f"   selected {best}: {sel}")

    # ---------------------------------------------------------------- 5. validation on held-out cycles
    log("6/7 closed-loop evaluation on held-out cycles")
    evaluation: dict = {}
    imitation = []
    sil_inputs, sil_expected = [], []
    for name, (p, v, g) in test.items():
        X0 = base_features(p, v, g)
        res = {
            "battery_only": simulate(p, battery_only, cfg),
            "rule_based": simulate(p, rule_based(), cfg),
            "mpc_oracle": simulate(p, mpc_controller(m, None, X0), cfg),
            "mpc_forecast": simulate(p, mpc_controller(m, forecaster, X0), cfg),
        }
        rec: list = []
        res["distilled_ml"] = simulate(p, policy_controller(policy, m, X0, rec, teacher, forecaster), cfg, record_states=True)
        imitation += [abs(float(policy.predict(r[0][None, :].astype(np.float32))[0]) - r[1]) for r in rec]
        st = res["distilled_ml"].states
        sil_inputs.append(np.column_stack([p, v, [s.soc_sc for s in st], [s.soc_bat for s in st]]))
        sil_expected.append(res["distilled_ml"].p_sc)
        b0, r0 = res["battery_only"].kpis, res["rule_based"].kpis
        evaluation[name] = {
            ctrl: {**r.kpis,
                   "energy_vs_battery_only_pct": rel(r.kpis["energyTotalKwh"], b0["energyTotalKwh"]),
                   "energy_vs_rule_based_pct": rel(r.kpis["energyTotalKwh"], r0["energyTotalKwh"]),
                   "peak_c_vs_battery_only_pct": rel(r.kpis["peakCRate"], b0["peakCRate"]),
                   "stress_vs_battery_only_pct": rel(r.kpis["dodStress"], b0["dodStress"]),
                   "rms_vs_battery_only_pct": rel(r.kpis["rmsCurrentA"], b0["rmsCurrentA"])}
            for ctrl, r in res.items()
        }
        e = evaluation[name]
        for ctrl in ("rule_based", "mpc_oracle", "mpc_forecast", "distilled_ml"):
            log(f"   {name:8s} {ctrl:13s} E vs rule {e[ctrl]['energy_vs_rule_based_pct']:+6.2f}%  E vs batt {e[ctrl]['energy_vs_battery_only_pct']:+6.2f}%  "
                f"peakC {e[ctrl]['peak_c_vs_battery_only_pct']:+6.1f}%  stress {e[ctrl]['stress_vs_battery_only_pct']:+6.1f}%  viol {e[ctrl]['constraintViolations']}")

    scope = locals()
    ctx = {k: scope[k] for k in CTX_KEYS}
    MODELS_DIR.mkdir(exist_ok=True)
    with open(CHECKPOINT, "wb") as f:
        pickle.dump(ctx, f)
    log(f"   checkpoint saved → {CHECKPOINT.name}")
    return ctx


def main(publish: bool = False, resume: bool = False) -> dict:
    if resume and CHECKPOINT.exists():
        log(f"resuming from {CHECKPOINT.name} (training stages skipped)")
        with open(CHECKPOINT, "rb") as f:
            ctx = pickle.load(f)
    else:
        ctx = train_all()
    (rng, cfg, cyc, nasa, train, test, forecaster, f_metrics, s_metrics, m, sweep,
     X, policy, best, sel, evaluation, imitation, sil_inputs, sil_expected, t_start) = (ctx[k] for k in CTX_KEYS)

    def avg(ctrl, key):
        return float(np.mean([evaluation[c][ctrl][key] for c in evaluation]))

    # ---------------------------------------------------------------- 6. export
    log("7/7 export (C99 + TypeScript) and SIL verification")
    version = "local"
    table = table_from_model(policy)
    probe = X[rng.choice(len(X), 3000, replace=False)]
    table_err = float(np.max(np.abs(table.predict(probe) - policy.predict(probe))))
    f_table = table_from_model(forecaster.booster)
    f_probe = np.column_stack([np.repeat(probe[:300, :12], 1, 0), np.zeros(300), np.full(300, 3)]).astype(np.float32)
    f_table_err = float(np.max(np.abs(f_table.predict(f_probe) - forecaster.booster.predict(f_probe))))

    env = conn = None
    if publish:
        from . import publish as pub
        env = pub.load_env()
        conn = pub.connect(env)
        version = pub.next_version(conn, "policy")

    c_dir = EXPORTS / "c"
    limits = {"u_abs_max": m.u_abs_max, "b_abs_max": m.b_abs_max}
    c_sizes = write_c(table, limits, version, c_dir)
    sil = run_sil(c_dir, sil_inputs, sil_expected)
    log(f"   SIL: max |Δ| {sil['max_abs_diff_kw']:.4f} kW, {sil['us_per_inference']} µs/inference, passed={sil['passed']}")

    policy_metrics = {
        "algorithm": f"{'XGBoost' if best == 'xgboost' else 'Random Forest'} distilled from forecast-MPC (+1 DAgger round)",
        "selected_by": "closed-loop validation on synthetic aggressive cycle",
        "candidates": sel,
        "features": POLICY_FEATURES,
        "imitation_mae_kw": float(np.mean(imitation)),
        "n_trees": int(len(table.roots)),
        "n_nodes": table.n_nodes,
        "python_us_per_inference": round(time_inference(policy, X), 1),
        "table_export_max_err_kw": table_err,
        "sil": sil,
        "c_source_bytes": c_sizes,
        "test_avg": {
            ctrl: {
                "energy_vs_battery_only_pct": avg(ctrl, "energy_vs_battery_only_pct"),
                "energy_vs_rule_based_pct": avg(ctrl, "energy_vs_rule_based_pct"),
                "peak_c_vs_battery_only_pct": avg(ctrl, "peak_c_vs_battery_only_pct"),
                "stress_vs_battery_only_pct": avg(ctrl, "stress_vs_battery_only_pct"),
                "rms_vs_battery_only_pct": avg(ctrl, "rms_vs_battery_only_pct"),
                "violations": int(sum(evaluation[c][ctrl]["constraintViolations"] for c in evaluation)),
            }
            for ctrl in ("rule_based", "mpc_oracle", "mpc_forecast", "distilled_ml")
        },
        "mpc": {**m.to_json(), "weight_sweep": sweep},
    }
    f_metrics["table_export_max_err_kw"] = f_table_err

    # TypeScript modules for the web app
    meta = {"version": version, "trainedAt": datetime.now(timezone.utc).isoformat()}
    FRONTEND_GEN.mkdir(parents=True, exist_ok=True)
    ts_sizes = {
        "policy.ts": write_ts(FRONTEND_GEN / "policy.ts", "POLICY", {**meta, "features": POLICY_FEATURES, "table": table.to_json()},
                              "Distilled power-split policy (tree ensemble)."),
        "forecaster.ts": write_ts(FRONTEND_GEN / "forecaster.ts", "FORECASTER", {**meta, "features": FORECAST_FEATURES, "horizon": H,
                                  "table": f_table.to_json()}, "Short-horizon demand forecaster (tree ensemble)."),
        "mpc.ts": write_ts(FRONTEND_GEN / "mpc.ts", "MPC_PARAMS", {**meta, **m.to_json()}, "MPC weights and loss-surrogate coefficients."),
    }
    policy_metrics["ts_module_bytes"] = ts_sizes

    MODELS_DIR.mkdir(exist_ok=True)
    forecaster.booster.get_booster().save_model(MODELS_DIR / "forecaster.json")
    (MODELS_DIR / "policy_table.json").write_text(json.dumps(table.to_json()), encoding="utf-8")
    REPORTS.mkdir(exist_ok=True)
    report = {
        "version": version, "generated_at": meta["trainedAt"], "runtime_s": round(time.perf_counter() - t_start, 1),
        "data": {"train_cycles": len(train), "train_seconds": int(sum(len(c[0]) for c in train)),
                 "test_cycles": list(test), "nasa_impedance_tests": int(len(nasa)),
                 "community_cycles": "github.com/PathfinderAV/driving-cycles → HTTP 404 (unavailable)"},
        "forecaster": f_metrics, "surrogates": s_metrics, "policy": policy_metrics, "evaluation": evaluation,
    }
    (REPORTS / "evaluation.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (EXPORTS / "equivalence_report.json").write_text(json.dumps({"version": version, **sil, "table_export_max_err_kw": table_err}, indent=2), encoding="utf-8")

    # ---------------------------------------------------------------- 7. publish
    if publish:
        from . import publish as pub
        log("publishing to Supabase")
        for key, (title, desc) in data.DATASET_CYCLES.items():
            v, g = cyc[key]
            split = "test (held out)" if key in data.TEST_CYCLES else "train"
            pub.upsert_dataset_cycle(conn, f"ds-{key}", title, f"{desc} · FASTSim · {split}", v, g)
        files = {
            ("exports", f"{version}/hess_policy.c"): ((c_dir / "hess_policy.c").read_bytes(), "text/plain"),
            ("exports", f"{version}/hess_policy.h"): ((c_dir / "hess_policy.h").read_bytes(), "text/plain"),
            ("exports", f"{version}/hess_policy.ts"): ((FRONTEND_GEN / "policy.ts").read_bytes(), "text/plain"),
            ("exports", f"{version}/equivalence_report.json"): ((EXPORTS / "equivalence_report.json").read_bytes(), "application/json"),
            ("models", f"{version}/policy_table.json"): ((MODELS_DIR / "policy_table.json").read_bytes(), "application/json"),
            ("models", f"{version}/forecaster.json"): ((MODELS_DIR / "forecaster.json").read_bytes(), "application/json"),
            ("models", f"{version}/evaluation.json"): ((REPORTS / "evaluation.json").read_bytes(), "application/json"),
        }
        for (bucket, path), (blob, ct) in files.items():
            pub.upload(env, bucket, path, blob, ct)
        promote, why = pub.should_promote(policy_metrics, pub.active_policy_metrics(conn))
        policy_metrics["promotion"] = {"promoted": promote, "reason": why}
        pub.register_model(conn, "forecaster", version, f_metrics, f"models/{version}/forecaster.json", "XGBoost multi-horizon", promote)
        pub.register_model(conn, "loss-bat", version, s_metrics["loss-bat"], f"models/{version}/evaluation.json", "GP surrogate", promote)
        pub.register_model(conn, "loss-sc", version, s_metrics["loss-sc"], f"models/{version}/evaluation.json", "GP surrogate", promote)
        pub.register_model(conn, "policy", version, policy_metrics, f"exports/{version}/hess_policy.c", policy_metrics["algorithm"], promote)
        conn.commit()
        conn.close()
        log(f"published {version}: {'promoted to active' if promote else 'kept as candidate'} ({why})")
    log(f"done in {time.perf_counter() - t_start:.0f}s")
    return report


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--publish", action="store_true")
    ap.add_argument("--resume", action="store_true", help="reuse models/checkpoint.pkl and only export/publish")
    a = ap.parse_args()
    main(a.publish, a.resume)
