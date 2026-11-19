# model-training: Python ML pipeline

Implements the problem statement's full ML lifecycle. Results and design: [docs/04-ml-pipeline.md](../docs/04-ml-pipeline.md).

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt     # macOS/Linux: .venv/bin/pip
.venv/Scripts/python -m pytest                    # 11 tests: physics parity, MPC, exporter, causality
cd src
../.venv/Scripts/python -m voltsplit.pipeline             # train + evaluate + export locally
../.venv/Scripts/python -m voltsplit.pipeline --publish   # …and publish to Supabase (needs backend/.env)
```

| Module | Stage |
|---|---|
| `voltsplit/data.py` | 1. Data acquisition: FASTSim cycles, NASA PCoE impedance data, augmentation |
| `voltsplit/features.py` | 2. Causal feature engineering (shared by forecaster and policy) |
| `voltsplit/physics.py` | Vehicle + battery + supercap model (exact port of the app's TypeScript model) |
| `voltsplit/models.py` | 3. Forecaster (XGBoost vs GP vs persistence), GP loss surrogates; 4. MPC rollouts, distillation, DAgger |
| `voltsplit/mpc.py` | MPC QP: OSQP teacher + projected-gradient twin used in the browser |
| `voltsplit/export.py` | 6. C99 ECU controller + TypeScript model modules |
| `voltsplit/sil.py` | Software-in-the-loop check of the compiled C (zig cc) against Python |
| `voltsplit/publish.py` | Upload to Supabase Storage, register models, promotion gate |
| `voltsplit/pipeline.py` | Orchestrates everything; writes `reports/evaluation.json` |

**Outputs:**

| Path | Contents |
|---|---|
| `reports/evaluation.json` | All metrics |
| `exports/c/` | ECU controller |
| `exports/equivalence_report.json` | SIL results |
| `models/` | Model artifacts |
| `../frontend/src/lib/hess/generated/*.ts` | Models used by the web app |
