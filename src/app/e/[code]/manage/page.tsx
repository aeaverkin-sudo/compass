import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { priceLabel } from "@/shared/event/payment-label";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { requestOrigin } from "@/shared/services/public-card-meta";
import { listEventManagers, loadManageEvent, managerCap, visibleSections } from "@/shared/services/event-manage";
import { loadEventInvite } from "@/shared/services/event-invite";
import { loadEventPay, loadPaymentTally } from "@/shared/services/event-payment";
import { eventPublicPath } from "@/shared/event/slug";
import { ManageHome } from "./manage-home";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Event" };

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ created?: string; saved?: string }>;
};

function once(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

export default async function ManageEventPage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const query = await searchParams;
  const lookup = once(code);
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) notFound();
  const access = await loadManageEvent(lookup, data.user.id);
  if (access.kind !== "ok") notFound();

  const event = access.event;
  const sections = visibleSections(event.role, event.permissions);
  const invite = await loadEventInvite(lookup);
  if (!invite) notFound();
  const pay = await loadEventPay(event.id);
  const [managers, tally] = await Promise.all([
    sections.includes("managers") ? listEventManagers(event.id) : Promise.resolve(null),
    sections.includes("payment") ? loadPaymentTally(event.id) : Promise.resolve(null),
  ]);
  const origin = await requestOrigin();
  const flash = query.created === "1" ? "created" : query.saved === "1" ? "saved" : null;
  const shareKey = invite.slug?.trim() || invite.code.trim() || event.publicToken;

  return (
    <ManageHome
      lookup={lookup}
      name={event.name}
      shareUrl={`${origin}${eventPublicPath(shareKey)}`}
      sections={sections}
      canEdit={event.role === "owner" || event.permissions.edit}
      flash={flash}
      cover={{
        description: invite.description,
        date: invite.date,
        endsAt: invite.endsAt,
        place: invite.place,
        placeSecret: invite.placeSecret,
        theme: invite.theme,
        layout: invite.layout,
        logoUrl: invite.logoAttachmentId ? `/e/${event.publicToken}/logo` : null,
        price: pay.isPaid ? priceLabel(pay.price, pay.currency) : null,
      }}
      going={event.registered}
      confirmed={event.paid}
      checkedIn={event.checkedIn}
      isPaid={pay.isPaid}
      pay={sections.includes("payment") ? pay : null}
      tally={tally}
      managers={managers ?? []}
      canRemove={event.role === "owner"}
      teamFull={(managers?.length ?? event.managers) >= managerCap()}
    />
  );
}
