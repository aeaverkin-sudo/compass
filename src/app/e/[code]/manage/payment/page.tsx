import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { requestOrigin } from "@/shared/services/public-card-meta";
import { loadManageEvent } from "@/shared/services/event-manage";
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
  const pay = await loadEventPay(access.event.id);
  const tally = await loadPaymentTally(access.event.id);
  const origin = await requestOrigin();

  return (
    <PaymentScreen
      lookup={lookup}
      pay={pay}
      tally={tally}
      returnUrl={`${origin}/e/${encodeURIComponent(access.event.code)}/paid`}
    />
  );
}
