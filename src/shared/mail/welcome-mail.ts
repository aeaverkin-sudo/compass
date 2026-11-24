/**
 * One welcome letter for Google, Apple, and email. Laid out like a portfolio:
 * the logo tile, a heading, numbered rows, and grey rules. No password, code,
 * or anyone else's card.
 */

const FONT = "Arial, Helvetica, sans-serif";
const INK = "#111111";
const GREY = "#999999";
const RULE = "#999999";
const WIDTH = 480;
const LABEL = 72;
const GAP = 12;
const TILE = 88;
const LOGO_W = 68;
const LOGO_H = Math.round((LOGO_W * 80) / 254);

export type WelcomeAccess = "password" | "google" | "apple";

export const WELCOME_SUBJECT = "Welcome to ADED ME";
export const ACCOUNT_HEADING = "Your account is ready.";
export const PORTFOLIO_HEADING = "Your portfolio is ready.";
export const WELCOME_FOOTER = "This is a one-time welcome email.";

const SHARED_LINES = [
  "Share it with a link or QR code.",
  "On iPhone, add your card to Apple Wallet.",
  "Collect contacts by typing, using your voice, or scanning a business card or badge.",
];

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

export function welcomeLines(portfolio: boolean): string[] {
  return [portfolio ? "Edit your portfolio anytime." : "Create your portfolio.", ...SHARED_LINES];
}

export function welcomeHeading(portfolio: boolean): string {
  return portfolio ? PORTFOLIO_HEADING : ACCOUNT_HEADING;
}

function rowHtml(line: string, index: number): string {
  const number = String(index + 1).padStart(2, "0");
  return `<tr><td style="border-top:1px solid ${RULE};padding:12px 0 13px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="${LABEL}" valign="top" style="width:${LABEL}px;font-family:${FONT};font-size:24px;line-height:1;letter-spacing:-0.03em;color:${INK};">${number}</td>
<td valign="top" style="padding-left:${GAP}px;font-family:${FONT};font-size:15.5px;line-height:1.4;color:${INK};">${escape(line)}</td>
</tr></table></td></tr>`;
}

export function welcomeMail(input: WelcomeMailInput): { subject: string; html: string; text: string } {
  const heading = welcomeHeading(input.portfolio);
  const lines = welcomeLines(input.portfolio);
  const text = [heading, "", ...lines.map((line, index) => `${String(index + 1).padStart(2, "0")} ${line}`), "", WELCOME_FOOTER].join("\n");

  const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background:#ffffff;"><tr><td align="center" style="padding:20px 16px 32px;">
<table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:${WIDTH}px;max-width:100%;">
<tr><td style="padding:0 0 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="${TILE}" height="${TILE}" align="center" valign="middle" bgcolor="#ffffff" style="width:${TILE}px;height:${TILE}px;background:#ffffff;box-shadow:0 4px 18px rgba(0,0,0,.14);"><img src="${escape(input.logoSrc)}" width="${LOGO_W}" height="${LOGO_H}" alt="ADED" style="display:block;width:${LOGO_W}px;height:${LOGO_H}px;border:0;outline:none;" /></td>
<td valign="middle" style="padding-left:20px;font-family:${FONT};font-size:21px;line-height:1.15;font-weight:600;letter-spacing:-0.5px;color:${INK};">${escape(heading)}</td>
</tr></table>
</td></tr>
${lines.map((line, index) => rowHtml(line, index)).join("\n")}
<tr><td style="border-top:1px solid ${RULE};padding:12px 0 0;font-family:${FONT};font-size:12px;line-height:1.45;color:${GREY};">${escape(WELCOME_FOOTER)}</td></tr>
</table></td></tr></table>`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="color-scheme" content="light" /><meta name="format-detection" content="telephone=no,date=no,address=no,email=no" /></head>
<body style="margin:0;padding:0;background:#ffffff;">
${body}
</body></html>`;

  return { subject: WELCOME_SUBJECT, html, text };
}
