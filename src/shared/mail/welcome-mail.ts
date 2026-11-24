/**
 * The welcome mail after a new account is created. One subject when a portfolio
 * was saved, another when it was not. The password is never in this letter.
 */

const FONT = "Arial, Helvetica, sans-serif";
const INK = "#111111";
const GREY = "#999999";
const RULE = "#999999";
const WIDTH = 480;
const TILE = 96;
const LOGO_W = 74;
const LOGO_H = Math.round((LOGO_W * 80) / 254);

export type WelcomeAccess = "password" | "google" | "apple";

export const ACCOUNT_WELCOME_SUBJECT = "Your ADED ME account is ready";
export const PORTFOLIO_WELCOME_SUBJECT = "Your portfolio is ready";

export const ACCOUNT_WELCOME_LINE = "Your account is ready. You can create your first portfolio in ADED ME.";
export const PORTFOLIO_WELCOME_LINE = "Your portfolio is ready. You can edit it and share it from ADED ME.";

export type WelcomeMailInput = {
  logoSrc: string;
  access: WelcomeAccess;
  /** True only when this account's portfolio was actually saved. */
  portfolio: boolean;
  /** `adedme.com` */
  siteLabel: string;
};

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function welcomeSubject(portfolio: boolean): string {
  return portfolio ? PORTFOLIO_WELCOME_SUBJECT : ACCOUNT_WELCOME_SUBJECT;
}

export function welcomeSignInLine(access: WelcomeAccess): string {
  if (access === "google") return "Use Continue with Google to sign in.";
  if (access === "apple") return "Use Continue with Apple to sign in.";
  return "Sign in with your email and password.";
}

export function welcomeMail(input: WelcomeMailInput): { subject: string; html: string; text: string } {
  const first = input.portfolio ? PORTFOLIO_WELCOME_LINE : ACCOUNT_WELCOME_LINE;
  const signIn = welcomeSignInLine(input.access);
  const footer = `ADED · ${input.siteLabel}`;
  const subject = welcomeSubject(input.portfolio);

  const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background:#ffffff;"><tr><td align="center" style="padding:24px 16px 32px;">
<table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:${WIDTH}px;max-width:100%;">
<tr><td style="padding:0 0 18px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="${TILE}" height="${TILE}" align="center" valign="middle" bgcolor="#ffffff" style="width:${TILE}px;height:${TILE}px;background:#ffffff;box-shadow:0 4px 18px rgba(0,0,0,.14);"><img src="${escape(input.logoSrc)}" width="${LOGO_W}" height="${LOGO_H}" alt="ADED" style="display:block;width:${LOGO_W}px;height:${LOGO_H}px;border:0;outline:none;" /></td>
<td valign="middle" style="padding-left:20px;font-family:${FONT};font-size:18px;line-height:1.35;font-weight:600;letter-spacing:-0.3px;color:${INK};">${escape(first)}</td>
</tr></table>
</td></tr>
<tr><td style="border-top:1px solid ${RULE};padding:14px 0 15px;font-family:${FONT};font-size:15.5px;line-height:1.4;color:${INK};">${escape(signIn)}</td></tr>
<tr><td style="border-top:1px solid ${RULE};padding:12px 0 0;font-family:${FONT};font-size:12px;line-height:1.45;color:${GREY};">${escape(footer)}</td></tr>
</table></td></tr></table>`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="color-scheme" content="light" /><meta name="format-detection" content="telephone=no,date=no,address=no,email=no" /></head>
<body style="margin:0;padding:0;background:#ffffff;">
${body}
</body></html>`;

  return { subject, html, text: [first, "", signIn, "", footer].join("\n") };
}
