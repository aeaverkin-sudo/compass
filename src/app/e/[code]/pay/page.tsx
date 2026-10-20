import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { payView } from "@/shared/event/payment-label";
import { loadEventInvite } from "@/shared/services/event-invite";
import { loadEventPay } from "@/shared/services/event-payment";
import { ensurePayCode, listOwnPortfolios, loadOwnRegistration } from "@/shared/services/event-registration";
import { isPermanentAccount } from "@/shared/services/guest-accept";
import { PayScreen } from "./pay-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Payment" };

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
};

/** The questionnaire on this same event. Anything else is ignored. */
function questionnaireNext(raw: string | undefined, lookup: string): string | null {
  if (!raw || !raw.startsWith("/e/") || raw.includes("//") || raw.includes("\\") || raw.includes("#")) return null;
  const cut = raw.indexOf("?");
  const pathname = cut === -1 ? raw : raw.slice(0, cut);
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    path = pathname;
  }
  if (path !== `/e/${lookup}/create`) return null;
  if (cut === -1) return path;
  const search = new URLSearchParams(raw.slice(cut + 1));
  for (const key of search.keys()) {
    if (key !== "g" && key !== "t") return null;
  }
  return raw;
}

/** A pass on a paid event: the payment comes first, the pass right after. */
export default async function EventPayPage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const query = await searchParams;
  const nextRaw = Array.isArray(query.next) ? query.next[0] : query.next;
  let lookup = code.trim();
  try {
    lookup = decodeURIComponent(lookup);
  } catch {
    // A broken escape stays as written.
  }
  const event = await loadEventInvite(lookup);
  if (!event) redirect("/main");

  const next = questionnaireNext(nextRaw, lookup);
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) redirect(`/e/${encodeURIComponent(lookup)}`);
  const owned = await listOwnPortfolios(user.id);
  const hasPortfolio = owned.some((card) => card.name.trim() || card.photoAttachmentId);
  const permanent = await isPermanentAccount({ id: user.id, anonymous: Boolean(user.is_anonymous) });
  if (hasPortfolio && permanent) redirect(`/e/${encodeURIComponent(lookup)}/join`);

  const pay = await loadEventPay(event.id);
  const loaded = await loadOwnRegistration(event.id, user.id);
  const confirmed = loaded ? payView(loaded.paidStatus ?? "", loaded.paidSource).key === "confirmed" : false;
  if (!pay.isPaid || confirmed) redirect(next ?? (hasPortfolio ? "/main" : `/e/${encodeURIComponent(lookup)}`));
  if (!loaded && !next) redirect("/main");
  if (hasPortfolio && !loaded) redirect("/main");
  const registration = loaded ? await ensurePayCode(event.id, user.id, loaded) : null;

  return <PayScreen lookup={lookup} eventName={event.name} pay={pay} registration={registration} next={next} />;
}
