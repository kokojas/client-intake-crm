import test from "node:test";
import assert from "node:assert/strict";
import { APPROVED_AI_BUDGET_MICROS, CALL_RESERVATION_MICROS, configuredBudgetMicros, MAX_AI_REQUEST_BYTES, MAX_VERIFIED_CALL_COST_MICROS, validateBudgetRequest } from "../lib/server/ai-budget";

test("configuration cannot exceed the approved total or accept imprecise monetary input", () => {
  assert.equal(configuredBudgetMicros("11.14"), APPROVED_AI_BUDGET_MICROS);
  assert.equal(configuredBudgetMicros("0.03"), 30_000);
  for (const value of ["11.15", "100", "0", "-1", "NaN", "11.1401", ""]) assert.throws(() => configuredBudgetMicros(value));
});
test("unknown models, oversized inputs and invalid sizes are rejected before reservation", () => {
  validateBudgetRequest("gpt-5-mini", MAX_AI_REQUEST_BYTES);
  for (const size of [-1, NaN, Infinity, 0.5, MAX_AI_REQUEST_BYTES + 1]) assert.throws(() => validateBudgetRequest("gpt-5-mini", size));
  assert.throws(() => validateBudgetRequest("unpriced-model", 1000));
});
test("the conservative reservation covers the bounded standard-tier token cost", () => {
  assert.ok(MAX_VERIFIED_CALL_COST_MICROS <= CALL_RESERVATION_MICROS);
  assert.ok(Math.floor(APPROVED_AI_BUDGET_MICROS / CALL_RESERVATION_MICROS) * CALL_RESERVATION_MICROS <= APPROVED_AI_BUDGET_MICROS);
});
