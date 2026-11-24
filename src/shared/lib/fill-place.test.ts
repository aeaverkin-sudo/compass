import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  oauthPortfolioDraft,
  portfolioFields,
  sameCreateDoor,
  type QuestionnairePlace,
} from "./fill-place.ts";

function draft(href: string, extra?: Partial<QuestionnairePlace>): QuestionnairePlace {
  return {
    kind: "questionnaire",
    at: 1,
    href,
    name: "Ada",
    email: "ada@example.com",
    password: "secret-password",
    agreed: true,
    zones: [{ id: "about", title: "About", custom: false, rows: [{ key: "line", value: "Hello" }] }],
    headerKey: null,
    editKey: null,
    editText: "",
    seedId: null,
    seedText: "",
    ...extra,
  };
}

test("account and saved do not by themselves open another door", () => {
  assert.equal(sameCreateDoor("/create", "/create?account=1"), true);
  assert.equal(sameCreateDoor("/create", "/create?account=1&saved=1"), true);
  assert.equal(sameCreateDoor("/create?card=card-a", "/create?saved=1&account=1&card=card-a"), true);
  assert.equal(sameCreateDoor("/create?card=card-a", "/create?card=card-b&account=1"), false);
  assert.equal(sameCreateDoor("/create?event=one", "/create?event=two&account=1"), false);
  assert.equal(sameCreateDoor("/create?next=%2Fsave%2Fa", "/create?account=1&next=%2Fsave%2Fb"), false);
  assert.equal(sameCreateDoor("/create?email=ada@example.com", "/create?account=1"), false);
});

test("a provider return restores the typed portfolio only for the same attempt", () => {
  const saved = draft("/create?card=card-a");
  const here = "/create?card=card-a&account=1&saved=1";
  const returned = oauthPortfolioDraft({
    saved,
    here,
    attemptHref: "/create?card=card-a",
    resume: true,
  });
  assert.ok(returned);
  const typed = portfolioFields(returned);
  assert.equal(typed.name, "Ada");
  assert.equal(typed.zones[0]?.rows[0]?.value, "Hello");
  assert.equal("email" in typed, false);
  assert.equal("password" in typed, false);
  assert.equal("agreed" in typed, false);
  assert.equal(
    oauthPortfolioDraft({ saved, here, attemptHref: "/create?card=card-a", resume: false }),
    null,
  );
  assert.equal(
    oauthPortfolioDraft({ saved, here: "/create?account=1", attemptHref: null, resume: true }),
    null,
  );
  assert.equal(
    oauthPortfolioDraft({
      saved,
      here: "/create?card=card-b&account=1",
      attemptHref: "/create?card=card-a",
      resume: true,
    }),
    null,
  );
});

test("sign-in does not create a portfolio or copy a provider name", () => {
  const callback = readFileSync(new URL("../../app/auth/callback/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../../app/create/page.tsx", import.meta.url), "utf8");
  const welcome = readFileSync(new URL("../services/cold-entry.ts", import.meta.url), "utf8");
  const signup = readFileSync(new URL("../services/signup.ts", import.meta.url), "utf8");
  assert.equal(callback.includes("writeProviderPortfolio"), false);
  assert.equal(callback.includes("providerName"), false);
  assert.equal(callback.includes("user_metadata"), false);
  assert.match(callback, /aded_oauth_from/);
  assert.match(callback, /keepScannedCard/);
  assert.match(callback, /sendWelcomeMail\(user\.id, origin, access, landing\.portfolio\)/);
  assert.match(callback, /portfolio: false/);
  assert.equal(page.includes("user_metadata"), false);
  assert.equal(page.includes("full_name"), false);
  assert.match(welcome, /if \(!user \|\| !email \|\| user\.app_metadata\?\.\[WELCOME_SENT\]\) return false/);
  assert.match(signup, /sendWelcomeMail\(userId, origin, "password", false\)/);
  assert.equal(signup.includes("writeFirstPortfolio"), true);
});
