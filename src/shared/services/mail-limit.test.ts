import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { mailLimitKey, renderClientIp } from "./mail-limit.ts";

const SECRET = "test-mail-secret";

function withSecret(run: () => void) {
  const previous = process.env.MAIL_HASH_SECRET;
  process.env.MAIL_HASH_SECRET = SECRET;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.MAIL_HASH_SECRET;
    else process.env.MAIL_HASH_SECRET = previous;
  }
}

test("the address key is an hmac, not a bare hash", () => {
  withSecret(() => {
    const email = mailLimitKey("email", "person@example.com");
    const bare = createHash("sha256").update("person@example.com").digest("hex");
    assert.equal(email === bare, false);
    assert.equal(email, mailLimitKey("email", "person@example.com"));
    assert.equal(email === mailLimitKey("ip", "person@example.com"), false);
    process.env.MAIL_HASH_SECRET = "other-test-secret";
    assert.equal(email === mailLimitKey("email", "person@example.com"), false);
  });
});

test("a missing mail secret does not fall back to a bare hash", () => {
  const previous = process.env.MAIL_HASH_SECRET;
  delete process.env.MAIL_HASH_SECRET;
  try {
    assert.throws(() => mailLimitKey("ip", "203.0.113.8"), /mail_hash_secret/);
  } finally {
    if (previous === undefined) delete process.env.MAIL_HASH_SECRET;
    else process.env.MAIL_HASH_SECRET = previous;
  }
});

test("the limit uses the edge address, not the first forwarded value", () => {
  const headers = (map: Record<string, string>) => ({
    headers: { get: (name: string) => map[name.toLowerCase()] ?? null },
  });
  assert.equal(
    renderClientIp(headers({ "cf-connecting-ip": "203.0.113.8", "x-forwarded-for": "198.51.100.9, 203.0.113.8" })),
    "203.0.113.8",
  );
  assert.equal(renderClientIp(headers({ "x-forwarded-for": "198.51.100.9" })), "unknown");
  assert.equal(renderClientIp(headers({ "cf-connecting-ip": "198.51.100.9, 203.0.113.8" })), "unknown");
  assert.equal(renderClientIp(headers({ "cf-connecting-ip": "2001:db8::8" })), "2001:db8::8");

  const ask = readFileSync(new URL("../../app/api/signup/code/route.ts", import.meta.url), "utf8");
  const reset = readFileSync(new URL("../../app/api/auth/email/reset/route.ts", import.meta.url), "utf8");
  const store = readFileSync(new URL("./email-signup.ts", import.meta.url), "utf8");
  assert.equal(ask.includes("renderClientIp"), true);
  assert.equal(reset.includes("renderClientIp"), true);
  assert.equal(ask.includes("x-forwarded-for"), false);
  assert.equal(reset.includes("x-forwarded-for"), false);
  assert.equal(ask.includes("requestIp"), false);
  assert.equal(reset.includes("requestIp"), false);
  assert.equal(store.includes("hashCode(email)"), false);
  assert.equal(store.includes("hashCode(ip)"), false);
  assert.equal(store.includes("mailLimitKey"), true);
});
