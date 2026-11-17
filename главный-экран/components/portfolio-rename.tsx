"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cardInWallet } from "@/shared/lib/wallet-client";

/** Shown when a portfolio that already has a link is renamed. Tap outside restores the name. */
export function PortfolioRenameDialog({
  cardId,
  open,
  onYes,
  onNo,
  onCancel,
}: {
  cardId: string;
  open: boolean;
  onYes: () => void;
  onNo: () => void;
  onCancel: () => void;
}) {
  const chosen = useRef(false);
  const [walletCardId, setWalletCardId] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    chosen.current = false;
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

  const choose = (yes: boolean) => {
    chosen.current = true;
    if (yes) onYes();
    else onNo();
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next || chosen.current) return;
        onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-transparent" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-max max-w-[min(100%-48px,280px)] -translate-x-1/2 -translate-y-1/2 bg-sky px-5 py-4 text-center outline-none">
          <Dialog.Title className="t-body text-[var(--ink)]">
            <span className="block">Your link and QR code will change.</span>
            <span className="block">Keep old links and QR codes working?</span>
          </Dialog.Title>
          {inWallet ? (
            <Dialog.Description className="mt-2 t-meta text-[var(--grey)]">
              Apple Wallet: Remove and re-add your card.
            </Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">Keep old links and QR codes working?</Dialog.Description>
          )}
          <div className="mt-3 flex justify-center gap-6">
            <button type="button" className="t-body text-[var(--ink)]" onClick={() => choose(true)}>
              Yes
            </button>
            <button type="button" className="t-body text-[var(--grey)]" onClick={() => choose(false)}>
              No
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
