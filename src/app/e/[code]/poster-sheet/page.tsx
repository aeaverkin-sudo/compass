import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InviteCover } from "@/shared/event/invite-cover";
import { priceLabel } from "@/shared/event/payment-label";
import { loadEventInvite } from "@/shared/services/event-invite";
import { loadEventPay } from "@/shared/services/event-payment";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Poster", robots: { index: false, follow: false } };

type PageProps = { params: Promise<{ code: string }> };

/** A server has no Helvetica: the sheet falls back to Arimo from public/fonts, Arial's metrics. */
const SHEET_CSS = `
@font-face{font-family:"ADED Poster";src:local("Helvetica Neue"),url(/fonts/Arimo-Regular.ttf) format("truetype");font-weight:300 400;font-display:block}
@font-face{font-family:"ADED Poster";src:local("Helvetica Neue Medium"),local("HelveticaNeue-Medium"),url(/fonts/Arimo-Medium.ttf) format("truetype");font-weight:500;font-display:block}
@font-face{font-family:"ADED Poster";src:local("Helvetica Neue Bold"),local("HelveticaNeue-Bold"),url(/fonts/Arimo-Bold.ttf) format("truetype");font-weight:600 900;font-display:block}
html,body{margin:0!important;padding:0!important;background:#fff!important;width:286px;height:404px;overflow:hidden}
[data-poster-sheet]{--font-sans:"ADED Poster","Helvetica Neue",Helvetica,Arial,sans-serif;position:fixed;top:0;left:0;width:286px;height:404px;z-index:2147483647;background:#fff}
`;

/** Only the live poster at its design size, for the mail snapshot. Public, like the invite. */
export default async function PosterSheetPage({ params }: PageProps) {
  const { code } = await params;
  const event = await loadEventInvite(code);
  if (!event) notFound();
  const pay = await loadEventPay(event.id);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SHEET_CSS }} />
      <div data-poster-sheet>
        <InviteCover
          variant="card"
          layout={event.layout}
          themeId={event.theme}
          event={{
            name: event.name,
            description: event.description,
            date: event.date,
            endDate: event.endsAt,
            timeZone: event.timeZone,
            place: event.place,
            placeSecret: event.placeSecret,
            logoUrl: event.logoAttachmentId ? `/e/${event.publicToken}/logo` : null,
            price: pay.isPaid ? priceLabel(pay.price, pay.currency) : null,
            inviteRows: event.inviteRows,
            logoLook: event.logoLook,
          }}
        />
      </div>
    </>
  );
}
