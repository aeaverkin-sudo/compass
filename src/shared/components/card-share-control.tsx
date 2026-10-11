"use client";

import { useLayoutEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Share } from "lucide-react";
import { cn } from "@/lib/utils";
import { flushNotesSync, releaseOwnerNotes } from "@/shared/services/notes-sync";
import { getNextScanAddons } from "@/shared/services/card-snapshot";
import { publicCardShareUrl } from "@/shared/services/public-card-url";
import { shareCardChoice, type CardShareChoice } from "@/shared/services/save-public-card-pdf";
import type { Card } from "@/shared/types";

const SHARE_CHOICES: { choice: CardShareChoice; label: string }[] = [
  { choice: "link", label: "Link" },
];

const RAIL_POPUP_GAP_PX = 8;

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
    void shareCardChoice({ title, url: publicCardShareUrl(card) }).then((sent) => {
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

function placeAgainstRail(anchor: HTMLElement | null) {
  if (!anchor) return { right: 0, top: 0 };
  const rect = anchor.getBoundingClientRect();
  const rail = anchor.closest("[data-side-rail]");
  const railLeft = rail?.getBoundingClientRect().left ?? rect.left;
  return {
    right: Math.max(0, window.innerWidth - railLeft),
    top: rect.bottom + RAIL_POPUP_GAP_PX,
  };
}

export function CardShareControl({
  onShare,
  onPrepareShare,
  size = 16.2,
  stroke = 0.9,
  className,
}: {
  card: Card;
  onShare?: (choice: CardShareChoice) => void;
  onPrepareShare?: () => void;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({ right: 0, top: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => setPlace(placeAgainstRail(anchorRef.current));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  const icon = <Share size={size} strokeWidth={stroke} aria-hidden />;

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
        <Dialog.Overlay className="fixed inset-0 z-40 bg-transparent" />
        <Dialog.Content
          aria-describedby={undefined}
          data-no-swipe
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="fixed z-50 flex w-max min-h-[77.6875px] min-w-[68.1875px] items-center justify-center border-0 bg-sky px-1.5 py-1 text-center text-[var(--ink)] shadow-none outline-none"
          style={{
            right: place.right,
            top: place.top,
          }}
        >
          <Dialog.Title className="sr-only">Share</Dialog.Title>
          <div className="flex flex-col items-center justify-center">
            {SHARE_CHOICES.map(({ choice, label }) => (
              <Dialog.Close asChild key={choice}>
                <button
                  type="button"
                  className="flex w-full items-center px-3 py-2.5 text-left t-meta text-[var(--ink)] outline-none focus:outline-none focus-visible:outline-none"
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
