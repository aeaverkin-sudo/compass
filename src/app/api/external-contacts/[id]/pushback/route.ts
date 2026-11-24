import { handlePushback } from "@/features/contact-collect/pushback-request";
import { readExternalContact, readOwnedPortfolio } from "@/features/contact-collect/store";
import { publicOrigin } from "@/shared/lib/public-origin";
import { requireOwnerId } from "@/shared/services/attachment-api";
import { publicCardPath } from "@/shared/services/public-card-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string }> };

/** Prepare a Swap draft. The server does not send mail and does not record a send. */
export async function POST(request: Request, context: RouteProps) {
  const { id } = await context.params;
  const origin = publicOrigin(request);
  return handlePushback(request, id, {
    owner: requireOwnerId,
    contact: async (ownerId, contactId) => {
      const loaded = await readExternalContact(ownerId, contactId);
      if (!loaded.ok) return loaded;
      return { ok: true, lines: loaded.contact.lines };
    },
    portfolio: async (ownerId, cardId) => {
      const portfolio = await readOwnedPortfolio(ownerId, cardId);
      if (!portfolio.ok) return portfolio;
      const url = `${origin}${publicCardPath({ publicToken: portfolio.publicToken, handle: portfolio.handle ?? undefined })}`;
      return { ok: true, url, name: portfolio.name };
    },
  });
}
