import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerRepository } from "@/lib/server/context";
import { enforceSameOrigin, errorResponse, jsonBody } from "@/lib/server/http";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    enforceSameOrigin(request);
    const { completed } = z.object({ completed: z.boolean() }).strict().parse(await jsonBody(request));
    await (await ownerRepository()).toggleTask(z.uuid().parse((await context.params).id), completed);
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
