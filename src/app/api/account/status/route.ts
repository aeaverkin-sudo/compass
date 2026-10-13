import { NextResponse } from "next/server";
import { readyByteTotal, requireOwnerId } from "@/shared/services/attachment-api";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { readEventPass } from "@/shared/services/event-pass-status";
import { readAccountStatus, type AccountProvider, type AccountStatus } from "@/shared/services/trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function providerOf(user: { is_anonymous?: boolean; email?: string | null; identities?: { provider?: string }[] | null }): AccountProvider {
  if (user.is_anonymous) return null;
  const providers = new Set((user.identities ?? []).map((identity) => identity.provider));
  if (providers.has("email")) return "email";
  if (providers.has("google")) return "google";
  if (user.email) return "email";
  return null;
}

export async function GET() {
  const owner = await requireOwnerId();
  if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status });

  try {
    const clock = await readAccountStatus(owner.id);
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    let consentVersion: string | null = null;
    const { data: consent, error: consentError } = await supabase
      .from("consents")
      .select("document_version")
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!consentError && consent && typeof consent.document_version === "string") {
      consentVersion = consent.document_version;
    }

    let bytesUsed = 0;
    try {
      bytesUsed = await readyByteTotal(owner.id);
    } catch (storageError) {
      console.error("[account] storage", storageError);
    }

    let eventPass: AccountStatus["eventPass"] = null;
    if (!clock.registered) {
      try {
        eventPass = await readEventPass(owner.id, Boolean(user && !user.is_anonymous && user.email && user.email_confirmed_at));
      } catch (passError) {
        console.error("[account] event pass", passError);
      }
    }

    const status: AccountStatus = {
      ...clock,
      email: user && !user.is_anonymous ? user.email ?? null : null,
      provider: user ? providerOf(user) : null,
      consentVersion,
      bytesUsed,
      eventPass,
    };
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[trial] status", error);
    return NextResponse.json({ error: "Could not read the account" }, { status: 500 });
  }
}
