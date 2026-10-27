import test from "node:test";
import assert from "node:assert/strict";
import { providerErrorMessage } from "../lib/server/openai";
test("exhausted credit is distinguished from a temporary request-rate limit", () => {
  assert.match(providerErrorMessage({ status: 429, code: "credit_balance_exhausted" }), /credit balance is exhausted/);
  assert.match(providerErrorMessage({ status: 429, code: "rate_limit_exceeded" }), /temporarily rate-limited/);
});
test("spend-limit failures do not tell a user that waiting alone will restore access", () => {
  for (const code of ["project_spend_limit_exceeded", "organization_spend_limit_exceeded", "organization_usage_limit_exceeded"]) assert.match(providerErrorMessage({ status: 429, code }), /check that account's API limits/);
});
