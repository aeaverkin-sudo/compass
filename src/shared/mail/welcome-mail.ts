/**
 * The welcome mail after the account is created: the logo tile and the thanks on top,
 * then four numbered rows. Tables and inline styles only, so mail clients draw it the same.
 */

const FONT = "Arial, Helvetica, sans-serif";
const INK = "#111111";
const GREY = "#999999";
const RULE = "#999999";
const WIDTH = 480;
const LABEL = 76;
const GAP = 12;
const AXIS = LABEL + GAP;
const TILE = 96;
const LOGO_W = 74;
const LOGO_H = Math.round((LOGO_W * 80) / 254);

export type WelcomeMailInput = {
  logoSrc: string;
  password: string;
  /** A Google or Apple account has no password. The first row says how to come back. */
  access?: "password" | "google" | "apple";
  /** `adedme.com` */
  siteLabel: string;
};

type Part = string | { text: string; href: string };
type Row = { label: string; value: Part[] };

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function partHtml(part: Part): string {
  if (typeof part === "string") return escape(part);
  return `<a href="${escape(part.href)}" style="color:${INK};text-decoration:none;border-bottom:1px solid ${GREY};">${escape(part.text)}</a>`;
}

function partText(part: Part): string {
  return typeof part === "string" ? part : `${part.text} (${part.href})`;
}

function rowHtml(row: Row, index: number): string {
  const number = String(index + 1).padStart(2, "0");
  return `<tr><td style="border-top:1px solid ${RULE};padding:14px 0 15px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="${LABEL}" valign="top" style="width:${LABEL}px;">
<div style="font-family:${FONT};font-size:26px;line-height:1;letter-spacing:-0.03em;color:${INK};">${number}</div>
<div style="margin-top:4px;font-family:${FONT};font-size:11px;line-height:1.35;letter-spacing:0.1em;text-transform:uppercase;color:${GREY};">${escape(row.label)}</div>
</td>
<td valign="top" style="padding-left:${GAP}px;font-family:${FONT};font-size:15.5px;line-height:1.4;color:${INK};">${row.value.map(partHtml).join("")}</td>
</tr></table></td></tr>`;
}

export const WELCOME_SUBJECT = "Your portfolio is ready";

export function welcomeMail(input: WelcomeMailInput): { html: string; text: string } {
  const rows: Row[] = [
    input.access === "google"
      ? { label: "Sign in", value: ["With Google — tap Continue with Google on adedme.com."] }
      : input.access === "apple"
        ? { label: "Sign in", value: ["With Apple — tap Continue with Apple on adedme.com."] }
        : { label: "Password", value: [`${input.password} — change it anytime in Profile.`] },
    { label: "Wallet", value: ["Add your portfolio to Apple Wallet."] },
    { label: "Portfolio", value: ["Share it with everyone you meet. Up to 3 portfolios from one library."] },
    { label: "App", value: ["Save it as an app: in Safari tap Share → Add to Home Screen."] },
  ];
  const footer = `ADED · ${input.siteLabel}`;

  const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background:#ffffff;"><tr><td align="center" style="padding:24px 16px 32px;">
<table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:${WIDTH}px;max-width:100%;">
<tr><td style="padding:0 0 18px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="${TILE}" height="${TILE}" align="center" valign="middle" bgcolor="#ffffff" style="width:${TILE}px;height:${TILE}px;background:#ffffff;box-shadow:0 4px 18px rgba(0,0,0,.14);"><img src="${escape(input.logoSrc)}" width="${LOGO_W}" height="${LOGO_H}" alt="ADED" style="display:block;width:${LOGO_W}px;height:${LOGO_H}px;border:0;outline:none;" /></td>
<td valign="middle" style="padding-left:20px;font-family:${FONT};font-size:23px;line-height:1.15;font-weight:600;letter-spacing:-0.5px;color:${INK};">Thank you —<br />your portfolio is ready.</td>
</tr></table>
</td></tr>
${rows.map((row, index) => rowHtml(row, index)).join("\n")}
<tr><td style="border-top:1px solid ${RULE};padding:12px 0 0 ${AXIS}px;font-family:${FONT};font-size:12px;line-height:1.45;color:${GREY};">${escape(footer)}</td></tr>
</table></td></tr></table>`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="color-scheme" content="light" /><meta name="format-detection" content="telephone=no,date=no,address=no,email=no" /></head>
<body style="margin:0;padding:0;background:#ffffff;">
${body}
</body></html>`;

  const lines = ["Thank you — your portfolio is ready.", ""];
  rows.forEach((row, index) => {
    lines.push(`${String(index + 1).padStart(2, "0")} ${row.label}: ${row.value.map(partText).join("")}`);
  });
  lines.push("", footer);
  return { html, text: lines.join("\n") };
}
