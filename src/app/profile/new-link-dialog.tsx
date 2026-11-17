"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cardInWallet } from "@/shared/lib/wallet-client";

/** A new code for this portfolio. No, or a tap outside, leaves the link as it is. */
export function NewLinkDialog({
  cardId,
  open,
  busy,
  onYes,
  onClose,
}: {
  cardId: string;
  open: boolean;
  busy: boolean;
  onYes: () => void;
  onClose: () => void;
}) {
  const [walletCardId, setWalletCardId] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void cardInWallet(cardId).then((added) => {
      if (!live) return;
      setWalletCardId(added === true ? cardId : null);
    });
    return () => {
      live = false;
    };
  }, [open, cardId]);
  const inWallet = walletCardId === cardId;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next || busy) return;
        onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-transparent" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-max max-w-[min(100%-48px,280px)] -translate-x-1/2 -translate-y-1/2 bg-sky px-5 py-4 text-center outline-none">
          <Dialog.Title className="t-body text-[var(--ink)]">Create a new link?</Dialog.Title>
          <Dialog.Description className="mt-2 t-meta text-[var(--grey)]">
            Old links and QR codes will stop working.
          </Dialog.Description>
          <p className="mt-2 mb-0 t-meta text-[var(--grey)]">People who saved your portfolio in Network can still see it.</p>
          {inWallet ? (
            <p className="mt-2 mb-0 t-meta text-[var(--grey)]">Apple Wallet: Remove and re-add your card.</p>
          ) : null}
          <div className="mt-3 flex justify-center gap-6">
            <button
              type="button"
              disabled={busy}
              className="t-body text-[var(--ink)] disabled:text-[var(--grey)]"
              onClick={onYes}
            >
              Yes
            </button>
            <button type="button" disabled={busy} className="t-body text-[var(--grey)]" onClick={onClose}>
              No
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
