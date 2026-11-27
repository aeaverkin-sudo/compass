import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  WELCOME_FOOTER,
  WELCOME_SUBJECT,
  signupCodeMail,
  signupTakenMail,
  welcomeHeading,
  welcomeLines,
  welcomeMail,
} from "./welcome-mail.ts";

const SECRET = "ABCD-2345";

function letter(portfolio: boolean, access: "password" | "google" | "apple") {
  return welcomeMail({
    logoSrc: "https://adedme.com/brand/aded-grid-mail.png",
    access,
    portfolio,
    siteLabel: "adedme.com",
  });
}

test("google, apple, and email get the same welcome, with or without a portfolio", () => {
  const account = letter(false, "google");
  for (const access of ["password", "google", "apple"] as const) {
    const ready = letter(false, access);
    const saved = letter(true, access);
    assert.equal(ready.subject, WELCOME_SUBJECT);
    assert.equal(saved.subject, WELCOME_SUBJECT);
    assert.equal(ready.text, account.text);
    assert.equal(ready.html, account.html);
    assert.equal(saved.text, letter(true, "password").text);
    assert.match(ready.text, new RegExp(`^${welcomeHeading(false)}`));
    assert.match(saved.text, new RegExp(`^${welcomeHeading(true)}`));
    for (const line of welcomeLines(false)) assert.equal(ready.html.includes(line), true);
    for (const line of welcomeLines(true)) assert.equal(saved.html.includes(line), true);
    assert.equal(ready.text.includes(WELCOME_FOOTER), true);
    assert.equal(saved.html.includes(WELCOME_FOOTER), true);
    assert.equal(ready.html.includes("aded-grid-mail.png"), true);
  }
  assert.equal(welcomeLines(true)[0], "Edit your portfolio anytime.");
  assert.equal(welcomeLines(false)[0], "Create your portfolio.");
  assert.deepEqual(welcomeLines(true).slice(1), welcomeLines(false).slice(1));
});

test("the welcome has no password, code, or another person's card", () => {
  for (const mail of [letter(false, "password"), letter(true, "apple"), letter(true, "google")]) {
    assert.equal(mail.html.includes(SECRET), false);
    assert.equal(mail.text.includes(SECRET), false);
    assert.equal(/password/i.test(mail.text), false);
    assert.equal(mail.text.includes("QR code"), true);
    assert.equal(mail.text.includes("privaterelay"), false);
  }
});

test("the signup code letter has the code, no link, and no password", () => {
  const mail = signupCodeMail({ logoSrc: "https://adedme.com/brand/aded-grid-mail.png", code: "100003" });
  assert.equal(mail.subject, "100003 is your ADED ME code");
  assert.equal(mail.text.startsWith("Welcome. Confirm your email."), true);
  assert.equal(mail.text.includes("Enter this code in ADED ME to finish creating your account."), true);
  assert.equal(mail.text.includes("This code expires in 30 minutes."), true);
  assert.equal(mail.text.includes("No account is created until the code is entered."), true);
  assert.equal(mail.html.includes("100003"), true);
  assert.equal(mail.html.includes("<a "), false);
  assert.equal(/password/i.test(mail.text), false);
  assert.equal(mail.html.includes("Confirm in browser"), false);
  const taken = signupTakenMail({ logoSrc: "https://adedme.com/brand/aded-grid-mail.png" });
  assert.equal(taken.subject, "You already have an ADED ME account");
  assert.equal(taken.html.includes("<a "), false);
  assert.equal(/\d{6}/.test(taken.text), false);
});

test("welcome is delivered once, and the mark is not written before acceptance", () => {
  const source = readFileSync(new URL("../services/cold-entry.ts", import.meta.url), "utf8");
  const once = readFileSync(new URL("./welcome-once.ts", import.meta.url), "utf8");
  assert.match(source, /deliverWelcome/);
  assert.match(source, /welcomeIdempotencyKey/);
  assert.match(source, /welcome_mail_at/);
  assert.ok(source.indexOf("sendHtmlMail") > 0);
  assert.match(once, /WELCOME_KEY_MS = 24 \* 60 \* 60 \* 1000/);
  assert.ok(once.indexOf("input.send") < once.indexOf("WELCOME_MAIL_AT]: new Date"));
  assert.match(source, /welcomeVariant/);
  assert.match(source, /appMetadataPatch/);
  const firstPortfolio = readFileSync(new URL("../../app/api/portfolio/first/route.ts", import.meta.url), "utf8");
  assert.equal(firstPortfolio.includes("sendWelcomeMail"), false);
});
