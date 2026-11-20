import { labeledEntryLine } from "@/shared/services/card-zones";
import { detectContactType } from "@/shared/services/contact-item";
import { messengerPhoneDigits, messengerUsername } from "@/shared/services/portfolio-catalog";
import { telegramLink, whatsappLink } from "@/features/contact-collect/pushback";
import type { ExternalLine } from "@/features/contact-collect/types";

export type ViewLine = {
  key: string;
  label: string;
  href: string | null;
};

/** Finish a typed contact cell: lowercase email, Telegram axis for @nick. */
export function polishContactLine(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^telegram\s*\//i.test(trimmed)) return trimmed;
  const type = detectContactType(trimmed, "contact");
  if (type === "email") return trimmed.toLowerCase();
  if (type === "telegram") return labeledEntryLine(trimmed, type, "contact");
  return trimmed;
}

/** A full international number: leading + and phone type. */
export function isIntlPhone(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("+")) return false;
  return detectContactType(trimmed, "contact") === "phone";
}

/**
 * Rows for Contact view. A phone with marks becomes WhatsApp / +n and/or
 * Telegram / +n. An unmarked phone stays bare. @nick becomes Telegram / @nick.
 */
export function viewContactLines(lines: ExternalLine[]): ViewLine[] {
  const rows: ViewLine[] = [];
  lines.forEach((line, index) => {
    const value = line.value.trim();
    if (!value) return;
    const type = line.type || detectContactType(value, "contact");
    if (type === "phone" && value.startsWith("+")) {
      const digits = messengerPhoneDigits(value);
      const marks = line.flags ?? [];
      if (marks.includes("wa") && digits) {
        rows.push({
          key: `${index}-wa`,
          label: `WhatsApp / ${value}`,
          href: whatsappLink(digits, ""),
        });
      }
      if (marks.includes("tg") && digits) {
        rows.push({
          key: `${index}-tg`,
          label: `Telegram / ${value}`,
          href: `https://t.me/+${digits}`,
        });
      }
      if (!marks.includes("wa") && !marks.includes("tg")) {
        rows.push({
          key: `${index}-phone`,
          label: value,
          href: `tel:${value.replace(/\s/g, "")}`,
        });
      }
      return;
    }
    if (type === "telegram" || detectContactType(value, "contact") === "telegram") {
      const nick = messengerUsername(value) ?? value.replace(/^@/, "").trim();
      const label = labeledEntryLine(value.startsWith("@") ? value : `@${nick}`, "telegram", "contact");
      rows.push({
        key: `${index}-tg-nick`,
        label: label.startsWith("Telegram") ? label : `Telegram / @${nick}`,
        href: nick ? telegramLink(nick) : null,
      });
      return;
    }
    if (type === "email") {
      const address = value.toLowerCase();
      rows.push({ key: `${index}-email`, label: address, href: `mailto:${address}` });
      return;
    }
    rows.push({
      key: `${index}-line`,
      label: labeledEntryLine(value, type as never, "contact"),
      href: /^https?:\/\//i.test(value) ? value : null,
    });
  });
  return rows;
}
