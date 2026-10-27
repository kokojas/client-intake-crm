import test from "node:test";
import assert from "node:assert/strict";
import { enforceSameOrigin } from "../lib/server/http";
test("same-origin check accepts the browser host when Next reconstructs a localhost URL", () => {
  assert.doesNotThrow(() => enforceSameOrigin(new Request("http://localhost:3100/api/tasks", { headers: { host: "127.0.0.1:3100", origin: "http://127.0.0.1:3100" } })));
});
test("same-origin check rejects another host, opaque origins and spoofed forwarded hosts", () => {
  for (const origin of ["https://attacker.example", "null"]) assert.throws(() => enforceSameOrigin(new Request("https://crm.example/api/tasks", { headers: { host: "crm.example", origin, "x-forwarded-host": "attacker.example" } })));
});
