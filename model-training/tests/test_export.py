"""Exported node tables (used by the C and TypeScript controllers) reproduce the trained models."""
import numpy as np
import xgboost as xgb
from sklearn.ensemble import RandomForestRegressor

from voltsplit.export import table_from_model


def _data():
    rng = np.random.default_rng(0)
    X = rng.normal(size=(600, 6)).astype(np.float32)
    y = np.sin(X[:, 0]) * 5 + X[:, 1] * X[:, 2] + rng.normal(scale=0.1, size=600)
    return X, y


def test_xgboost_table_equivalence():
    X, y = _data()
    m = xgb.XGBRegressor(n_estimators=40, max_depth=4).fit(X, y)
    assert np.max(np.abs(table_from_model(m).predict(X) - m.predict(X))) < 1e-4


def test_random_forest_table_equivalence():
    X, y = _data()
    m = RandomForestRegressor(n_estimators=10, max_leaf_nodes=64, random_state=0).fit(X, y)
    assert np.max(np.abs(table_from_model(m).predict(X) - m.predict(X))) < 1e-6
