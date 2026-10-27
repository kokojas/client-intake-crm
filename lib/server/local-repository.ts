import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError, type Analysis, type Intake, type Stage, type Workspace } from "../domain";
import { createSampleWorkspace } from "../seed";
import type { Repository, Usage } from "./repository";

const queues = new Map<string, Promise<unknown>>();

/** Single-process, atomic-file development store. Production always uses Postgres. */
export class LocalRepository implements Repository {
  constructor(private filename = path.join(process.cwd(), ".data", "workspace.json"), private initial = createSampleWorkspace) {}

  private async transaction<T>(operation: (workspace: Workspace) => T): Promise<T> {
    const previous = queues.get(this.filename) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(async () => {
      await mkdir(path.dirname(this.filename), { recursive: true });
      let workspace: Workspace;
      try { workspace = JSON.parse(await readFile(this.filename, "utf8")); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; workspace = this.initial(); }
      const result = operation(workspace);
      const temporary = `${this.filename}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(workspace, null, 2), { mode: 0o600 });
      await rename(temporary, this.filename);
      return result;
    });
    queues.set(this.filename, pending);
    try { return await pending; } finally { if (queues.get(this.filename) === pending) queues.delete(this.filename); }
  }
  readWorkspace() { return this.transaction(workspace => structuredClone(workspace)); }

  receive(input: Intake, source: "manual" | "form") {
    return this.transaction(workspace => {
      const hash = createHash("sha256").update(JSON.stringify({ name: input.name, email: input.email, company: input.company, message: input.message })).digest("hex");
      const previous = workspace.requests.find(request => request.eventKey === input.eventKey);
      if (previous) {
        if (previous.contentHash !== hash) throw new AppError(409, "This submission ID was already used for different content. Start a new request.");
        return { id: previous.id, duplicate: true };
      }
      if (source === "form" && workspace.requests.filter(request => request.source === "form" && Date.parse(request.createdAt) > Date.now() - 3600000).length >= 20)
        throw new AppError(429, "This inbox has reached its hourly limit. Please try again later.");
      let client = workspace.clients.find(client => client.email === input.email);
      if (!client) { client = { id: randomUUID(), name: input.name, email: input.email, company: input.company }; workspace.clients.push(client); }
      const id = randomUUID(), now = new Date().toISOString();
      workspace.requests.unshift({ id, clientId: client.id, eventKey: input.eventKey, contentHash: hash, title: "New automation request", message: input.message, source, stage: "new", analysisState: "pending", analysis: null, analysisError: null, attempts: 0, lockToken: null, lockUntil: null, createdAt: now, updatedAt: now, usage: null });
      workspace.tasks.push({ id: randomUUID(), requestId: id, title: "Review the new request", completed: false, origin: "manual", dueDate: null, createdAt: now });
      workspace.events.unshift({ id: randomUUID(), requestId: id, title: "Request received", detail: source === "form" ? "Received through the intake form." : "Added in the workspace.", createdAt: now });
      return { id, duplicate: false };
    });
  }
  transition(id: string, stage: Stage) {
    return this.transaction(workspace => {
      const request = this.request(workspace, id);
      if (request.stage === stage) return;
      const previous = request.stage; request.stage = stage; request.updatedAt = new Date().toISOString();
      workspace.events.unshift({ id: randomUUID(), requestId: id, title: "Stage changed", detail: `${previous} → ${stage}`, createdAt: request.updatedAt });
    });
  }
  claimAnalysis(id: string) {
    return this.transaction(workspace => {
      const request = this.request(workspace, id);
      if (request.analysisState === "ready") return { lockToken: "", cached: true };
      if (request.lockUntil && Date.parse(request.lockUntil) > Date.now()) throw new AppError(409, "This request is already being processed.");
      if (request.attempts >= 5) throw new AppError(429, "This request has reached its analysis attempt limit.");
      if (workspace.events.filter(event => event.title === "AI preparation started" && Date.parse(event.createdAt) > Date.now() - 86400000).length >= 30) throw new AppError(429, "Daily AI preparation limit reached.");
      request.analysisState = "processing"; request.lockToken = randomUUID(); request.lockUntil = new Date(Date.now() + 90000).toISOString(); request.attempts++; request.analysisError = null;
      workspace.events.unshift({ id: randomUUID(), requestId: id, title: "AI preparation started", detail: "The source message is preserved while the brief is prepared.", createdAt: new Date().toISOString() });
      return { lockToken: request.lockToken, cached: false };
    });
  }
  finishAnalysis(id: string, lockToken: string, analysis: Analysis, usage: Usage) {
    return this.transaction(workspace => {
      const request = this.request(workspace, id);
      if (request.lockToken !== lockToken) throw new AppError(409, "The analysis lock expired. Refresh and try again.");
      Object.assign(request, { title: analysis.title, analysis, usage, analysisState: "ready", analysisError: null, lockToken: null, lockUntil: null, updatedAt: new Date().toISOString() });
      const tasks = [...new Set(analysis.nextTasks)].slice(0, 6);
      for (const title of tasks) if (!workspace.tasks.some(task => task.requestId === id && task.title === title)) workspace.tasks.push({ id: randomUUID(), requestId: id, title, completed: false, origin: "ai", dueDate: null, createdAt: request.updatedAt });
      workspace.events.unshift({ id: randomUUID(), requestId: id, title: "AI brief prepared", detail: `${usage.model} · ${usage.inputTokens + usage.outputTokens} tokens. Review the brief against the original message.`, createdAt: request.updatedAt });
    });
  }
  failAnalysis(id: string, lockToken: string, message: string) {
    return this.transaction(workspace => {
      const request = this.request(workspace, id);
      if (request.lockToken !== lockToken) return;
      Object.assign(request, { analysisState: "failed", analysisError: message, lockToken: null, lockUntil: null, updatedAt: new Date().toISOString() });
      workspace.events.unshift({ id: randomUUID(), requestId: id, title: "AI preparation failed", detail: message, createdAt: request.updatedAt });
    });
  }
  toggleTask(id: string, completed: boolean) {
    return this.transaction(workspace => {
      const task = workspace.tasks.find(task => task.id === id);
      if (!task) throw new AppError(404, "Task not found.");
      if (task.completed === completed) return;
      task.completed = completed;
      workspace.events.unshift({ id: randomUUID(), requestId: task.requestId, title: completed ? "Task completed" : "Task reopened", detail: task.title, createdAt: new Date().toISOString() });
    });
  }
  addTask(requestId: string, title: string, dueDate: string | null) {
    return this.transaction(workspace => {
      this.request(workspace, requestId);
      const now = new Date().toISOString();
      if (workspace.tasks.some(task => task.requestId === requestId && task.title === title)) return;
      workspace.tasks.push({ id: randomUUID(), requestId, title, completed: false, origin: "manual", dueDate, createdAt: now });
      workspace.events.unshift({ id: randomUUID(), requestId, title: "Task added", detail: title, createdAt: now });
    });
  }
  private request(workspace: Workspace, id: string) { const request = workspace.requests.find(request => request.id === id); if (!request) throw new AppError(404, "Request not found."); return request; }
}
