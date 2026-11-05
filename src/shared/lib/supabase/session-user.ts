import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { readStoredAccessToken } from "@/shared/lib/supabase/access-token";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";

/**
 * Who the cookie says is signed in.
 * Passes the access token straight to the user endpoint, so a card open
 * cannot rotate the refresh token and then lose the new cookie.
 */
export async function sessionUser(): Promise<User | null> {
  const token = await readStoredAccessToken((await cookies()).getAll());
  if (!token) return null;
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user;
  } catch {
    return null;
  }
}
