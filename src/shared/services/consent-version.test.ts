import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONSENT_VERSION, PRIVACY_VERSION, TERMS_VERSION, isOlderConsent } from "./consent.ts";

test("a first registration, an accepted 1.5, and an accepted 1.6 each get the right plaque", () => {
  assert.equal(TERMS_VERSION, "1.6");
  assert.equal(PRIVACY_VERSION, "1.7");
  assert.equal(CONSENT_VERSION, "1.6");
  assert.equal(isOlderConsent(null, CONSENT_VERSION), false);
  assert.equal(isOlderConsent("", CONSENT_VERSION), false);
  assert.equal(isOlderConsent("1.5", CONSENT_VERSION), true);
  assert.equal(isOlderConsent("1.6", CONSENT_VERSION), false);
  assert.equal(isOlderConsent("1.6.1", CONSENT_VERSION), false);
});

test("sign-in writes the current version once and does not rewrite an older acceptance", () => {
  const signup = readFileSync(new URL("./signup.ts", import.meta.url), "utf8");
  const callback = readFileSync(new URL("../../app/auth/callback/route.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("./consent-client.ts", import.meta.url), "utf8");
  for (const source of [signup, callback, client]) {
    assert.match(source, /document_version: CONSENT_VERSION/);
    assert.doesNotMatch(source, /document_version:\s*"1\.[0-9]+"/);
  }
  assert.match(callback, /if \(existing\.data\) return/);
});
