import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { AppError } from "../domain";
import { supabaseConfigured } from "../server/config";

export async function createSupabaseServerClient() {
  if (!supabaseConfigured()) throw new AppError(503, "The workspace is not connected to Supabase yet.");
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: values => { try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* Proxy refreshes cookies for Server Components. */ } },
    },
  });
}
export function createPublicSupabaseClient() {
  if (!supabaseConfigured()) throw new AppError(503, "This intake form is not connected yet.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}
