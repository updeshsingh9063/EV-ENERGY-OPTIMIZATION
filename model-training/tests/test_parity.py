"""The Python physics model must reproduce the TypeScript model used by the web app."""
import json
from pathlib import Path

import numpy as np
import pytest

from voltsplit.physics import battery_only, load_config, power_demand, rule_based, simulate

FX = json.loads((Path(__file__).parent / "fixtures" / "ts_parity.json").read_text())
CFG = load_config("compact_ev")


@pytest.mark.parametrize("cycle", sorted(FX))
@pytest.mark.parametrize("ctrl", ["battery", "rule"])
def test_kpis_match_typescript(cycle, ctrl):
    fx = FX[cycle]
    p = power_demand(np.asarray(fx["speedMs"]), None, CFG["vehicle"])
    assert p.sum() == pytest.approx(fx["pReqSum"], rel=1e-9)
    r = simulate(p, battery_only if ctrl == "battery" else rule_based(), CFG)
    for k, v in fx[ctrl].items():
        assert r.kpis[k] == pytest.approx(v, rel=1e-7, abs=1e-9), k
