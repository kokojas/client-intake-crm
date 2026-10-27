import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerRepository } from "@/lib/server/context";
import { enforceSameOrigin, errorResponse } from "@/lib/server/http";
import { prepareRequestBrief } from "@/lib/server/service";
export const maxDuration = 60;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    enforceSameOrigin(request);
    const result = await prepareRequestBrief(await ownerRepository(), z.uuid().parse((await context.params).id));
    return NextResponse.json(result);
  } catch (error) { return errorResponse(error); }
}
