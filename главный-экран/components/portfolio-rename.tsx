"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cachedWalletStatus, watchWalletLine } from "@/shared/lib/wallet-client";

/** Shown when a portfolio that already has a link is renamed. Only Yes or No closes it. */
export function PortfolioRenameDialog({
  cardId,
  open,
  onYes,
  onNo,
  onWalletLine,
}: {
  cardId: string;
  open: boolean;
  onYes: () => void;
  onNo: () => void;
  onWalletLine?: () => void;
}) {
  if (!open) return null;
  return (
    <PortfolioRenameBody
      key={cardId}
      cardId={cardId}
      onYes={onYes}
      onNo={onNo}
      onWalletLine={onWalletLine}
    />
  );
}

function PortfolioRenameBody({
  cardId,
  onYes,
  onNo,
  onWalletLine,
}: {
  cardId: string;
  onYes: () => void;
  onNo: () => void;
  onWalletLine?: () => void;
}) {
  const [inWallet, setInWallet] = useState<boolean | undefined>(() => cachedWalletStatus(cardId));
  useEffect(() => {
    if (inWallet !== undefined) return;
    return watchWalletLine(cardId, setInWallet);
  }, [cardId, inWallet]);
  useEffect(() => {
    if (inWallet) onWalletLine?.();
  }, [inWallet, onWalletLine]);

  if (inWallet === undefined) return null;

  return (
    <Dialog.Root open>
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
            <button type="button" className="t-body text-[var(--ink)]" onClick={onYes}>
              Yes
            </button>
            <button type="button" className="t-body text-[var(--grey)]" onClick={onNo}>
              No
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
