import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "../domain";

export async function jsonBody(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new AppError(415, "Send JSON content.");
  const text = await request.text();
  if (text.length > 18000) throw new AppError(413, "This request is too large.");
  try { return JSON.parse(text); } catch { throw new AppError(400, "Invalid JSON body."); }
}
export function enforceSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Next may reconstruct request.url with localhost behind a proxy. Host is the
  // browser-facing authority; never trust a caller-supplied forwarded-host here.
  if (origin) {
    let parsed: URL;
    try { parsed = new URL(origin); } catch { throw new AppError(403, "This action must come from this workspace."); }
    const host = request.headers.get("host") || new URL(request.url).host;
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.host !== host) throw new AppError(403, "This action must come from this workspace.");
  }
}
export function errorResponse(error: unknown) {
  const status = error instanceof AppError ? error.status : error instanceof ZodError ? 400 : 500;
  const message = error instanceof AppError ? error.message : error instanceof ZodError ? error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ") : "The operation could not be completed. Please try again.";
  return NextResponse.json({ error: message, ...(error instanceof AppError && error.code ? { code: error.code } : {}) }, { status, headers: { "Cache-Control": "no-store" } });
}
