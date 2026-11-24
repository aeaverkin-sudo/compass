import assert from "node:assert/strict";
import test from "node:test";
import { portfolioText, pushAddress, pushTargets, telegramLink } from "./pushback.ts";
import type { ExternalLine } from "./types.ts";

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

test("Telegram drafts use the saved number or nickname and preserve plain contact links", () => {
  for (const address of ["+447700900123", "sample_contact"]) {
    const url = new URL(telegramLink(address, draft));
    assert.equal(url.origin, "https://t.me");
    assert.equal(url.pathname, `/${address}`);
    assert.equal(url.searchParams.get("text"), draft);
  }
  assert.equal(telegramLink("sample_contact"), "https://t.me/sample_contact");
});
