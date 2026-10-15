"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useAppStore } from "@/shared/store/app-store";
import type { Card } from "@/shared/types";

/** The first portfolio resets to photo and name; any other is deleted. */
export function useIsFirstCard(cardId: string | undefined) {
  return useAppStore((state) => Boolean(cardId) && state.cards[0]?.id === cardId);
}

/** The confirmation behind the edit bar's Reset or Delete. */
export function PortfolioDeleteDialog({
  card,
  open,
  onOpenChange,
}: {
  card: Card;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isFirst = useIsFirstCard(card.id);
  const resetCard = useAppStore((state) => state.resetCard);
  const removeCard = useAppStore((state) => state.removeCard);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (busy) return;
    if (isFirst) {
      resetCard(card.id);
      onOpenChange(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/cards/${encodeURIComponent(card.id)}`, { method: "DELETE" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not delete the portfolio.");
        setBusy(false);
        return;
      }
      setBusy(false);
      onOpenChange(false);
      removeCard(card.id);
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
          <Dialog.Title className="t-body text-[var(--ink)]">
            {isFirst
              ? "Reset this portfolio to photo and name. Everyone you shared it with will see only that. Your library stays."
              : "Delete this portfolio. It will also disappear for everyone you shared it with. Your library stays."}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            {isFirst ? "This resets the portfolio." : "This deletes the portfolio."}
          </Dialog.Description>
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
