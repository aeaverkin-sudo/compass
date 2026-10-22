/**
 * The welcome mail after Create my profile, laid out like the card: the logo tile and the thanks on top,
 * numbered rows with grey rules, two buttons on the value axis.
 * Tables and inline styles only, so Gmail, Outlook and Apple Mail draw it the same.
 */

const FONT = "Arial, Helvetica, sans-serif";
const INK = "#111111";
const GREY = "#999999";
const RULE = "#999999";
const SKY = "#c5e8f7";
const WIDTH = 480;
const LABEL = 86;
const GAP = 14;
const AXIS = LABEL + GAP;
const TILE = 124;
const LOGO_W = 96;
const LOGO_H = Math.round((LOGO_W * 80) / 254);

export type WelcomeMailInput = {
  logoSrc: string;
  password: string;
  /** `https://adedme.com/@handle` */
  profileUrl: string;
  /** The signed Wallet page: it checks whether the card is already in Wallet. */
  walletSectionUrl: string;
  /** Same page as the Wallet line. The button label stays Add. */
  walletPassUrl: string;
  /** Profile itself. */
  accountUrl: string;
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
  return `<tr><td style="border-top:1px solid ${RULE};padding:22px 0 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="${LABEL}" valign="top" style="width:${LABEL}px;">
<div style="font-family:${FONT};font-size:32px;line-height:1;letter-spacing:-0.03em;color:${INK};">${number}</div>
<div style="margin-top:6px;font-family:${FONT};font-size:11px;line-height:1.35;letter-spacing:0.1em;text-transform:uppercase;color:${GREY};">${escape(row.label)}</div>
</td>
<td valign="top" style="padding-left:${GAP}px;font-family:${FONT};font-size:15.5px;line-height:1.45;color:${INK};">${row.value.map(partHtml).join("")}</td>
</tr></table></td></tr>`;
}

function skyButton(button: { label: string; href: string }, top: number): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:${top}px;"><tr><td bgcolor="${SKY}" style="background:${SKY};">
<a href="${escape(button.href)}" style="display:inline-block;padding:11px 22px;font-family:${FONT};font-size:13px;line-height:1.2;letter-spacing:0.14em;text-transform:uppercase;color:${INK};text-decoration:none;">${escape(button.label)}</a>
</td></tr></table>`;
}

export const WELCOME_SUBJECT = "Your portfolio is ready";

export function welcomeMail(input: WelcomeMailInput): { html: string; text: string } {
  const profileLabel = input.profileUrl.replace(/^https?:\/\//, "");
  const rows: Row[] = [
    { label: "Password", value: [`${input.password} — change it anytime in Profile.`] },
    { label: "Profile", value: [{ text: profileLabel, href: input.profileUrl }] },
    { label: "Wallet", value: ["Add your card to ", { text: "Apple Wallet", href: input.walletSectionUrl }, "."] },
    { label: "Portfolio", value: ["Share it with everyone you meet. Build up to 3 portfolios from one library."] },
    { label: "App", value: ["Save it as an app — open the link in Safari, tap Share, then “Add to Home Screen”."] },
  ];
  const buttons = [
    { label: "Open my profile", href: input.accountUrl },
    { label: "Add to Apple Wallet", href: input.walletPassUrl },
  ];
  const footer = `ADED · ${input.siteLabel}`;

  const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background:#ffffff;"><tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:${WIDTH}px;max-width:100%;">
<tr><td style="padding:0 0 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="${TILE}" height="${TILE}" align="center" valign="middle" bgcolor="#ffffff" style="width:${TILE}px;height:${TILE}px;background:#ffffff;box-shadow:0 4px 18px rgba(0,0,0,.14);"><img src="${escape(input.logoSrc)}" width="${LOGO_W}" height="${LOGO_H}" alt="ADED" style="display:block;width:${LOGO_W}px;height:${LOGO_H}px;border:0;outline:none;" /></td>
<td valign="middle" style="padding-left:20px;font-family:${FONT};font-size:26px;line-height:1.15;font-weight:600;letter-spacing:-0.5px;color:${INK};">Thank you —<br />your portfolio<br />is ready.</td>
</tr></table></td></tr>
${rows.map(rowHtml).join("\n")}
<tr><td style="border-top:1px solid ${RULE};padding:26px 0 30px ${AXIS}px;">
${buttons.map((button, index) => skyButton(button, index === 0 ? 0 : 10)).join("\n")}
</td></tr>
<tr><td style="border-top:1px solid ${RULE};padding:18px 0 0 ${AXIS}px;font-family:${FONT};font-size:12px;line-height:1.45;color:${GREY};">${escape(footer)}</td></tr>
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
  lines.push("", ...buttons.map((button) => `${button.label}: ${button.href}`), "", footer);
  return { html, text: lines.join("\n") };
}
