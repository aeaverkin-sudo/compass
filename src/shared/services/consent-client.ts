import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { CONSENT_VERSION, type ConsentPath } from "@/shared/services/consent";

/** Writes the accepted version for the current session. Called at Confirm and at registration. */
export async function recordConsent(path: ConsentPath) {
  const supabase = createBrowserSupabaseClient();
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError || !data.user) {
    throw new Error("No session yet. Wait a moment and try again.");
  }

  const { error } = await supabase.from("consents").insert({
    user_id: data.user.id,
    document_version: CONSENT_VERSION,
    path,
  });
  if (error) throw new Error(error.message);
}
