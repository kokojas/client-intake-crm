import { AppError } from "../domain";

// Approved total; not a daily/monthly reset. The shared database persists all reservations.
export const APPROVED_AI_BUDGET_MICROS = 11_140_000;
export const CALL_RESERVATION_MICROS = 30_000;
export const MAX_AI_REQUEST_BYTES = 64_000;
export const MAX_AI_OUTPUT_TOKENS = 3_000;
export const MAX_INPUT_TOKEN_BOUND = MAX_AI_REQUEST_BYTES + 8_192;
// Standard gpt-5-mini pricing checked 2026-10-26: $0.25 input / $2 output per 1M.
// At most one byte-level text token per serialized UTF8 byte plus protocol margin.
export const MAX_VERIFIED_CALL_COST_MICROS = Math.ceil(MAX_INPUT_TOKEN_BOUND * 0.25 + MAX_AI_OUTPUT_TOKENS * 2);

export function configuredBudgetMicros(value = process.env.CRM_AI_BUDGET_USD) {
  if (!value || !/^\d+(\.\d{1,2})?$/.test(value)) throw new AppError(503, "The AI spending allowance must be configured before calling OpenAI.");
  const amount = Math.round(Number(value) * 1_000_000);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > APPROVED_AI_BUDGET_MICROS) throw new AppError(503, "The AI spending allowance exceeds the approved $11.14 maximum.");
  return amount;
}
export function validateBudgetRequest(model: string, requestBytes: number) {
  if (model !== "gpt-5-mini" || !Number.isSafeInteger(requestBytes) || requestBytes < 0 || requestBytes > MAX_AI_REQUEST_BYTES) throw new AppError(503, "The model or input size is outside the verified AI cost allowance.");
}
