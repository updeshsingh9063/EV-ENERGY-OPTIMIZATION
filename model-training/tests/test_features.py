"""Features must be causal so the same controller can run online on an ECU."""
import numpy as np

from voltsplit.features import base_features


def test_features_are_causal():
    rng = np.random.default_rng(3)
    p = rng.normal(5000, 8000, 300)
    v = np.abs(rng.normal(10, 5, 300))
    full = base_features(p, v)
    for t in (0, 1, 7, 50, 299):
        prefix = base_features(p[: t + 1], v[: t + 1])
        assert np.allclose(prefix[t], full[t])
