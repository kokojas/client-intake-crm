import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, IntakeSchema } from "@/lib/domain";
import { createPublicSupabaseClient } from "@/lib/supabase/server";
import { demoEnabled } from "@/lib/server/config";
import { LocalRepository } from "@/lib/server/local-repository";
import { enforceSameOrigin, errorResponse, jsonBody } from "@/lib/server/http";

// Public intake only queues work. It cannot spend API credit or read CRM records.
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    enforceSameOrigin(request);
    const token = z.uuid().parse((await context.params).token);
    const input = IntakeSchema.parse(await jsonBody(request));
    if (demoEnabled()) {
      const repository = new LocalRepository();
      if ((await repository.readWorkspace()).intakeToken !== token) throw new AppError(404, "This intake form is unavailable.");
      const result = await repository.receive(input, "form");
      return NextResponse.json({ received: true, duplicate: result.duplicate }, { status: result.duplicate ? 200 : 201 });
    }
    const { data, error } = await createPublicSupabaseClient().rpc("submit_crm_intake", { p_token: token, p_event_key: input.eventKey, p_name: input.name, p_email: input.email, p_company: input.company, p_message: input.message });
    if (error) throw new AppError(error.message.includes("limit") ? 429 : error.message.includes("different content") ? 409 : 400, error.message.includes("limit") ? "This inbox is temporarily at capacity. Please try later." : "This request could not be accepted. Please check the link and try again.");
    return NextResponse.json({ received: true, duplicate: Boolean(data?.duplicate) }, { status: data?.duplicate ? 200 : 201 });
  } catch (error) { return errorResponse(error); }
}
