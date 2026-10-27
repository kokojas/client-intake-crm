import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AppError, IntakeSchema, validateAnalysis, type Analysis, type Workspace } from "../lib/domain";
import { LocalRepository } from "../lib/server/local-repository";
import { prepareRequestBrief } from "../lib/server/service";
import { randomUUID } from "node:crypto";

const input = IntakeSchema.parse({ eventKey: "webhook-request-001", name: "Alex Example", email: "alex@example.com", company: "Example Studio", message: "We need to turn Google Sheets rows into Word proposals for our three-person team. We have not chosen a budget yet." });
const brief: Analysis = { title: "Google Sheets to Word proposals", summary: "Generate Word proposals from Google Sheets for a three-person team.", service: "Document automation", budgetAmount: null, budgetCurrency: null, deadlineText: null, deadlineDate: null, requirements: ["Read data from Google Sheets", "Generate Word documents"], missingInformation: ["Budget", "Document template"], nextTasks: ["Confirm document template", "Clarify budget"], replyDraft: "Hi Alex, could you share your document template and budget?" };
async function withRepository(run: (repository: LocalRepository) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), "intake-test-"));
  const empty = (): Workspace => ({ id: randomUUID(), name: "Test", ownerName: "Test Owner", intakeToken: randomUUID(), clients: [], requests: [], tasks: [], events: [] });
  try { await run(new LocalRepository(path.join(directory, "workspace.json"), empty)); } finally { await rm(directory, { recursive: true, force: true }); }
}

test("concurrent repeated events create one client, one request and one initial task", async () => withRepository(async repository => {
  const results = await Promise.all(Array.from({ length: 10 }, () => repository.receive(input, "form")));
  assert.equal(new Set(results.map(result => result.id)).size, 1);
  assert.equal(results.filter(result => !result.duplicate).length, 1);
  const state = await repository.readWorkspace();
  assert.equal(state.clients.length, 1); assert.equal(state.requests.length, 1); assert.equal(state.tasks.length, 1); assert.equal(state.events.length, 1);
}));
test("an idempotency key cannot silently overwrite a different payload", async () => withRepository(async repository => {
  await repository.receive(input, "manual");
  await assert.rejects(repository.receive({ ...input, message: "An entirely different project request with enough text." }, "manual"), (error: unknown) => error instanceof AppError && error.status === 409);
  assert.equal((await repository.readWorkspace()).requests[0].message, input.message);
}));
test("two distinct requests from the same email reuse the client", async () => withRepository(async repository => {
  await repository.receive(input, "manual"); await repository.receive({ ...input, eventKey: "another-event-002" }, "manual");
  const state = await repository.readWorkspace(); assert.equal(state.clients.length, 1); assert.equal(state.requests.length, 2);
}));
test("a provider failure preserves the source and allows a successful explicit retry", async () => withRepository(async repository => {
  const { id } = await repository.receive(input, "manual");
  await assert.rejects(prepareRequestBrief(repository, id, async () => { throw new Error("Internal provider failure containing private diagnostics"); }));
  let state = await repository.readWorkspace();
  assert.equal(state.requests[0].analysisState, "failed"); assert.equal(state.requests[0].message, input.message);
  assert.equal(state.requests[0].lockToken, null); assert.ok(!JSON.stringify(state).includes("private diagnostics"));
  await prepareRequestBrief(repository, id, async () => ({ analysis: brief, usage: { inputTokens: 100, outputTokens: 80, model: "test-fixture" } }));
  state = await repository.readWorkspace();
  assert.equal(state.requests[0].analysisState, "ready"); assert.equal(state.requests[0].analysis?.budgetAmount, null); assert.equal(state.tasks.length, 3);
}));
test("concurrent AI preparation acquires one lock and cached retries cost no extra call", async () => withRepository(async repository => {
  const { id } = await repository.receive(input, "manual");
  let resolve!: () => void; const release = new Promise<void>(done => { resolve = done; });
  let entered!: () => void; const started = new Promise<void>(done => { entered = done; });
  let calls = 0;
  const provider = async () => { calls++; entered(); await release; return { analysis: brief, usage: { inputTokens: 10, outputTokens: 10, model: "test-fixture" } }; };
  const first = prepareRequestBrief(repository, id, provider); await started;
  await assert.rejects(prepareRequestBrief(repository, id, provider), (error: unknown) => error instanceof AppError && error.status === 409);
  resolve(); await first;
  assert.equal((await prepareRequestBrief(repository, id, provider)).cached, true); assert.equal(calls, 1);
  assert.equal((await repository.readWorkspace()).tasks.length, 3);
}));
test("stale analysis cannot overwrite a newer attempt", async () => withRepository(async repository => {
  const { id } = await repository.receive(input, "manual"); const claim = await repository.claimAnalysis(id);
  await repository.failAnalysis(id, claim.lockToken, "Retryable failure");
  await repository.claimAnalysis(id);
  await assert.rejects(repository.finishAnalysis(id, claim.lockToken, brief, { inputTokens: 1, outputTokens: 1, model: "test" }), (error: unknown) => error instanceof AppError && error.status === 409);
}));
test("stage and task transitions add one history event for repeated identical commands", async () => withRepository(async repository => {
  const { id } = await repository.receive(input, "manual");
  await repository.transition(id, "proposal"); await repository.transition(id, "proposal");
  const task = (await repository.readWorkspace()).tasks[0];
  await repository.toggleTask(task.id, true); await repository.toggleTask(task.id, true);
  const state = await repository.readWorkspace();
  assert.equal(state.events.filter(event => event.title === "Stage changed").length, 1);
  assert.equal(state.events.filter(event => event.title === "Task completed").length, 1);
}));
test("a persisted workspace survives a new repository instance", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "intake-persist-"));
  try { const file = path.join(directory, "state.json"); await new LocalRepository(file).receive(input, "manual"); assert.ok((await new LocalRepository(file).readWorkspace()).requests.some(request => request.message === input.message)); }
  finally { await rm(directory, { recursive: true, force: true }); }
});
test("semantic validation rejects invented currency pairing, negative amounts and malformed dates", () => {
  assert.throws(() => validateAnalysis({ ...brief, budgetAmount: 100, budgetCurrency: null }));
  assert.throws(() => validateAnalysis({ ...brief, budgetAmount: -1, budgetCurrency: "USD" }));
  assert.throws(() => validateAnalysis({ ...brief, deadlineDate: "next week" }));
  assert.throws(() => validateAnalysis({ ...brief, deadlineDate: "2026-02-31" }));
  assert.deepEqual(validateAnalysis(brief), brief);
});
test("invalid extraction never becomes a ready CRM record", async () => withRepository(async repository => {
  const { id } = await repository.receive(input, "manual");
  await assert.rejects(prepareRequestBrief(repository, id, async () => ({ analysis: { ...brief, budgetAmount: -2, budgetCurrency: "USD" }, usage: { model: "fixture", inputTokens: 1, outputTokens: 1 } })));
  const state = await repository.readWorkspace(); assert.equal(state.requests[0].analysisState, "failed"); assert.equal(state.requests[0].analysis, null);
}));
test("input validation rejects oversized messages and untrusted extra properties", () => {
  assert.throws(() => IntakeSchema.parse({ ...input, message: "x".repeat(10001) }));
  assert.throws(() => IntakeSchema.parse({ ...input, ownerId: "another-user" }));
});
test("a disabled OpenAI connection does not consume attempts or create a lock", async () => withRepository(async repository => {
  const oldEnabled = process.env.CRM_ENABLE_OPENAI;
  process.env.CRM_ENABLE_OPENAI = "false";
  try {
    const { id } = await repository.receive(input, "manual");
    await assert.rejects(prepareRequestBrief(repository, id), (error: unknown) => error instanceof AppError && error.status === 503);
    const request = (await repository.readWorkspace()).requests[0];
    assert.equal(request.attempts, 0); assert.equal(request.lockToken, null); assert.equal(request.analysisState, "pending");
  } finally { if (oldEnabled === undefined) delete process.env.CRM_ENABLE_OPENAI; else process.env.CRM_ENABLE_OPENAI = oldEnabled; }
}));
test("an expired processing claim can be recovered", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "intake-recovery-"));
  try {
    const first = new LocalRepository(path.join(directory, "first.json"));
    const { id } = await first.receive(input, "manual"); const state = await first.readWorkspace();
    const request = state.requests.find(request => request.id === id)!;
    request.analysisState = "processing"; request.lockToken = randomUUID(); request.lockUntil = "2020-01-01T00:00:00.000Z";
    const recovered = new LocalRepository(path.join(directory, "recovered.json"), () => state);
    await prepareRequestBrief(recovered, id, async () => ({ analysis: brief, usage: { model: "test", inputTokens: 1, outputTokens: 1 } }));
    assert.equal((await recovered.readWorkspace()).requests.find(request => request.id === id)?.analysisState, "ready");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
