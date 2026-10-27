import { AppError, type WorkspacePayload } from "../domain";
import { createSupabaseServerClient } from "../supabase/server";
import { aiEnabled, demoEnabled } from "./config";
import { LocalRepository } from "./local-repository";
import type { Repository } from "./repository";
import { SupabaseRepository } from "./supabase-repository";

export async function ownerRepository(): Promise<Repository> {
  if (demoEnabled()) return new LocalRepository();
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new AppError(401, "Please sign in to your workspace.");
  if (process.env.CRM_OWNER_EMAIL && user.email?.toLowerCase() !== process.env.CRM_OWNER_EMAIL.toLowerCase()) throw new AppError(403, "This workspace is reserved for its owner.");
  const existing = await supabase.from("crm_workspaces").select("id").eq("owner_id", user.id).maybeSingle();
  if (existing.error) throw new AppError(503, "The workspace schema is unavailable.");
  let id = existing.data?.id;
  if (!id) {
    const inserted = await supabase.from("crm_workspaces").upsert({ owner_id: user.id, owner_name: "Maksym Klymenko", name: "Maksym's workspace" }, { onConflict: "owner_id", ignoreDuplicates: true });
    if (inserted.error) throw new AppError(503, "The workspace could not be created.");
    const created = await supabase.from("crm_workspaces").select("id").eq("owner_id", user.id).single();
    id = created.data?.id;
    if (!id) throw new AppError(503, "The workspace could not be loaded.");
  }
  return new SupabaseRepository(supabase, id);
}
export async function workspacePayload(): Promise<WorkspacePayload> {
  const repository = await ownerRepository();
  return { workspace: await repository.readWorkspace(), demo: demoEnabled(), aiEnabled: aiEnabled(), storage: demoEnabled() ? "local" : "supabase" };
}
