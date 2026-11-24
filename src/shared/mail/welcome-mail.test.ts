import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_WELCOME_LINE,
  ACCOUNT_WELCOME_SUBJECT,
  PORTFOLIO_WELCOME_LINE,
  PORTFOLIO_WELCOME_SUBJECT,
  welcomeMail,
  welcomeSignInLine,
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

test("the subject follows the saved portfolio, not the sign-in method", () => {
  for (const access of ["password", "google", "apple"] as const) {
    const account = letter(false, access);
    const portfolio = letter(true, access);
    assert.equal(account.subject, ACCOUNT_WELCOME_SUBJECT);
    assert.equal(portfolio.subject, PORTFOLIO_WELCOME_SUBJECT);
    assert.match(account.text, new RegExp(`^${ACCOUNT_WELCOME_LINE}`));
    assert.match(portfolio.text, new RegExp(`^${PORTFOLIO_WELCOME_LINE}`));
    assert.equal(account.html.includes(ACCOUNT_WELCOME_LINE), true);
    assert.equal(portfolio.html.includes(PORTFOLIO_WELCOME_LINE), true);
  }
});

test("the sign-in line names the provider, and a password is never written", () => {
  const email = letter(false, "password");
  const google = letter(true, "google");
  const apple = letter(false, "apple");
  assert.equal(welcomeSignInLine("password"), "Sign in with your email and password.");
  assert.equal(welcomeSignInLine("google"), "Use Continue with Google to sign in.");
  assert.equal(welcomeSignInLine("apple"), "Use Continue with Apple to sign in.");
  assert.match(email.text, /Sign in with your email and password\./);
  assert.match(google.text, /Use Continue with Google to sign in\./);
  assert.match(apple.text, /Use Continue with Apple to sign in\./);
  for (const mail of [email, google, apple]) {
    assert.equal(mail.html.includes(SECRET), false);
    assert.equal(mail.text.includes(SECRET), false);
    assert.equal(/wallet/i.test(mail.text), false);
  }
  assert.equal(/share/i.test(email.text), false);
  assert.equal(/share/i.test(apple.text), false);
});
