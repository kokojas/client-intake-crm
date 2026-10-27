import { NextResponse } from "next/server";
import { workspacePayload } from "@/lib/server/context";
import { errorResponse } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET() { try { return NextResponse.json(await workspacePayload(), { headers: { "Cache-Control": "no-store" } }); } catch (error) { return errorResponse(error); } }
