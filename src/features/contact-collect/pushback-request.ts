import {
  mailtoHref,
  portfolioBody,
  PORTFOLIO_SUBJECT,
  pushAddress,
  telegramLink,
  whatsappLink,
} from "@/features/contact-collect/pushback";
import type { ExternalLine, PushbackChannel } from "@/features/contact-collect/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const UPDATE_APP = "Update ADED ME to open the draft.";

export type PushbackOwner = { ok: true; id: string } | { ok: false; status: number; error: string };

export type PushbackContact =
  | { ok: true; lines: ExternalLine[] }
  | { ok: false; status: number; error: string; available?: false };

export type PushbackPortfolio = { ok: true; url: string } | { ok: false; status: number; error: string };

export type PushbackDeps = {
  owner: () => Promise<PushbackOwner>;
  contact: (ownerId: string, id: string) => Promise<PushbackContact>;
  portfolio: (ownerId: string, cardId: string) => Promise<PushbackPortfolio>;
};

function noStore(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function channelOf(value: unknown): PushbackChannel | null {
  if (value === "email" || value === "whatsapp" || value === "telegram") return value;
  return null;
}

/**
 * Prepare a draft. Mail is not sent and no send mark is written.
 * A request without `prepare` is an old client: it gets an update error, never 200 or 409.
 */
export async function handlePushback(request: Request, id: string, deps: PushbackDeps): Promise<Response> {
  const owner = await deps.owner();
  if (!owner.ok) return noStore({ error: owner.error }, owner.status);
  if (!UUID_RE.test(id)) return noStore({ error: "Contact not found." }, 404);

  let cardId = "";
  let channel: PushbackChannel | null = null;
  let prepare = false;
  try {
    const body = (await request.json()) as { cardId?: unknown; channel?: unknown; prepare?: unknown };
    cardId = typeof body.cardId === "string" ? body.cardId : "";
    channel = channelOf(body.channel);
    prepare = body.prepare === true;
  } catch {
    prepare = false;
  }
  if (!prepare) return noStore({ error: UPDATE_APP }, 400);
  if (!UUID_RE.test(cardId) || !channel) return noStore({ error: "Choose a portfolio and where to send it." }, 400);

  try {
    const contact = await deps.contact(owner.id, id);
    if (!contact.ok) {
      return noStore(
        contact.available === false ? { error: contact.error, available: false } : { error: contact.error },
        contact.status,
      );
    }
    const address = pushAddress(contact.lines, channel);
    if (!address) return noStore({ error: "No address for that." }, 400);

    const portfolio = await deps.portfolio(owner.id, cardId);
    if (!portfolio.ok) return noStore({ error: portfolio.error }, portfolio.status);

    const text = portfolioBody(portfolio.url);
    if (channel === "email") {
      const mailto = mailtoHref(address, PORTFOLIO_SUBJECT, text);
      if (!mailto) return noStore({ error: "No address for that." }, 400);
      return noStore({ ok: true, channel, mailto, text });
    }
    if (channel === "whatsapp") return noStore({ ok: true, channel, open: whatsappLink(address, text) });
    if (channel === "telegram") return noStore({ ok: true, channel, open: telegramLink(address, text) });
    return noStore({ error: "Choose a portfolio and where to send it." }, 400);
  } catch {
    console.error("[external-contacts] pushback");
    return noStore({ error: "Could not prepare the draft." }, 500);
  }
}
