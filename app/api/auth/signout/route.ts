import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceSameOrigin, errorResponse } from "@/lib/server/http";
export async function POST(request: Request) { try { enforceSameOrigin(request); await (await createSupabaseServerClient()).auth.signOut(); return NextResponse.redirect(new URL("/login", request.url), { status: 303 }); } catch (error) { return errorResponse(error); } }
