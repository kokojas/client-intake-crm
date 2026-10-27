import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerRepository } from "@/lib/server/context";
import { enforceSameOrigin, errorResponse, jsonBody } from "@/lib/server/http";
export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    const body = z.object({ requestId: z.uuid(), title: z.string().trim().min(2).max(200), dueDate: z.iso.date().nullable() }).strict().parse(await jsonBody(request));
    await (await ownerRepository()).addTask(body.requestId, body.title, body.dueDate);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
