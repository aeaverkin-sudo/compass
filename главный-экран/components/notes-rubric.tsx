"use client";

import { cn } from "@/lib/utils";
import { RULE_TOP } from "@/shared/lib/rule";
import type { NextScanAddon } from "@/shared/types";
import type { DeliveredNote } from "@/shared/services/notes-types";
import { orderNextScanAddons } from "@/shared/services/notes-order";
import { CARD_PHOTO_SIZE_PX } from "../layout";

/** ~20% smaller than the card photo, still a square crop. */
const SELFIE_PX = Math.round(CARD_PHOTO_SIZE_PX * 0.8);

type NoteView = {
  id: string;
  type: "text" | "selfie";
  text: string;
  mediaUrl: string;
  expired: boolean;
};

function fromOwner(addon: NextScanAddon): NoteView | null {
  if (addon.type !== "text" && addon.type !== "selfie") return null;
  const mediaUrl =
    addon.attachmentId && !addon.content.startsWith("data:") && !addon.content.startsWith("blob:")
      ? `/f/${addon.attachmentId}`
      : addon.content.startsWith("data:") || addon.content.startsWith("blob:")
        ? addon.content
        : addon.attachmentId
          ? `/f/${addon.attachmentId}`
          : "";
  return {
    id: addon.id,
    type: addon.type,
    text: addon.type === "text" ? addon.content : "",
    mediaUrl,
    expired: addon.type === "selfie" && !mediaUrl,
  };
}

function fromDelivered(note: DeliveredNote): NoteView | null {
  if (note.type !== "text" && note.type !== "selfie") return null;
  return {
    id: note.id,
    type: note.type,
    text: note.type === "text" ? note.content : "",
    mediaUrl: note.url,
    expired: note.expired || (note.type === "selfie" && !note.url),
  };
}

type NotesRubricProps = {
  ownerNotes?: NextScanAddon[];
  deliveredNotes?: DeliveredNote[];
  className?: string;
  pdfBlock?: boolean;
};

export function NotesRubric({ ownerNotes, deliveredNotes, className, pdfBlock = false }: NotesRubricProps) {
  const notes: NoteView[] = ownerNotes?.length
    ? orderNextScanAddons(ownerNotes).flatMap((addon) => {
        const view = fromOwner(addon);
        return view ? [view] : [];
      })
    : (deliveredNotes ?? []).flatMap((note) => {
        const view = fromDelivered(note);
        return view ? [view] : [];
      });

  if (notes.length === 0) return null;

  const typeLabel = (type: NoteView["type"]) => (type === "selfie" ? "Selfie" : "Text");

  return (
    <section className={cn("shrink-0 pt-6", className)} aria-label="Notes" data-pdf-block={pdfBlock ? "" : undefined}>
      <div aria-hidden className={RULE_TOP} />
      <p className="pt-3 text-[11px] leading-[1.45] font-normal tracking-[0.1em] whitespace-nowrap text-[#999] uppercase">
        Notes
      </p>
      <ul className="mt-3 flex flex-wrap items-start gap-5">
        {notes.map((note) => (
          <li key={note.id} className="min-w-0">
            <p className="mb-1.5 text-[11px] leading-[1.45] font-normal tracking-[0.1em] whitespace-nowrap text-[#999] uppercase">
              {typeLabel(note.type)}
            </p>
            {note.type === "selfie" ? (
              note.expired || !note.mediaUrl ? (
                <div
                  aria-hidden
                  className="bg-[#F0F0F0]"
                  style={{ width: SELFIE_PX, height: SELFIE_PX }}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={note.mediaUrl}
                  alt=""
                  className="object-cover"
                  style={{ width: SELFIE_PX, height: SELFIE_PX }}
                />
              )
            ) : null}
            {note.type === "text" ? (
              <p className="max-w-[10rem] text-[13px] leading-[1.35] font-normal tracking-[-0.015em] text-[#111]">
                {note.text}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
