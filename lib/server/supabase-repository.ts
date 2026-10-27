import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, type Analysis, type Intake, type Stage, type Workspace } from "../domain";
import type { Repository, Usage } from "./repository";

function databaseError(error: { message: string; code?: string } | null) {
  if (!error) return;
  const status = error.message.includes("already being processed") || error.message.includes("different content") || error.message.includes("lock expired") ? 409 : error.message.includes("limit") ? 429 : error.message.includes("not found") ? 404 : error.code === "42501" ? 403 : 500;
  throw new AppError(status, status === 500 ? "The database operation failed. Your existing records are unchanged." : error.message);
}

/** The session-bound client uses the owner's JWT. No service-role key is needed. */
export class SupabaseRepository implements Repository {
  constructor(private client: SupabaseClient, private workspaceId: string) {}
  private async readAllRows(table: string, order: string, ascending = true) {
    const rows: Record<string, unknown>[] = [], pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      let query = this.client.from(table).select("*").eq("workspace_id", this.workspaceId).order(order, { ascending });
      if (order !== "id") query = query.order("id");
      const page = await query.range(offset, offset + pageSize - 1);
      databaseError(page.error);
      rows.push(...(page.data ?? []));
      if ((page.data?.length ?? 0) < pageSize) return rows;
    }
  }
  async readWorkspace(): Promise<Workspace> {
    const results = await Promise.all([
      this.client.from("crm_workspaces").select("*").eq("id", this.workspaceId).single(),
      this.readAllRows("crm_clients", "id"),
      this.readAllRows("crm_requests", "created_at", false),
      this.readAllRows("crm_tasks", "created_at"),
      this.client.from("crm_events").select("*").eq("workspace_id", this.workspaceId).order("created_at", { ascending: false }).limit(500),
    ]);
    const workspaceResult = results[0], eventsResult = results[4];
    databaseError(workspaceResult.error); databaseError(eventsResult.error);
    const workspace = workspaceResult.data as Record<string, string>;
    const [clients, requests, tasks] = results.slice(1, 4) as Record<string, unknown>[][];
    const events = (eventsResult.data ?? []) as Record<string, unknown>[];
    return {
      id: workspace.id, name: workspace.name, ownerName: workspace.owner_name, intakeToken: workspace.intake_token,
      clients: clients.map(row => ({ id: String(row.id), name: String(row.name), email: String(row.email), company: String(row.company ?? "") })),
      requests: requests.map(row => ({ id: String(row.id), clientId: String(row.client_id), eventKey: String(row.event_key), contentHash: String(row.content_hash), title: String(row.title), message: String(row.message), source: row.source as "manual" | "form", stage: row.stage as Stage, analysisState: row.analysis_state as "pending" | "processing" | "ready" | "failed", analysis: row.analysis as Analysis | null, analysisError: row.analysis_error as string | null, attempts: Number(row.attempts), lockToken: row.lock_token as string | null, lockUntil: row.lock_until as string | null, createdAt: String(row.created_at), updatedAt: String(row.updated_at), usage: row.usage as Usage | null })),
      tasks: tasks.map(row => ({ id: String(row.id), requestId: String(row.request_id), title: String(row.title), completed: Boolean(row.completed), origin: row.origin as "manual" | "ai", dueDate: row.due_date as string | null, createdAt: String(row.created_at) })),
      events: events.map(row => ({ id: String(row.id), requestId: String(row.request_id), title: String(row.title), detail: String(row.detail), createdAt: String(row.created_at) })),
    };
  }
  private async rpc(name: string, params: Record<string, unknown>) {
    const result = await this.client.rpc(name, { p_workspace_id: this.workspaceId, ...params });
    databaseError(result.error); return result.data;
  }
  async receive(input: Intake, source: "manual" | "form") {
    const result = await this.rpc("crm_receive_owner_request", { p_event_key: input.eventKey, p_name: input.name, p_email: input.email, p_company: input.company, p_message: input.message, p_source: source });
    return result as { id: string; duplicate: boolean };
  }
  async transition(id: string, stage: Stage) { await this.rpc("crm_transition_request", { p_request_id: id, p_stage: stage }); }
  async claimAnalysis(id: string) { return await this.rpc("crm_claim_analysis", { p_request_id: id }) as { lockToken: string; cached: boolean }; }
  async finishAnalysis(id: string, lockToken: string, analysis: Analysis, usage: Usage) { await this.rpc("crm_finish_analysis", { p_request_id: id, p_lock_token: lockToken, p_analysis: analysis, p_usage: usage }); }
  async failAnalysis(id: string, lockToken: string, message: string) { await this.rpc("crm_fail_analysis", { p_request_id: id, p_lock_token: lockToken, p_message: message }); }
  async toggleTask(id: string, completed: boolean) { await this.rpc("crm_toggle_task", { p_task_id: id, p_completed: completed }); }
  async addTask(requestId: string, title: string, dueDate: string | null) { await this.rpc("crm_add_task", { p_request_id: requestId, p_title: title, p_due_date: dueDate }); }
}
