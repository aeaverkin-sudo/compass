import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { register } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type { ExternalLine } from "./types.ts";
import type { PushbackDeps } from "./pushback-request.ts";

register(new URL("./voice-reading.alias-hook.mjs", import.meta.url), pathToFileURL("./"));

const { portfolioBody, pushCardIsServed } = await import("./pushback.ts");
const { handlePushback, UPDATE_APP } = await import("./pushback-request.ts");

const OWNER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CONTACT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CARD = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PRIVATE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PORTFOLIO_URL = "https://example.com/c/tokenpublictoken1234";

const lines: ExternalLine[] = [{ type: "email", value: "ada@example.com" }];

function deps(): PushbackDeps & { reads: number } {
  const state = { reads: 0 };
  return {
    get reads() {
      return state.reads;
    },
    owner: async () => ({ ok: true, id: OWNER }),
    contact: async (ownerId, id) => {
      state.reads += 1;
      if (ownerId !== OWNER || id !== CONTACT) return { ok: false, status: 404, error: "Contact not found." };
      return { ok: true, lines };
    },
    portfolio: async (_ownerId, cardId) => {
      const row =
        cardId === CARD
          ? { is_public: true, status: "published", display_name: "Ada Lovelace", public_token: "tokenpublictoken1234" }
          : cardId === PRIVATE
            ? { is_public: false, status: "published", display_name: "Ada Lovelace", public_token: "tokenpublictoken1234" }
            : null;
      if (!row || !pushCardIsServed(row)) return { ok: false, status: 404, error: "Portfolio not found." };
      return { ok: true, url: PORTFOLIO_URL };
    },
  };
}

test("the draft route refuses an old request, prepares a mailto, and rejects a foreign or private card", async () => {
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString("utf8");
    const incoming = new Request(`http://127.0.0.1${url.pathname}${url.search}`, {
      method: request.method,
      headers: { "Content-Type": "application/json" },
      body,
    });
    const handled = await handlePushback(incoming, url.searchParams.get("id") ?? "", deps());
    const text = await handled.text();
    response.writeHead(handled.status, { "Content-Type": "application/json", "Cache-Control": handled.headers.get("cache-control") ?? "" });
    response.end(text);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  const origin = `http://127.0.0.1:${address.port}`;

  const post = (id: string, payload: unknown) =>
    fetch(`${origin}/api/external-contacts/${id}/pushback?id=${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

  try {
    const old = await post(CONTACT, { cardId: CARD, channel: "email" });
    assert.equal(old.status, 400);
    assert.notEqual(old.status, 200);
    assert.notEqual(old.status, 409);
    assert.equal(old.headers.get("cache-control"), "no-store");
    const oldBody = (await old.json()) as { error?: string };
    assert.equal(oldBody.error, UPDATE_APP);

    const prepared = await post(CONTACT, {
      cardId: CARD,
      channel: "email",
      prepare: true,
      to: "other@example.com",
      url: "https://evil.example/card",
    });
    assert.equal(prepared.status, 200);
    assert.equal(prepared.headers.get("cache-control"), "no-store");
    const draft = (await prepared.json()) as { mailto?: string; text?: string; channel?: string };
    assert.equal(draft.channel, "email");
    assert.equal(draft.text, portfolioBody(PORTFOLIO_URL));
    assert.equal(draft.mailto?.startsWith("mailto:ada@example.com?"), true);
    assert.equal(draft.mailto?.includes("evil.example"), false);
    assert.equal(draft.mailto?.includes("other@example.com"), false);
    assert.equal(draft.mailto?.includes("Ada"), false);
    const params = new URLSearchParams(draft.mailto?.slice(draft.mailto.indexOf("?") + 1));
    assert.equal(params.get("body")?.replace(/\r\n/g, "\n"), draft.text);

    const foreign = await post(OTHER, { cardId: CARD, channel: "email", prepare: true });
    assert.equal(foreign.status, 404);

    const hidden = await post(CONTACT, { cardId: PRIVATE, channel: "email", prepare: true });
    assert.equal(hidden.status, 404);
    const hiddenBody = (await hidden.json()) as { error?: string };
    assert.equal(hiddenBody.error, "Portfolio not found.");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
