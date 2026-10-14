import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { listEventGuests, loadManageEvent } from "@/shared/services/event-manage";
import { loadGuestBook, registrationGuest } from "@/shared/services/event-guest-lists";
import { loadEventPay, loadPaymentTally } from "@/shared/services/event-payment";
import { PaymentScreen } from "./payment-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Payment" };

type PageProps = { params: Promise<{ code: string }> };

function once(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

export default async function ManagePaymentPage({ params }: PageProps) {
  const { code } = await params;
  const lookup = once(code);
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) notFound();
  const access = await loadManageEvent(lookup, data.user.id, "payments");
  if (access.kind !== "ok") notFound();
  const event = access.event;
  const [pay, tally, list] = await Promise.all([loadEventPay(event.id), loadPaymentTally(event.id), listEventGuests(event.id)]);
  const book = await loadGuestBook(event.id, list.guests).catch((error) => {
    console.error("[events] guest book", error);
    return null;
  });

  return (
    <PaymentScreen
      lookup={lookup}
      pay={pay}
      tally={tally}
      guests={book ? book.guests : list.guests.map(registrationGuest)}
    />
  );
}
