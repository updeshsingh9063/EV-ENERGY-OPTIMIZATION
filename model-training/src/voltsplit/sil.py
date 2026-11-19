"""Software-in-the-loop verification of the exported C controller.

Compiles hess_policy.c with `zig cc` (installed via pip, package `ziglang`), replays the exact
controller inputs logged from the Python closed-loop simulation on held-out cycles, and compares
the C commands with Python's. Also measures inference time and compiled code size.
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

HARNESS = r"""
#include <stdio.h>
#include <time.h>
#include "hess_policy.h"
int main(int argc, char **argv) {
    FILE *in = fopen(argv[1], "r"); FILE *out = fopen(argv[2], "w");
    hess_ctrl_state_t s; hess_ctrl_out_t o; float p, v, ssc, sb; int reset;
    float x[HESS_POLICY_N_FEATURES] = {0}; long i, n = 200000; clock_t t0; volatile float sink = 0;
    hess_ctrl_init(&s);
    while (fscanf(in, "%d %f %f %f %f", &reset, &p, &v, &ssc, &sb) == 5) {
        if (reset) hess_ctrl_init(&s);
        o = hess_ctrl_step(&s, p, v, ssc, sb);
        fprintf(out, "%.6f %u\n", o.p_sc_w, (unsigned)o.flags);
    }
    t0 = clock();
    for (i = 0; i < n; ++i) { x[0] = (float)(i % 50); sink += hess_policy_predict(x); }
    fprintf(stderr, "%.4f\n", (double)(clock() - t0) / CLOCKS_PER_SEC / n * 1e6);
    fclose(in); fclose(out); return sink > 1e30f;
}
"""


def run_sil(c_dir: Path, inputs: list[np.ndarray], expected_w: list[np.ndarray]) -> dict:
    """inputs: per cycle array of (p_req_w, speed, soc_sc, soc_bat); expected_w: Python commands (W)."""
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        (td / "harness.c").write_text(HARNESS)
        exe = td / "harness.exe"
        cmd = [sys.executable, "-m", "ziglang", "cc", "-O2", "-std=c99", "-I", str(c_dir),
               str(td / "harness.c"), str(c_dir / "hess_policy.c"), "-o", str(exe)]
        subprocess.run(cmd, check=True, capture_output=True)
        obj = td / "policy.o"
        subprocess.run([sys.executable, "-m", "ziglang", "cc", "-Os", "-std=c99", "-c", str(c_dir / "hess_policy.c"),
                        "-o", str(obj)], check=True, capture_output=True)
        lines = []
        for arr in inputs:
            for j, row in enumerate(arr):
                lines.append(f"{1 if j == 0 else 0} {row[0]:.6f} {row[1]:.6f} {row[2]:.8f} {row[3]:.8f}")
        (td / "in.txt").write_text("\n".join(lines))
        r = subprocess.run([str(exe), str(td / "in.txt"), str(td / "out.txt")], check=True, capture_output=True, text=True)
        got = np.loadtxt(td / "out.txt")
        us = float(r.stderr.strip())
        size = obj.stat().st_size
    c_w = got[:, 0]
    py_w = np.concatenate(expected_w)
    diff_kw = np.abs(c_w - py_w) / 1000
    return {
        "compiler": "zig cc (clang) -O2, C99",
        "steps_compared": int(len(diff_kw)),
        "max_abs_diff_kw": float(diff_kw.max()),
        "mean_abs_diff_kw": float(diff_kw.mean()),
        "share_within_0p01_kw": float(np.mean(diff_kw <= 0.01)),
        "fallback_activations": int(np.sum(got[:, 1].astype(int) & 1)),
        "us_per_inference": round(us, 3),
        "object_size_kb_Os": round(size / 1024, 1),
        "passed": bool(np.mean(diff_kw <= 0.01) >= 0.999),
    }
