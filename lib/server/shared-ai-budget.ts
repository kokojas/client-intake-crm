import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../domain";
import { configuredBudgetMicros, validateBudgetRequest } from "./ai-budget";
import type { Usage } from "./repository";

export type BudgetSummary = { limitUsd: number; reservedMaximumUsd: number; estimatedKnownUsd: number; remainingAllowanceUsd: number; calls: number; stopped: boolean };

/** Server-only capability; the database serializes one allowance across all hosts. */
export class SharedAiBudget {
  constructor(private client: SupabaseClient, private token: string, private limitMicros = configuredBudgetMicros()) {}
  private async rpc(name: string, parameters: Record<string, unknown> = {}) {
    try {
      const response = await this.client.rpc(name, { p_token: this.token, ...parameters });
      if (response.error) {
        if (response.error.message.includes("allowance reached")) throw new AppError(429, "The approved AI spending allowance has been reached. Your request is saved; no paid call was started.");
        throw new AppError(503, "The shared AI spending counter is unavailable. No further paid call can start.");
      }
      return response.data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, "The shared AI spending counter is unavailable. No further paid call can start.");
    }
  }
  async reserve(model: string, requestBytes: number) {
    validateBudgetRequest(model, requestBytes);
    const id = await this.rpc("crm_reserve_ai_budget", { p_model: model, p_request_bytes: requestBytes, p_limit_micros: this.limitMicros });
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new AppError(503, "The spending reservation could not be confirmed. No paid call was started.");
    return id;
  }
  async recordUsage(id: string, usage: Usage) {
    await this.rpc("crm_record_ai_usage", { p_reservation_id: id, p_model: usage.model, p_input_tokens: usage.inputTokens, p_output_tokens: usage.outputTokens });
  }
  async summary(): Promise<BudgetSummary> {
    const data = await this.rpc("crm_ai_budget_summary") as BudgetSummary | null;
    if (!data || [data.limitUsd, data.reservedMaximumUsd, data.estimatedKnownUsd, data.remainingAllowanceUsd].some(value => typeof value !== "number" || !Number.isFinite(value) || value < 0) || data.limitUsd > 11.14 || !Number.isSafeInteger(data.calls) || typeof data.stopped !== "boolean") throw new AppError(503, "The AI spending summary could not be verified.");
    return data;
  }
}

export function sharedMeterConfigured() {
  return Boolean(process.env.CRM_AI_METER_URL && process.env.CRM_AI_METER_PUBLISHABLE_KEY && process.env.CRM_AI_METER_TOKEN);
}
export function aiBudget() {
  if (!sharedMeterConfigured()) throw new AppError(503, "Connect the shared spending counter before enabling paid AI calls.");
  const client = createClient(process.env.CRM_AI_METER_URL!, process.env.CRM_AI_METER_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) },
  });
  return new SharedAiBudget(client, process.env.CRM_AI_METER_TOKEN!);
}
