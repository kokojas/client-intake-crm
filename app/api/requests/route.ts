import { NextResponse } from "next/server";
import { z } from "zod";
import { IntakeSchema } from "@/lib/domain";
import { ownerRepository } from "@/lib/server/context";
import { aiEnabled } from "@/lib/server/config";
import { enforceSameOrigin, errorResponse, jsonBody } from "@/lib/server/http";
import { prepareRequestBrief } from "@/lib/server/service";

export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    const body = z.object({ intake: IntakeSchema, prepare: z.boolean().default(false) }).strict().parse(await jsonBody(request));
    const repository = await ownerRepository();
    const result = await repository.receive(body.intake, "manual");
    let analysisError: string | null = null;
    if (body.prepare && aiEnabled() && !result.duplicate) {
      try { await prepareRequestBrief(repository, result.id); } catch { analysisError = "Request saved. AI preparation failed; open the request to retry."; }
    }
    return NextResponse.json({ ...result, analysisError }, { status: result.duplicate ? 200 : 201 });
  } catch (error) { return errorResponse(error); }
}
