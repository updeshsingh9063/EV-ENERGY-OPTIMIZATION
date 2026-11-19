"""The browser's projected-gradient MPC must agree with the OSQP teacher."""
import numpy as np

from voltsplit.mpc import OsqpMpc, bounds, objective_grad, params_for, solve_pg
from voltsplit.physics import load_config

CFG = load_config()
M = params_for(CFG, a_b=9.0e-4, a_s=3.9e-4, w_s=0.002, c_s=0.0513)


def test_pg_matches_osqp_objective():
    rng = np.random.default_rng(1)
    osqp = OsqpMpc(M)
    gaps = []
    for _ in range(40):
        p_hat = rng.uniform(-30, 70, 10)
        soc, b_prev = rng.uniform(0.05, 1.0), rng.uniform(-20, 40)
        e0 = soc * M.e_use_kj
        u_ref = osqp.solve(p_hat, soc, b_prev)
        u_pg = solve_pg(p_hat, soc, b_prev, M, iters=400)
        f_ref, _ = objective_grad(u_ref, p_hat, e0, b_prev, M)
        f_pg, _ = objective_grad(u_pg, p_hat, e0, b_prev, M)
        gaps.append((f_pg - f_ref) / abs(f_ref))
        lo, hi = bounds(p_hat, M)
        assert np.all(u_pg >= lo - 1e-9) and np.all(u_pg <= hi + 1e-9)
    assert max(gaps) < 0.01  # within 1 % of the optimum (smoothed |u| vs exact)


def test_gradient_matches_finite_differences():
    rng = np.random.default_rng(2)
    u = rng.uniform(-10, 10, 10)
    p_hat, e0, b_prev = rng.uniform(-20, 50, 10), 0.3 * M.e_use_kj, 5.0
    _, g = objective_grad(u, p_hat, e0, b_prev, M)
    for k in range(10):
        d = np.zeros(10); d[k] = 1e-5
        fp, _ = objective_grad(u + d, p_hat, e0, b_prev, M)
        fm, _ = objective_grad(u - d, p_hat, e0, b_prev, M)
        assert abs((fp - fm) / 2e-5 - g[k]) < 1e-4 * max(1, abs(g[k]))
