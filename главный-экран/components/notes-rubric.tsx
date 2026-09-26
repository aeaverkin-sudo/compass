"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { NextScanAddon } from "@/shared/types";
import type { DeliveredNote } from "@/shared/services/notes-types";
import { orderNextScanAddons } from "@/shared/services/notes-order";
import { CARD_PHOTO_SIZE_PX } from "../layout";

/** ~20% smaller than the card photo, still a square crop. */
const SELFIE_PX = Math.round(CARD_PHOTO_SIZE_PX * 0.8);

type NoteView = {
  id: string;
  type: NextScanAddon["type"];
  text: string;
  mediaUrl: string;
  expired: boolean;
};

function fromOwner(addon: NextScanAddon): NoteView {
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
    expired: addon.type !== "text" && !mediaUrl,
  };
}

function fromDelivered(note: DeliveredNote): NoteView {
  return {
    id: note.id,
    type: note.type,
    text: note.type === "text" ? note.content : "",
    mediaUrl: note.url,
    expired: note.expired || (note.type !== "text" && !note.url),
  };
}

type NotesRubricProps = {
  ownerNotes?: NextScanAddon[];
  deliveredNotes?: DeliveredNote[];
  className?: string;
};

function VoiceListen({ note }: { note: NoteView }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  if (note.expired || !note.mediaUrl) {
    return (
      <button
        type="button"
        disabled
        className="border-b-[0.5px] border-[#D0D0D0] pb-px text-[13px] leading-[1.35] font-normal tracking-[-0.015em] text-[#999]"
      >
        Listen
      </button>
    );
  }

  return (
    <button
      type="button"
      data-card-content
      data-no-swipe
      onClick={() => {
        if (playing) {
          audioRef.current?.pause();
          audioRef.current = null;
          setPlaying(false);
          return;
        }
        const audio = new Audio(note.mediaUrl);
        audioRef.current = audio;
        audio.onended = () => {
          setPlaying(false);
          audioRef.current = null;
        };
        setPlaying(true);
        void audio.play().catch(() => {
          setPlaying(false);
          audioRef.current = null;
        });
      }}
      className={cn(
        "border-b-[0.5px] border-[#111] pb-px text-[13px] leading-[1.35] font-normal tracking-[-0.015em] text-[#111]",
        playing && "text-[#E8640C]",
      )}
    >
      {playing ? "Playing…" : "Listen"}
    </button>
  );
}

export function NotesRubric({ ownerNotes, deliveredNotes, className }: NotesRubricProps) {
  const notes: NoteView[] = ownerNotes?.length
    ? orderNextScanAddons(ownerNotes).map(fromOwner)
    : (deliveredNotes ?? []).map(fromDelivered);

  if (notes.length === 0) return null;

  return (
    <section className={cn("shrink-0 pt-6", className)} aria-label="Notes">
      <div aria-hidden className="h-px bg-[#111]" />
      <p className="pt-3 text-[11px] font-light leading-none tracking-[0.1em] text-[#777] uppercase">
        Notes
      </p>
      <ul className="mt-3 flex flex-wrap items-start gap-4">
        {notes.map((note) => (
          <li key={note.id} className="min-w-0">
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
            {note.type === "voice" ? <VoiceListen note={note} /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
