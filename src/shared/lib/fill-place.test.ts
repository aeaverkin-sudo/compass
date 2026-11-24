import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  oauthPortfolioDraft,
  sameCreateDoor,
  type OAuthAttempt,
  type OAuthBind,
  type QuestionnairePlace,
} from "./fill-place.ts";

const ATTEMPT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NOW = 1_700_000_000_000;

function draft(href: string): QuestionnairePlace {
  return {
    kind: "questionnaire",
    at: NOW,
    href,
    name: "Ada",
    email: "ada@example.com",
    password: "secret-password",
    agreed: true,
    zones: [{ id: "about", title: "About", custom: false, rows: [{ key: "line", value: "Hello" }] }],
    headerKey: "about",
    editKey: null,
    editText: "note",
    seedId: null,
    seedText: "",
  };
}

function attempt(id: string, href: string, at = NOW): OAuthAttempt {
  return { id, href, at };
}

function bind(attemptId: string, userId: string, at = NOW): OAuthBind {
  return { attemptId, userId, at };
}

function restore(extra?: Partial<Parameters<typeof oauthPortfolioDraft>[0]>) {
  const saved = draft("/create?card=card-a");
  return oauthPortfolioDraft({
    saved,
    here: "/create?card=card-a&account=1&saved=1",
    attempt: attempt(ATTEMPT, saved.href),
    bind: bind(ATTEMPT, USER),
    sessionUserId: USER,
    confirmed: true,
    usedAttemptId: null,
    now: NOW,
    ...extra,
  });
}

test("parameter values keep their boundaries, and only account and saved may differ", () => {
  assert.equal(sameCreateDoor("/create?card=card-a", "/create?saved=1&account=1&card=card-a"), true);
  assert.equal(sameCreateDoor("/create?card=card-a", "/create?card=card-b&account=1"), false);
  assert.equal(sameCreateDoor("/create?event=one", "/create?event=two&account=1"), false);
  assert.equal(sameCreateDoor("/create?next=%2Fsave%2Fa", "/create?account=1&next=%2Fsave%2Fb"), false);
  assert.equal(sameCreateDoor("/create?card=one%26next%3Dtwo", "/create?card=one&next=two"), false);
  assert.equal(sameCreateDoor("/create?next=save%2Fa%26b", "/create?next=save%2Fa&b="), false);
});

test("the same attempt and confirmed account restore the typed portfolio and its photo", () => {
  const returned = restore();
  assert.ok(returned);
  assert.equal(returned.fields.name, "Ada");
  assert.equal(returned.fields.zones[0]?.rows[0]?.value, "Hello");
  assert.equal(returned.fields.editText, "note");
  assert.equal(returned.photoHref, "/create?card=card-a");
  assert.equal("email" in returned.fields, false);
  assert.equal("password" in returned.fields, false);
  assert.equal("agreed" in returned.fields, false);
  assert.equal(JSON.stringify(returned).includes("ada@example.com"), false);
  assert.equal(JSON.stringify(returned).includes("secret-password"), false);
});

test("another attempt, another account, or an unconfirmed account does not restore it", () => {
  const saved = draft("/create?card=card-a");
  const here = "/create?card=card-a&account=1";
  assert.equal(restore({ here, attempt: attempt(OTHER, saved.href) }), null);
  assert.equal(restore({ sessionUserId: OTHER }), null);
  assert.equal(restore({ bind: bind(ATTEMPT, OTHER) }), null);
  assert.equal(restore({ confirmed: false }), null);
  assert.equal(restore({ sessionUserId: null }), null);
  assert.equal(restore({ usedAttemptId: ATTEMPT }), null);
  assert.equal(restore({ bind: null }), null);
  assert.equal(restore({ attempt: null }), null);
  assert.equal(restore({ now: NOW + 11 * 60 * 1000 }), null);
});

test("cancel and a second open do not count as that return", () => {
  assert.equal(restore({ bind: null, here: "/create?card=card-a" }), null);
  const once = restore();
  assert.ok(once);
  assert.equal(restore({ usedAttemptId: ATTEMPT }), null);
});

test("sign-in binds the return to the confirmed account and does not create a portfolio", () => {
  const callback = readFileSync(new URL("../../app/auth/callback/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../../app/create/page.tsx", import.meta.url), "utf8");
  const screen = readFileSync(new URL("../../app/create/entry-page.tsx", import.meta.url), "utf8");
  const welcome = readFileSync(new URL("../services/cold-entry.ts", import.meta.url), "utf8");
  assert.equal(callback.includes("writeProviderPortfolio"), false);
  assert.equal(callback.includes("aded_oauth_from"), false);
  assert.match(callback, /aded_oauth_bind/);
  assert.match(callback, /email_confirmed_at/);
  assert.match(callback, /attemptId/);
  assert.match(callback, /userId: user\.id/);
  assert.match(screen, /confirmed/);
  assert.match(screen, /readUsedOAuthAttempt/);
  assert.match(screen, /markOAuthAttemptUsed/);
  assert.match(screen, /returned\.photoHref/);
  assert.equal(screen.includes("setEmail(returned"), false);
  assert.equal(page.includes("user_metadata"), false);
  assert.match(welcome, /welcome_mail_at/);
});
