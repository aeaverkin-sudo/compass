import { NextResponse } from "next/server";
import {
  portfolioText,
  pushAddress,
  telegramLink,
  whatsappLink,
} from "@/features/contact-collect/pushback";
import {
  clearPushback,
  markPushback,
  readExternalContact,
  readOwnedPortfolio,
} from "@/features/contact-collect/store";
import type { PushbackChannel } from "@/features/contact-collect/types";
import { publicOrigin } from "@/shared/lib/public-origin";
import { isUuid, requireOwnerId } from "@/shared/services/attachment-api";
import { sendHtmlMail } from "@/shared/services/mail";
import { publicCardPath } from "@/shared/services/public-card-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string }> };

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
}

function channelOf(value: unknown): PushbackChannel | null {
  if (value === "email" || value === "whatsapp" || value === "telegram") return value;
  return null;
}

/** Send the chosen portfolio. Email leaves from here. WhatsApp and Telegram only record the choice. */
export async function POST(request: Request, context: RouteProps) {
  const owner = await requireOwnerId();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);
  const { id } = await context.params;
  if (!isUuid(id)) return noStore({ error: "Contact not found." }, 404);

  let cardId = "";
  let channel: PushbackChannel | null = null;
  try {
    const body = (await request.json()) as { cardId?: unknown; channel?: unknown };
    cardId = typeof body.cardId === "string" ? body.cardId : "";
    channel = channelOf(body.channel);
  } catch {
    cardId = "";
  }
  if (!isUuid(cardId) || !channel) return noStore({ error: "Choose a portfolio and where to send it." }, 400);

  try {
    const contact = await readExternalContact(owner.id, id);
    if (!contact.ok) {
      return noStore(
        contact.available === false ? { error: contact.error, available: false } : { error: contact.error },
        contact.status,
      );
    }
    if (contact.contact.pushbackAt) return noStore({ error: "Already sent." }, 409);

    const address = pushAddress(contact.contact.lines, channel);
    if (!address) return noStore({ error: "No address for that." }, 400);

    const portfolio = await readOwnedPortfolio(owner.id, cardId);
    if (!portfolio.ok) return noStore({ error: portfolio.error }, portfolio.status);

    const url = `${publicOrigin(request)}${publicCardPath({ publicToken: portfolio.publicToken, handle: portfolio.handle ?? undefined })}`;
    const text = portfolioText(portfolio.name, url);

    const stamped = await markPushback(owner.id, id, channel, cardId);
    if (!stamped.ok) {
      return noStore(
        stamped.available === false ? { error: stamped.error, available: false } : { error: stamped.error },
        stamped.status,
      );
    }

    if (channel === "email") {
      try {
        await sendHtmlMail({
          to: address,
          subject: portfolio.name.replace(/[\r\n]+/g, " ").slice(0, 120),
          text,
          html: `<p>${escapeHtml(portfolio.name)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`,
        });
      } catch (error) {
        await clearPushback(owner.id, id, channel, cardId);
        const message = error instanceof Error ? error.message : "";
        if (message === "mail_not_configured") return noStore({ error: "Mail is not set up." }, 503);
        console.error("[external-contacts] pushback mail", message);
        return noStore({ error: "Could not send the email." }, 502);
      }
    }

    if (channel === "whatsapp") return noStore({ ok: true, channel, open: whatsappLink(address, text) });
    if (channel === "telegram") return noStore({ ok: true, channel, open: telegramLink(address, text) });
    return noStore({ ok: true, channel });
  } catch (error) {
    console.error("[external-contacts] pushback", error);
    return noStore({ error: "Could not send." }, 500);
  }
}
