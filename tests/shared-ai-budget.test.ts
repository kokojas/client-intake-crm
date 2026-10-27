import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SharedAiBudget, aiBudget } from "../lib/server/shared-ai-budget";

test("unverified models and input sizes cannot reach the shared reservation endpoint", async () => {
  let calls = 0;
  const client = { rpc: async () => { calls++; return { data: null, error: null }; } } as unknown as SupabaseClient;
  const meter = new SharedAiBudget(client, "test-only-token", 60_000);
  await assert.rejects(meter.reserve("unpriced-model", 1000));
  await assert.rejects(meter.reserve("gpt-5-mini", 64_001));
  assert.equal(calls, 0);
});
test("shared meter failures do not expose transport diagnostics or fall back to a new local allowance", async () => {
  const client = { rpc: async () => { throw new Error("private diagnostics"); } } as unknown as SupabaseClient;
  await assert.rejects(new SharedAiBudget(client, "test-only-token", 60_000).reserve("gpt-5-mini", 1000), error => error instanceof Error && !error.message.includes("private diagnostics"));
  const previous = process.env.CRM_AI_METER_TOKEN;
  delete process.env.CRM_AI_METER_TOKEN;
  try { assert.throws(() => aiBudget()); } finally { if (previous !== undefined) process.env.CRM_AI_METER_TOKEN = previous; }
});
test("a missing reservation receipt stops the caller before model execution", async () => {
  const client = { rpc: async () => ({ data: null, error: null }) } as unknown as SupabaseClient;
  await assert.rejects(new SharedAiBudget(client, "test-only-token", 60_000).reserve("gpt-5-mini", 1000));
});
