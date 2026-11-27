import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

register(new URL("../../features/contact-collect/voice-reading.alias-hook.mjs", import.meta.url), pathToFileURL("./"));

const { hashCode } = await import("./email-code.ts");
const {
  MAIL_PER_EMAIL,
  MAIL_PER_IP,
  TRY_LATER,
  WAIT_MINUTE,
  judgeSignupCode,
  planSignupMail,
  signupMailStatus,
} = await import("./signup-code.ts");

const NOW = 1_700_000_000_000;
const CODE = "100003";

function plan(over: Partial<Parameters<typeof planSignupMail>[0]> = {}) {
  return planSignupMail({
    now: NOW,
    resend: false,
    taken: false,
    row: null,
    letters: 0,
    requests: 0,
    lastLetterAt: null,
    nextCode: CODE,
    ...over,
  });
}

test("a new address and a taken address get the same success", () => {
  const fresh = plan();
  const taken = plan({ taken: true });
  assert.equal(fresh.kind, "code");
  assert.equal(taken.kind, "taken");
  assert.deepEqual(signupMailStatus(fresh), signupMailStatus(taken));
  assert.equal(signupMailStatus(fresh).status, 200);
});

test("a live code is not sent again until resend", () => {
  const quiet = plan({ row: { expiresAt: NOW + 60_000 } });
  assert.equal(quiet.kind, "quiet");
  assert.equal(signupMailStatus(quiet).status, 200);
  const again = plan({ resend: true, row: { expiresAt: NOW + 60_000 }, lastLetterAt: NOW - 61_000 });
  assert.equal(again.kind, "code");
});

test("a resend before a minute is refused", () => {
  const early = plan({ resend: true, lastLetterAt: NOW - 30_000 });
  assert.deepEqual(early, { kind: "limited", error: WAIT_MINUTE });
  assert.equal(signupMailStatus(early).status, 429);
});

test("the sixth letter in an hour is refused", () => {
  const sixth = plan({
    resend: true,
    letters: MAIL_PER_EMAIL,
    lastLetterAt: NOW - 61_000,
  });
  assert.deepEqual(sixth, { kind: "limited", error: TRY_LATER });
  const fifth = plan({ letters: MAIL_PER_EMAIL - 1 });
  assert.equal(fifth.kind, "code");
});

test("the twenty-first request from one address is refused", () => {
  const blocked = plan({ requests: MAIL_PER_IP, row: { expiresAt: NOW + 60_000 } });
  assert.deepEqual(blocked, { kind: "limited", error: TRY_LATER });
});

test("a wrong code does not pass, and a right code passes once", () => {
  const row = { hash: hashCode(CODE), expiresAt: NOW + 60_000, attempts: 0 };
  assert.equal(judgeSignupCode({ now: NOW, code: "100004", row }), "wrong");
  assert.equal(judgeSignupCode({ now: NOW, code: CODE, row }), "ok");
  assert.equal(judgeSignupCode({ now: NOW, code: CODE, row: null }), "missing");
  assert.equal(judgeSignupCode({ now: NOW, code: CODE, row: { ...row, expiresAt: NOW - 1 } }), "expired");
  assert.equal(judgeSignupCode({ now: NOW, code: CODE, row: { ...row, attempts: 8 } }), "limited");
});

test("the account is created only after the code, and the code request has no password", () => {
  const route = readFileSync(new URL("../../app/api/signup/route.ts", import.meta.url), "utf8");
  const ask = readFileSync(new URL("../../app/api/signup/code/route.ts", import.meta.url), "utf8");
  const store = readFileSync(new URL("./email-signup.ts", import.meta.url), "utf8");
  assert.ok(route.indexOf("verifySignupCode") < route.indexOf("createSignup"));
  assert.equal(ask.includes("password"), false);
  assert.equal(/from\("email_signup_codes"\)[\s\S]{0,500}password/.test(store), false);
  assert.equal(store.includes("beginSignupCode"), true);
});
