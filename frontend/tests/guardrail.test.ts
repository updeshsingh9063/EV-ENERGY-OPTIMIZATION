import assert from "node:assert/strict";
import { test } from "node:test";
import { guardrailC } from "../src/lib/hess/guardrail";
import { DEFAULT_CONFIG } from "../src/lib/hess/model";

test("guardrail header embeds the vehicle's limits", () => {
  const c = guardrailC(DEFAULT_CONFIG, "Test");
  assert.match(c, /#define HESS_BAT_I_MAX_A\s+360\.0f/);
  assert.match(c, /#define HESS_SC_V_MIN_V\s+194\.0f/);
  assert.match(c, /static inline hess_cmd_t hess_guardrail/);
});
