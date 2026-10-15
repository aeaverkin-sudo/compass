import type { ContactType } from "@/shared/types";
import { isAttachmentType } from "@/shared/services/portfolio-limits";

/**
 * One line per owner: the same stored file, or the same words of one text type in any case.
 * A file without a stored copy has no key: two photos may share a file name.
 * Matches the unique indexes in `docs/phaseN-items-dedup.sql`.
 */
export function itemContentKey(type: string, value: string, attachmentId: string | null | undefined): string | null {
  if (attachmentId) return `file:${attachmentId}`;
  if (isAttachmentType(type as ContactType)) return null;
  const line = value.replace(/\s+/g, " ").trim().toLowerCase();
  return line ? `${type}:${line}` : null;
}
