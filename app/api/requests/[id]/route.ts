import { NextResponse } from "next/server";
import { z } from "zod";
import { STAGES } from "@/lib/domain";
import { ownerRepository } from "@/lib/server/context";
import { enforceSameOrigin, errorResponse, jsonBody } from "@/lib/server/http";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    enforceSameOrigin(request);
    const { stage } = z.object({ stage: z.enum(STAGES) }).strict().parse(await jsonBody(request));
    await (await ownerRepository()).transition(z.uuid().parse((await context.params).id), stage);
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
