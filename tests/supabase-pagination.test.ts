import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseRepository } from "../lib/server/supabase-repository";

test("cloud workspace reads beyond the 1,000-row API default without losing newest tasks", async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => ({ id: `task-${index}`, workspace_id: "workspace", request_id: "request", title: `Task ${index}`, origin: "manual", completed: false, due_date: null, created_at: "2026-10-26T00:00:00Z" }));
  const requested: [number, number][] = [];
  const client = { from(table: string) {
    const query = { select() { return query; }, eq() { return query; }, order() { return query; },
      async single() { return { data: { id: "workspace", name: "Test", owner_name: "Test", intake_token: "token" }, error: null }; },
      async limit() { return { data: [], error: null }; },
      async range(from: number, to: number) { if (table === "crm_tasks") requested.push([from, to]); return { data: table === "crm_tasks" ? rows.slice(from, to + 1) : [], error: null }; },
    }; return query;
  } } as unknown as SupabaseClient;
  const workspace = await new SupabaseRepository(client, "workspace").readWorkspace();
  assert.equal(workspace.tasks.length, 1001); assert.equal(workspace.tasks.at(-1)?.title, "Task 1000");
  assert.deepEqual(requested, [[0, 499], [500, 999], [1000, 1499]]);
});
