"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { cardInWallet } from "@/shared/lib/wallet-client";
import { dropPendingCardUpsert } from "@/shared/services/card-sync";
import { forgetEditHold } from "@/shared/services/edit-hold";
import { useAppStore } from "@/shared/store/app-store";
import type { Card } from "@/shared/types";

/** The confirmation behind the edit bar's Delete. */
export function PortfolioDeleteDialog({
  card,
  open,
  onOpenChange,
  onKept,
}: {
  card: Card;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Other portfolios remain. Leave Edit and show one of them. */
  onKept?: () => void;
}) {
  const router = useRouter();
  const removeCard = useAppStore((state) => state.removeCard);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletCardId, setWalletCardId] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void cardInWallet(card.id).then((added) => {
      if (!live) return;
      setWalletCardId(added === true ? card.id : null);
    });
    return () => {
      live = false;
    };
  }, [open, card.id]);
  const inWallet = walletCardId === card.id;

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/cards/${encodeURIComponent(card.id)}`, { method: "DELETE" });
      if (response.status === 404 || response.ok) {
        forgetEditHold();
        dropPendingCardUpsert(card.id);
        removeCard(card.id);
        const left = useAppStore.getState().cards.length;
        setBusy(false);
        onOpenChange(false);
        if (left === 0) router.replace("/create?account=1");
        else onKept?.();
        return;
      }
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Could not delete the portfolio.");
      setBusy(false);
      return;
    } catch {
      setError("Could not delete the portfolio.");
      setBusy(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (next) setError(null);
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-transparent" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-max max-w-[min(100%-48px,280px)] -translate-x-1/2 -translate-y-1/2 bg-sky px-5 py-4 text-center outline-none">
          <Dialog.Title className="t-body text-[var(--ink)]">Delete this portfolio?</Dialog.Title>
          <Dialog.Description className="mt-2 t-meta text-[var(--grey)]">
            Link and QR will stop working. Your library stays.
          </Dialog.Description>
          {inWallet ? (
            <p className="mt-2 mb-0 t-meta text-[var(--grey)]">Apple Wallet: Remove your card manually.</p>
          ) : null}
          {error ? <p className="mt-2 mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
          <div className="mt-3 flex justify-center gap-6">
            <button
              type="button"
              disabled={busy}
              className="t-body text-[var(--ink)] disabled:text-[var(--grey)]"
              onClick={() => void confirm()}
            >
              Yes
            </button>
            <button type="button" disabled={busy} className="t-body text-[var(--grey)]" onClick={() => onOpenChange(false)}>
              No
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
