import assert from "node:assert/strict";
const base = process.argv[2] || "http://127.0.0.1:3100";
const production = process.argv.includes("--protected");
const origin = new URL(base).origin;
const call = async (pathname, body, method = "POST") => {
  const response = await fetch(new URL(pathname, base), { method, headers: { "Content-Type": "application/json", Origin: origin }, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  return { status: response.status, data: await response.json() };
};
if (production) {
  assert.equal((await call("/api/workspace", undefined, "GET")).status, 401);
  const page = await fetch(new URL("/", base), { redirect: "manual" });
  assert.equal(page.status, 307); assert.ok(page.headers.get("location")?.includes("/login"));
  console.log("PASS: protected build rejects anonymous workspace reads and redirects to sign in.");
} else {
  const intake = { eventKey: "qa-api-duplicate-001", name: "QA API Client", email: "qa-api@example.com", company: "Synthetic test", message: "We need an API integration that creates Word proposals from Google Sheets rows. Budget is not specified." };
  const first = await call("/api/requests", { intake, prepare: false });
  assert.ok([200, 201].includes(first.status));
  const duplicate = await call("/api/requests", { intake, prepare: false });
  assert.equal(duplicate.status, 200); assert.equal(duplicate.data.duplicate, true); assert.equal(first.data.id, duplicate.data.id);
  assert.equal((await call("/api/requests", { intake: { ...intake, message: "A completely different request with the same event identifier." }, prepare: false })).status, 409);
  const before = await call("/api/workspace", undefined, "GET");
  const attemptsBefore = before.data.workspace.requests.find(request => request.id === first.data.id).attempts;
  assert.equal((await call(`/api/requests/${first.data.id}/analyze`)).status, 503);
  const after = await call("/api/workspace", undefined, "GET");
  assert.equal(after.data.workspace.requests.find(request => request.id === first.data.id).attempts, attemptsBefore);
  assert.equal(after.data.workspace.requests.filter(request => request.eventKey === intake.eventKey).length, 1);
  const invalid = await fetch(new URL("/api/tasks", base), { method: "POST", headers: { Origin: "https://another.example", "Content-Type": "application/json" }, body: "{}" });
  assert.equal(invalid.status, 403);
  console.log("PASS: actual HTTP endpoints preserve idempotency, reject conflicting payloads/cross-origin writes, and do not charge retries while OpenAI is disabled.");
}
