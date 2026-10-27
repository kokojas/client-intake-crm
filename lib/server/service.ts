import { AppError, validateAnalysis } from "../domain";
import { analyzeWithOpenAI, type Analyze } from "./openai";
import type { Repository } from "./repository";
import { aiEnabled } from "./config";

/** Claim first, call once, and atomically commit brief/tasks/event; preserve source on failure. */
export async function prepareRequestBrief(repository: Repository, id: string, analyze: Analyze = analyzeWithOpenAI) {
  if (analyze === analyzeWithOpenAI && !aiEnabled()) throw new AppError(503, "OpenAI is not connected. Your request is saved; connect OpenAI before preparing a brief.");
  const claim = await repository.claimAnalysis(id);
  if (claim.cached) return { cached: true };
  try {
    const workspace = await repository.readWorkspace();
    const request = workspace.requests.find(request => request.id === id);
    const client = workspace.clients.find(client => client.id === request?.clientId);
    if (!request || !client) throw new AppError(404, "Request not found.");
    const result = await analyze(request, client);
    await repository.finishAnalysis(id, claim.lockToken, validateAnalysis(result.analysis), result.usage);
    return { cached: false };
  } catch (error) {
    const safeMessage = error instanceof AppError ? error.message : "AI preparation failed. Your original request is saved.";
    await repository.failAnalysis(id, claim.lockToken, safeMessage);
    throw error instanceof AppError ? error : new AppError(502, safeMessage);
  }
}
