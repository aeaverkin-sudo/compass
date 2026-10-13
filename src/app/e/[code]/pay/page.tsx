import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { payView } from "@/shared/event/payment-label";
import { loadEventInvite } from "@/shared/services/event-invite";
import { loadEventPay } from "@/shared/services/event-payment";
import { ensurePayCode, loadOwnRegistration } from "@/shared/services/event-registration";
import { isPermanentAccount } from "@/shared/services/guest-accept";
import { PayScreen } from "./pay-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Payment" };

type PageProps = { params: Promise<{ code: string }> };

/** A pass on a paid event: the payment comes first, the pass right after. */
export default async function EventPayPage({ params }: PageProps) {
  const { code } = await params;
  let lookup = code.trim();
  try {
    lookup = decodeURIComponent(lookup);
  } catch {
    // A broken escape stays as written.
  }
  const event = await loadEventInvite(lookup);
  if (!event) redirect("/main");

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) redirect(`/e/${encodeURIComponent(lookup)}`);
  if (await isPermanentAccount({ id: user.id, anonymous: Boolean(user.is_anonymous) })) {
    redirect(`/e/${encodeURIComponent(lookup)}/join`);
  }

  const pay = await loadEventPay(event.id);
  const loaded = await loadOwnRegistration(event.id, user.id);
  if (!loaded || !pay.isPaid) redirect("/main");
  if (payView(loaded.paidStatus ?? "", loaded.paidSource).key === "confirmed") redirect("/main");
  const registration = await ensurePayCode(event.id, user.id, loaded);

  return <PayScreen lookup={lookup} eventName={event.name} pay={pay} registration={registration} />;
}
