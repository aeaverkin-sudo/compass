import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type { ExternalLine } from "./types.ts";

register(new URL("./voice-reading.alias-hook.mjs", import.meta.url), pathToFileURL("./"));

const {
  armSwapReturn,
  draftStillCurrent,
  emailDraft,
  expireSwapReturn,
  finishSwapReturn,
  keptSwapCard,
  mailtoHref,
  meetingSubject,
  noteSwapBlur,
  noteSwapHidden,
  portfolioBody,
  clearSwapHandoff,
  readSwapHandoffFrom,
  swapFooter,
  swapRestore,
  swapWake,
  writeSwapHandoff,
  portfolioText,
  pushAddress,
  pushCardIsServed,
  pushTargets,
  SWAP_RETURN_ARM_MS,
  SWAP_RETURN_BLUR_MS,
  swapCardOffered,
  telegramLink,
  visibleDraft,
} = await import("./pushback.ts");

const phone: ExternalLine = { type: "phone", value: "+44 7700 900123" };
const nick: ExternalLine = { type: "telegram", value: "@sample_contact" };
const draft = portfolioText("https://example.com/portfolio");

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
  const href = mailtoHref("ada@example.com", meetingSubject("Anton Averkin."), text);
  assert.ok(href);
  const cut = href.indexOf("?");
  assert.equal(href.slice("mailto:".length, cut), "ada@example.com");
  const params = new URLSearchParams(href.slice(cut + 1));
  assert.equal(params.get("subject"), "We've just met. Anton Averkin's portfolio");
  assert.equal(params.get("body")?.replace(/\r\n/g, "\n"), text);
  assert.equal(text, "Here's my portfolio:\nhttps://example.com/c/token");
  assert.equal(href.includes("%0D%0A"), true);
  assert.equal(params.get("body")?.includes("Anton"), false);
  assert.equal(params.get("cc"), null);
  assert.equal(params.get("bcc"), null);
  assert.equal(mailtoHref("ada@example.com,bee@example.com", meetingSubject("Anton Averkin"), text), null);
  assert.equal(mailtoHref("ada@example.com\nbee@example.com", meetingSubject("Anton Averkin"), text), null);
  assert.equal(mailtoHref("ada@example.com?bcc=bee@example.com", meetingSubject("Anton Averkin"), text), null);
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

test("the subject uses the server name, and an empty name stays generic", () => {
  const url = "https://example.com/c/token";
  const named = emailDraft(url, "Anton Averkin.");
  const plain = emailDraft(url, " . ");
  assert.equal(named.subject, "We've just met. Anton Averkin's portfolio");
  assert.equal(named.text, portfolioBody(url));
  assert.equal(named.text.includes("Anton"), false);
  assert.equal(plain.subject, "We've just met. My portfolio.");
  assert.equal(plain.text, portfolioBody(url));
  assert.equal(portfolioText(url), "We've just met. Here's my portfolio:\nhttps://example.com/c/token");
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

test("a failed Swap tap does not leave, and a real handoff returns after send or close", () => {
  let state = armSwapReturn(0);
  assert.equal(finishSwapReturn(state, 0).openNetwork, false);
  state = expireSwapReturn(state, SWAP_RETURN_ARM_MS, true);
  state = noteSwapHidden(state);
  assert.equal(finishSwapReturn(state, SWAP_RETURN_ARM_MS).openNetwork, false);

  state = armSwapReturn(0);
  state = noteSwapBlur(state, 20);
  state = finishSwapReturn(state, 20 + 50).state;
  assert.equal(state.armed, true);
  state = expireSwapReturn(state, SWAP_RETURN_ARM_MS, true);
  state = noteSwapHidden(state);
  assert.equal(finishSwapReturn(state, SWAP_RETURN_ARM_MS + 1).openNetwork, false);

  state = noteSwapHidden(armSwapReturn(0));
  assert.equal(finishSwapReturn(state, 5).openNetwork, true);
  state = noteSwapBlur(armSwapReturn(0), 10);
  assert.equal(expireSwapReturn(state, SWAP_RETURN_ARM_MS, true).armed, true);
  assert.equal(finishSwapReturn(state, 10 + SWAP_RETURN_BLUR_MS).openNetwork, true);

  state = armSwapReturn(0);
  assert.equal(expireSwapReturn(state, 700, true).armed, true);
  state = noteSwapHidden(state);
  assert.equal(finishSwapReturn(state, 700).openNetwork, true);
});

test("Mail's Chrome return opens Network only for that contact and attempt", () => {
  const memory = new Map<string, string>();
  const store = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
  };
  writeSwapHandoff(store, { contactId: "ada", attempt: "open-1" });
  assert.equal(swapWake({ mark: readSwapHandoffFrom(store), contactId: "ada", attempt: "open-1", left: true }), "network");
  clearSwapHandoff(store);
  assert.equal(readSwapHandoffFrom(store), null);
  writeSwapHandoff(store, { contactId: "ada", attempt: "open-1" });
  assert.equal(swapRestore(readSwapHandoffFrom(store), "ada", null), "network");
  clearSwapHandoff(store);
  assert.equal(readSwapHandoffFrom(store), null);
});

test("a cancelled open does not move the next contact's Swap", () => {
  const memory = new Map<string, string>();
  const store = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
  };
  writeSwapHandoff(store, { contactId: "ada", attempt: "open-1" });
  clearSwapHandoff(store);
  assert.equal(readSwapHandoffFrom(store), null);
  assert.equal(swapWake({ mark: null, contactId: "bea", attempt: null, left: true }), "stay");
  assert.equal(swapRestore(null, "bea", null), "stay");
  writeSwapHandoff(store, { contactId: "ada", attempt: "open-1" });
  const leftover = readSwapHandoffFrom(store);
  assert.equal(swapWake({ mark: leftover, contactId: "bea", attempt: "open-1", left: true }), "stay");
  assert.equal(swapRestore(leftover, "bea", null), "stay");
  assert.equal(swapWake({ mark: leftover, contactId: "ada", attempt: "open-2", left: true }), "stay");
});

test("the bottom of Swap is one action, and OK stays only until a channel is chosen", () => {
  assert.equal(swapFooter({ cardSelected: true, channel: null, ready: false, failed: false }), "leave");
  assert.equal(swapFooter({ cardSelected: false, channel: "telegram", ready: false, failed: false }), "need-card");
  assert.equal(swapFooter({ cardSelected: true, channel: "telegram", ready: false, failed: false }), "preparing");
  assert.equal(swapFooter({ cardSelected: true, channel: "telegram", ready: true, failed: false }), "telegram");
  assert.equal(swapFooter({ cardSelected: true, channel: "email", ready: true, failed: false }), "email");
  assert.equal(swapFooter({ cardSelected: true, channel: "whatsapp", ready: false, failed: true }), "retry");
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
  assert.equal(screen.includes("Copy message"), false);
  assert.equal(screen.includes("Use this name"), false);
  assert.match(screen, /visibilitychange/);
  assert.match(screen, /freeze/);
  assert.match(screen, /resume/);
  assert.match(screen, /event\.persisted/);
  assert.match(screen, /expireSwapReturn/);
  assert.match(screen, /router\.replace\("\/network"\)/);
  assert.match(screen, /Choose a portfolio\./);
  assert.match(screen, /swapFooter/);
  assert.match(screen, /contactId: contact\.id/);
  assert.match(screen, /swapHandoffMatches/);
  assert.match(screen, /forgetSwapHandoff/);
  assert.match(screen, /visibleDraft/);
  assert.match(screen, /keptSwapCard/);
  assert.match(screen, /draftStillCurrent/);
  assert.match(route, /name: portfolio\.name/);
  assert.equal(screen.includes("Already sent"), false);
  assert.equal(screen.includes("window.open"), false);
  assert.equal(screen.includes("preventDefault"), false);
  const deleted = readFileSync(new URL("../../../главный-экран/components/portfolio-delete.tsx", import.meta.url), "utf8");
  const main = readFileSync(new URL("../../app/main/page.tsx", import.meta.url), "utf8");
  const deck = readFileSync(new URL("../../../главный-экран/components/main-screen.tsx", import.meta.url), "utf8");
  assert.match(deleted, /router\.replace\("\/create\?account=1"\)/);
  assert.match(deleted, /forgetEditHold/);
  assert.match(main, /deviceWasRegistered\(\)/);
  assert.match(deck, /deviceWasRegistered\(\)/);
  assert.match(card, /ContactIdentityRow/);
  assert.equal(card.includes("size-[128px]"), false);
  assert.equal(card.includes("disabled={swapped}"), false);
  assert.equal(network.includes("menuContact.pushed"), false);
});
