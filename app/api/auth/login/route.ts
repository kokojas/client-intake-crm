import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/domain";
import { enforceSameOrigin, errorResponse, jsonBody } from "@/lib/server/http";
const sent = new Map<string, number>();
export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    const { email } = z.object({ email: z.email().transform(value => value.toLowerCase()) }).strict().parse(await jsonBody(request));
    if (!process.env.CRM_OWNER_EMAIL || email !== process.env.CRM_OWNER_EMAIL.toLowerCase()) throw new AppError(403, "Sign in is restricted to the workspace owner.");
    if (Date.now() - (sent.get(email) ?? 0) < 60000) throw new AppError(429, "Please wait a minute before requesting another link.");
    sent.set(email, Date.now());
    const supabase = await createSupabaseServerClient();
    const redirect = new URL("/auth/confirm", process.env.CRM_APP_URL || request.url);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect.href } });
    if (error) throw new AppError(503, "The sign-in link could not be sent. Please try again later.");
    return NextResponse.json({ sent: true });
  } catch (error) { return errorResponse(error); }
}
