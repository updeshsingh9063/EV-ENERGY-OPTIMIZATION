"""Publishes trained artifacts to Supabase: Storage (models/exports buckets), the `models`
registry table and the dataset drive cycles. Uses the SECRET key and DATABASE_URL from
backend/.env (server-side only)."""
from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
import psycopg
import requests

ENV_FILE = Path(__file__).resolve().parents[3] / "backend" / ".env"


def load_env() -> dict:
    env = dict(os.environ)
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                env.setdefault(k.strip(), v.strip())
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_SECRET_KEY", "DATABASE_URL") if not env.get(k)]
    if missing:
        raise RuntimeError(f"Missing {missing}; set them in backend/.env")
    return env


def upload(env: dict, bucket: str, path: str, data: bytes, content_type: str) -> str:
    key = env["SUPABASE_SECRET_KEY"]
    r = requests.post(
        f"{env['SUPABASE_URL']}/storage/v1/object/{bucket}/{path}",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "x-upsert": "true", "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if r.status_code >= 300:
        raise RuntimeError(f"upload {bucket}/{path} failed: {r.status_code} {r.text[:200]}")
    return f"{bucket}/{path}"


def next_version(conn, kind: str) -> str:
    n = conn.execute("select count(*) from public.models where kind = %s", (kind,)).fetchone()[0]
    return f"v1.{n}.0"


def active_policy_metrics(conn) -> dict | None:
    row = conn.execute("select metrics from public.models where kind = 'policy' and status = 'active'").fetchone()
    return row[0] if row else None


def should_promote(new: dict, old: dict | None) -> tuple[bool, str]:
    """Monitoring gate: promote only if the new policy is SIL-equivalent, violation-free and not worse
    than the active one on the held-out cycles (energy vs rule-based and battery stress)."""
    n = new["test_avg"]["distilled_ml"]
    if not new["sil"]["passed"]:
        return False, "C/Python equivalence (SIL) failed"
    if n["violations"] > 0:
        return False, "constraint violations on held-out cycles"
    if old is None:
        return True, "first model"
    o = old["test_avg"]["distilled_ml"]
    if n["energy_vs_rule_based_pct"] > o["energy_vs_rule_based_pct"] + 0.1:
        return False, "energy worse than active model"
    if n["stress_vs_battery_only_pct"] > o["stress_vs_battery_only_pct"] + 0.5:
        return False, "battery stress worse than active model"
    return True, "not worse than active model"


def register_model(conn, kind: str, version: str, metrics: dict, artifact_path: str, notes: str, promote: bool = True) -> None:
    if promote:
        conn.execute("update public.models set status = 'archived' where kind = %s and status = 'active'", (kind,))
    conn.execute(
        """insert into public.models (kind, version, status, metrics, artifact_path, notes)
           values (%s, %s, %s, %s::jsonb, %s, %s)""",
        (kind, version, "active" if promote else "candidate", json.dumps(metrics), artifact_path, notes),
    )


def upsert_dataset_cycle(conn, cid: str, name: str, desc: str, speed: np.ndarray, grade: np.ndarray) -> None:
    g = None if not np.any(grade) else [round(float(x), 5) for x in grade]
    conn.execute(
        """insert into public.drive_cycles (id, owner_id, name, description, source, speed_ms, grade)
           values (%s, null, %s, %s, 'dataset', %s, %s)
           on conflict (id) do update set name = excluded.name, description = excluded.description,
             speed_ms = excluded.speed_ms, grade = excluded.grade""",
        (cid, name, desc, [round(float(x), 4) for x in speed], g),
    )


def connect(env: dict, attempts: int = 5):
    """Connect with retries (laptops sleeping / Wi-Fi reconnecting caused transient DNS failures)."""
    import time

    for i in range(attempts):
        try:
            return psycopg.connect(env["DATABASE_URL"], autocommit=False, connect_timeout=15)
        except psycopg.OperationalError:
            if i == attempts - 1:
                raise
            time.sleep(5 * (i + 1))
