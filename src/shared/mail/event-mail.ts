/**
 * One layout for every event mail: the zone grid of the cabinet and Profile.
 * Tables and inline styles only, so Gmail, Outlook and Apple Mail draw it the same.
 */

const FONT = "Arial, Helvetica, sans-serif";
const INK = "#111111";
const GREY = "#999999";
const RULE = "#999999";
const SKY = "#c5e8f7";
const WIDTH = 480;
const OUTER = 40;
const SIDE = 16;
const LABEL = 86;
const GAP = 14;
const AXIS = LABEL + GAP;
const POSTER_W = 300;
const POSTER_H = Math.round((POSTER_W * 404) / 286);
const LOGO_H = 24;
const LOGO_W = Math.round((LOGO_H * 54) / 17);

export type MailZone = { label: string; value: string; lead?: boolean };

export type EventMailInput = {
  /** The poster snapshot (portrait 286:404), a link to the same address as the button. */
  poster?: { src: string; alt: string; href: string } | null;
  zones: MailZone[];
  button?: { label: string; href: string } | null;
  footnote?: string | null;
  /** The last line above the signature, with an optional link after the text. */
  closing?: { text: string; link?: { label: string; href: string } } | null;
  /** The ADED logo and `Sent by ADED.` with the unsubscribe link; or the 48h mail's ADED line on top and a plain line. */
  footer: { logoSrc: string; unsubscribeHref: string | null } | { plain: string };
};

/** `body` is the inside of `<body>`: the cabinet preview sets it on the screen's own grid. */
export type RenderedMail = { html: string; text: string; body: string };

export type MailFrame = {
  /** 480 in the mail; "100%" fills the preview column. */
  width?: number | "100%";
  /** Space around the mail: 40 above and below, 16 at the sides. */
  outer?: { y: number; x: number };
  /** 300 in the mail; smaller in the cabinet preview. */
  posterWidth?: number;
};

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function zoneRow(zone: MailZone, first: boolean): string {
  const border = first ? "" : `border-top:1px solid ${RULE};`;
  const value = zone.lead
    ? `font-family:${FONT};font-size:26px;line-height:1.2;font-weight:600;letter-spacing:-0.5px;color:${INK};`
    : `font-family:${FONT};font-size:15.5px;line-height:1.45;color:${INK};`;
  return `<tr><td style="${border}padding:18px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="${LABEL}" valign="top" style="width:${LABEL}px;padding-top:${zone.lead ? 9 : 3}px;font-family:${FONT};font-size:11px;line-height:1.35;letter-spacing:0.1em;text-transform:uppercase;color:${GREY};">${escape(zone.label)}</td>
<td valign="top" style="padding-left:${GAP}px;${value}">${escape(zone.value)}</td>
</tr></table></td></tr>`;
}

function buttonRow(button: { label: string; href: string }, footnote: string | null | undefined): string {
  const note = footnote
    ? `<p style="margin:12px 0 0;font-family:${FONT};font-size:12px;line-height:1.45;color:${GREY};">${escape(footnote)}</p>`
    : "";
  return `<tr><td style="padding:0 0 24px ${LABEL + GAP}px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${SKY}" style="background:${SKY};">
<a href="${escape(button.href)}" style="display:inline-block;padding:11px 22px;font-family:${FONT};font-size:13px;line-height:1.2;letter-spacing:0.14em;text-transform:uppercase;color:${INK};text-decoration:none;">${escape(button.label)}</a>
</td></tr></table>${note}</td></tr>`;
}

const SENT = "Sent by ADED.";
const NOTE = `font-family:${FONT};font-size:12px;line-height:1.45;color:${GREY};`;

function footerRow(footer: EventMailInput["footer"]): string {
  if ("plain" in footer) return `<tr><td style="border-top:1px solid ${RULE};padding:18px 0 0;${NOTE}">${escape(footer.plain)}</td></tr>`;
  const unsubscribe = footer.unsubscribeHref
    ? ` <a href="${escape(footer.unsubscribeHref)}" style="color:${GREY};text-decoration:underline;">Unsubscribe</a> from this event's mail.`
    : "";
  return `<tr><td style="padding:8px 0 18px ${AXIS}px;"><img src="${escape(footer.logoSrc)}" width="${LOGO_W}" height="${LOGO_H}" alt="ADED" style="display:block;width:${LOGO_W}px;height:${LOGO_H}px;border:0;outline:none;" /></td></tr>
<tr><td style="border-top:1px solid ${RULE};padding:18px 0 0;${NOTE}">${SENT}${unsubscribe}</td></tr>`;
}

function footerText(footer: EventMailInput["footer"]): string {
  if ("plain" in footer) return footer.plain;
  return footer.unsubscribeHref ? `${SENT} Unsubscribe from this event's mail: ${footer.unsubscribeHref}` : SENT;
}

function posterRow(poster: NonNullable<EventMailInput["poster"]>, width = POSTER_W): string {
  const height = width === POSTER_W ? POSTER_H : Math.round((width * 404) / 286);
  return `<tr><td style="padding:0 0 24px ${AXIS}px;"><a href="${escape(poster.href)}" style="display:block;width:${width}px;max-width:100%;text-decoration:none;"><img src="${escape(poster.src)}" width="${width}" height="${height}" alt="${escape(poster.alt)}" style="display:block;width:${width}px;max-width:100%;height:auto;border:1px solid #e6e6e6;box-shadow:0 2px 12px rgba(0,0,0,.12);outline:none;" /></a></td></tr>`;
}

const MASTHEAD = `<tr><td style="padding:0 0 12px;font-family:${FONT};font-size:13px;line-height:1.2;letter-spacing:0.14em;text-transform:uppercase;color:${INK};">ADED</td></tr>`;

export function renderEventMail(input: EventMailInput, frame: MailFrame = {}): RenderedMail {
  const width = frame.width ?? WIDTH;
  const outer = frame.outer ?? { y: OUTER, x: SIDE };
  const widthAttr = width === "100%" ? "100%" : String(width);
  const widthStyle = width === "100%" ? "100%" : `${width}px`;
  const branded = !("plain" in input.footer);
  const top = input.poster ? posterRow(input.poster, frame.posterWidth) : branded ? "" : MASTHEAD;
  const zones = input.zones.map((zone, index) => zoneRow(zone, index === 0 && !input.poster)).join("\n");
  const button = input.button ? buttonRow(input.button, input.footnote) : "";
  const closingLink = input.closing?.link
    ? ` <a href="${escape(input.closing.link.href)}" style="color:${GREY};text-decoration:underline;">${escape(input.closing.link.label)}</a>`
    : "";
  const closing = input.closing
    ? `<tr><td style="padding:0 0 24px ${LABEL + GAP}px;${NOTE}">${escape(input.closing.text)}${closingLink}</td></tr>`
    : "";

  const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background:#ffffff;"><tr><td align="center" style="padding:${outer.y}px ${outer.x}px;">
<table role="presentation" width="${widthAttr}" cellpadding="0" cellspacing="0" border="0" style="width:${widthStyle};max-width:100%;">
${top}
${zones}
${button}
${closing}
${footerRow(input.footer)}
</table></td></tr></table>`;
  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="color-scheme" content="light" /><meta name="format-detection" content="telephone=no,date=no,address=no,email=no" /></head>
<body style="margin:0;padding:0;background:#ffffff;">
${body}
</body></html>`;

  const lines = branded ? [] : ["ADED", ""];
  for (const zone of input.zones) lines.push(`${zone.label}: ${zone.value}`);
  if (input.button) lines.push("", `${input.button.label}: ${input.button.href}`);
  if (input.footnote) lines.push(input.footnote);
  if (input.closing) {
    const link = input.closing.link ? ` ${input.closing.link.label}: ${input.closing.link.href}` : "";
    lines.push("", `${input.closing.text}${link}`);
  }
  lines.push("", footerText(input.footer));
  return { html, text: lines.join("\n"), body };
}
