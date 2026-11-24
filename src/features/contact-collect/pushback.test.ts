import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type { ExternalLine } from "./types.ts";

register(new URL("./voice-reading.alias-hook.mjs", import.meta.url), pathToFileURL("./"));

const {
  draftStillCurrent,
  emailDraft,
  keptSwapCard,
  mailtoHref,
  portfolioBody,
  portfolioText,
  PORTFOLIO_SUBJECT,
  pushAddress,
  pushCardIsServed,
  pushTargets,
  swapCardOffered,
  telegramLink,
  visibleDraft,
} = await import("./pushback.ts");

const phone: ExternalLine = { type: "phone", value: "+44 7700 900123" };
const nick: ExternalLine = { type: "telegram", value: "@sample_contact" };
const draft = portfolioText("Sample portfolio", "https://example.com/portfolio");

test("a number marked for both messengers offers WhatsApp and Telegram", () => {
  const lines: ExternalLine[] = [{ ...phone, flags: ["wa", "tg"] }];
  assert.deepEqual(pushTargets(lines).map(({ channel }) => channel), ["whatsapp", "telegram"]);
  assert.equal(pushAddress(lines, "whatsapp"), "447700900123");
  assert.equal(pushAddress(lines, "telegram"), "+447700900123");
});

test("Telegram prefers a saved nick and ignores unmarked or national numbers", () => {
  assert.equal(pushAddress([{ ...phone, flags: ["tg"] }, nick], "telegram"), "sample_contact");
  assert.equal(pushAddress([phone], "telegram"), null);
  assert.equal(pushAddress([{ ...phone, value: "07700 900123", flags: ["tg"] }], "telegram"), null);
});

test("WhatsApp prefers a marked number and otherwise uses an international number", () => {
  const marked = "+44 7700 900111";
  const plain = "+44 7700 900222";
  const lines: ExternalLine[] = [
    { type: "phone", value: plain },
    { type: "phone", value: marked, flags: ["wa"] },
  ];
  assert.equal(pushAddress(lines, "whatsapp"), "447700900111");
  assert.equal(pushAddress([{ type: "phone", value: plain }], "whatsapp"), "447700900222");
  assert.equal(pushAddress([{ type: "phone", value: "07700 900123", flags: ["wa"] }], "whatsapp"), null);
});

test("Telegram prefers a nick and uses a number only when it is marked TG", () => {
  const phone: ExternalLine = { type: "phone", value: "+44 7700 900123", flags: ["tg"] };
  const nick: ExternalLine = { type: "telegram", value: "@sample_contact" };
  assert.equal(pushAddress([phone, nick], "telegram"), "sample_contact");
  assert.equal(pushAddress([phone], "telegram"), "+447700900123");
  assert.equal(pushAddress([{ type: "phone", value: "+44 7700 900123" }], "telegram"), null);
  assert.equal(pushAddress([{ type: "phone", value: "07700 900123", flags: ["tg"] }], "telegram"), null);
});

test("Telegram drafts use the saved number or nickname and preserve plain contact links", () => {
  for (const address of ["+447700900123", "sample_contact"]) {
    const url = new URL(telegramLink(address, draft));
    assert.equal(url.origin, "https://t.me");
    assert.equal(url.pathname, `/${address}`);
    assert.equal(url.searchParams.get("text"), draft);
  }
  assert.equal(telegramLink("sample_contact"), "https://t.me/sample_contact");
});

test("the email draft is one encoded mailto and does not use an unconfirmed name", () => {
  const url = "https://example.com/c/token";
  const text = portfolioBody(url);
  const href = mailtoHref("ada@example.com", PORTFOLIO_SUBJECT, text);
  assert.ok(href);
  const cut = href.indexOf("?");
  assert.equal(href.slice("mailto:".length, cut), "ada@example.com");
  const params = new URLSearchParams(href.slice(cut + 1));
  assert.equal(params.get("subject"), "My portfolio");
  assert.equal(params.get("body")?.replace(/\r\n/g, "\n"), text);
  assert.equal(text, "Here's my portfolio:\nhttps://example.com/c/token");
  assert.equal(href.includes("%0D%0A"), true);
  assert.equal(href.includes("Ada"), false);
  assert.equal(params.get("cc"), null);
  assert.equal(params.get("bcc"), null);
  assert.equal(mailtoHref("ada@example.com,bee@example.com", PORTFOLIO_SUBJECT, text), null);
  assert.equal(mailtoHref("ada@example.com\nbee@example.com", PORTFOLIO_SUBJECT, text), null);
  assert.equal(mailtoHref("ada@example.com?bcc=bee@example.com", PORTFOLIO_SUBJECT, text), null);
});

test("a ready draft leaves the screen when the selection changes, and a late reply cannot replace it", () => {
  const ready = {
    contactId: "contact",
    cardId: "card-a",
    channel: "email",
    name: "",
    mailto: "mailto:ada@example.com?subject=My%20portfolio",
    text: "Here's my portfolio:\nhttps://example.com/c/token",
  };
  assert.equal(visibleDraft(ready, ready)?.mailto, ready.mailto);
  assert.equal(visibleDraft(ready, { ...ready, cardId: "card-b" }), null);
  assert.equal(visibleDraft(ready, { ...ready, channel: "whatsapp" }), null);
  assert.equal(visibleDraft(ready, { ...ready, contactId: "other" }), null);
  assert.equal(visibleDraft(ready, { ...ready, name: "Ada" }), null);
  assert.equal(draftStillCurrent(ready, { ...ready, cardId: "card-b" }), false);
  assert.equal(draftStillCurrent(ready, null), false);
});

test("a ready draft disappears when the selected card becomes private", () => {
  const ready = {
    contactId: "contact",
    cardId: "card-a",
    channel: "email",
    name: "Ada",
    mailto: "mailto:ada@example.com?subject=My%20portfolio",
    open: "https://wa.me/447700900111",
    text: "Here's my portfolio:\nhttps://example.com/c/token",
  };
  const visible = { displayName: "Ada", status: "published", isPublic: true };
  const hidden = { displayName: "Ada", status: "published", isPublic: false };
  assert.equal(swapCardOffered(visible), true);
  assert.equal(swapCardOffered(hidden), false);
  assert.equal(keptSwapCard("card-a", ["card-a"]), "card-a");
  const still = { ...ready, cardId: keptSwapCard("card-a", ["card-a"]) ?? "" };
  assert.equal(visibleDraft(ready, still)?.mailto, ready.mailto);
  assert.equal(visibleDraft(ready, still)?.text, ready.text);
  const gone = { ...ready, cardId: keptSwapCard("card-a", []) ?? "", name: "" };
  assert.equal(gone.cardId, "");
  assert.equal(visibleDraft(ready, gone), null);
  assert.equal(draftStillCurrent(ready, gone), false);
});

test("email uses the confirmed server name, and a changed name stays neutral", () => {
  const url = "https://example.com/c/token";
  const named = emailDraft(url, "Ada Lovelace", "Ada Lovelace");
  const plain = emailDraft(url, "Ada Lovelace", "Ada");
  const untouched = emailDraft(url, "Ada Lovelace", null);
  assert.equal(named.subject, "Ada Lovelace \u2014 portfolio");
  assert.equal(named.text, "Hi, I\u2019m Ada Lovelace. Here\u2019s my portfolio:\nhttps://example.com/c/token");
  assert.equal(plain.subject, PORTFOLIO_SUBJECT);
  assert.equal(plain.text, portfolioBody(url));
  assert.equal(plain.text.includes("Ada"), false);
  assert.equal(untouched.text, plain.text);
  for (const mail of [named, plain]) {
    const href = mailtoHref("ada@example.com", mail.subject, mail.text);
    assert.ok(href);
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    assert.equal(params.get("subject"), mail.subject);
    assert.equal(params.get("body")?.replace(/\r\n/g, "\n"), mail.text);
  }
});

test("a private card is not offered, and listed is not the check", () => {
  assert.equal(swapCardOffered({ displayName: "Ada", status: "published", isPublic: true }), true);
  assert.equal(swapCardOffered({ displayName: "Ada", status: "published", isPublic: false }), false);
  assert.equal(swapCardOffered({ displayName: "Ada", status: "archived", isPublic: true }), false);
  assert.equal(swapCardOffered({ displayName: "Ada", status: "suspended", isPublic: true }), false);
  assert.equal(swapCardOffered({ displayName: "Ada", status: "published" }), true);
});

test("a private or archived portfolio is not offered, and listed is not enough", () => {
  const named = { display_name: "Ada", status: "published" };
  assert.equal(pushCardIsServed({ ...named, is_public: true }), true);
  assert.equal(pushCardIsServed({ ...named, is_public: false }), false);
  assert.equal(pushCardIsServed({ is_public: true, status: "archived", display_name: "Ada" }), false);
  assert.equal(pushCardIsServed({ is_public: true, status: "suspended", display_name: "Ada" }), false);
  assert.equal(pushCardIsServed({ is_public: true, status: "published", display_name: "  " }), false);
});

test("the route prepares a draft and does not send mail or mark a send", () => {
  const route = readFileSync(new URL("../../app/api/external-contacts/[id]/pushback/route.ts", import.meta.url), "utf8");
  const handler = readFileSync(new URL("./pushback-request.ts", import.meta.url), "utf8");
  const screen = readFileSync(new URL("./pushback-screen.tsx", import.meta.url), "utf8");
  const store = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
  const card = readFileSync(new URL("./contact-screen.tsx", import.meta.url), "utf8");
  const network = readFileSync(new URL("../../app/network/network-screen.tsx", import.meta.url), "utf8");
  assert.equal(route.includes("sendHtmlMail"), false);
  assert.equal(route.includes("markPushback"), false);
  assert.equal(handler.includes("sendHtmlMail"), false);
  assert.equal(handler.includes("pushback_at"), false);
  assert.equal(/status:\s*409|,\s*409\b/.test(handler), false);
  assert.match(handler, /Update ADED ME to open the draft/);
  assert.equal(store.includes("markPushback"), false);
  assert.equal(store.includes("clearPushback"), false);
  assert.match(store, /pushCardIsServed/);
  assert.match(screen, /<a href=\{mailHref\}/);
  assert.match(screen, /Copy message/);
  assert.match(screen, /Use this name/);
  assert.match(screen, /visibleDraft/);
  assert.match(screen, /keptSwapCard/);
  assert.match(screen, /draftStillCurrent/);
  assert.match(route, /name: portfolio\.name/);
  assert.equal(screen.includes("Already sent"), false);
  assert.equal(screen.includes("window.open"), false);
  assert.equal(screen.includes("preventDefault"), false);
  assert.equal(card.includes("disabled={swapped}"), false);
  assert.equal(network.includes("menuContact.pushed"), false);
});
