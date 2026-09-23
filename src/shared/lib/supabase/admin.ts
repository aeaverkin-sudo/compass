import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Server only — do not import from client components.
 * Bypasses RLS. Not used until later storage phases.
 */
export function createAdminSupabaseClient() {
  if (typeof window !== "undefined") {
    throw new Error("Supabase admin client cannot run in the browser");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
