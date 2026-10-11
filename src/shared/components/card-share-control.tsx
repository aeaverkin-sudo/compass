"use client";

import { useLayoutEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Share } from "lucide-react";
import { cn } from "@/lib/utils";
import { flushNotesSync, releaseOwnerNotes } from "@/shared/services/notes-sync";
import { getNextScanAddons } from "@/shared/services/card-snapshot";
import { publicCardUrl } from "@/shared/services/public-card-url";
import { shareCardChoice, type CardShareChoice } from "@/shared/services/save-public-card-pdf";
import type { Card } from "@/shared/types";

const SHARE_CHOICES: { choice: CardShareChoice; label: string }[] = [
  { choice: "link", label: "Link" },
];

/** Owner share from the rail. The public card has no share control. */
export function useCardShare(card: Card) {
  const ownerNotesKey = getNextScanAddons(card)
    .map((note) => `${note.id}:${note.type}:${note.attachmentId ?? ""}:${note.content}`)
    .join("|");

  const primeShare = () => {
    flushNotesSync(card.id);
  };

  const handleShare = () => {
    const token = card.publicToken;
    if (!token) return;
    const title = card.displayName.trim() || "Portfolio";
    const hadNotes = ownerNotesKey.length > 0;
    void shareCardChoice({ title, url: publicCardUrl(card) }).then((sent) => {
      if (sent) {
        void fetch("/api/network/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: card.id }),
        });
      }
      if (!sent || !hadNotes) return;
      releaseOwnerNotes(card.id, "link", token);
    });
  };

  return { primeShare, handleShare };
}

export function CardShareControl({
  onShare,
  onPrepareShare,
  className,
}: {
  card: Card;
  onShare?: (choice: CardShareChoice) => void;
  onPrepareShare?: () => void;
  className?: string;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({ right: 0, top: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPlace({
      right: Math.max(0, window.innerWidth - rect.right),
      top: rect.bottom + 8,
    });
  }, [open]);

  const icon = <Share className="size-[16.1px]" strokeWidth={1} aria-hidden />;

  if (!onShare) {
    return <span className={cn("flex size-11 items-center justify-start text-current", className)}>{icon}</span>;
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) onPrepareShare?.();
      }}
    >
      <Dialog.Trigger asChild>
        <button
          ref={anchorRef}
          type="button"
          data-no-swipe
          aria-label="Share"
          onPointerDown={onPrepareShare}
          className={cn(
            "flex size-11 items-center justify-start text-current outline-none",
            className,
          )}
        >
          {icon}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[#111]/20" />
        <Dialog.Content
          aria-describedby={undefined}
          data-no-swipe
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="fixed z-40 flex w-max min-h-[77.6875px] min-w-[68.1875px] items-center justify-center border-0 bg-sky px-1.5 py-1 text-center text-[#111] shadow-none outline-none"
          style={{
            right: place.right,
            top: place.top,
            fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
          }}
        >
          <Dialog.Title className="sr-only">Share</Dialog.Title>
          <div className="flex flex-col items-center justify-center">
            {SHARE_CHOICES.map(({ choice, label }) => (
              <Dialog.Close asChild key={choice}>
                <button
                  type="button"
                  className="px-2.5 py-2 t-caps text-[var(--ink)] outline-none focus:outline-none focus-visible:outline-none"
                  onClick={() => onShare(choice)}
                >
                  {label}
                </button>
              </Dialog.Close>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
