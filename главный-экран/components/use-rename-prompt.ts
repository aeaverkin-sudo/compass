"use client";

import { useCallback, useRef, useState } from "react";
import { handleAfterRename, renameChangesAddress } from "@/shared/services/card-handle";
import { cardInWallet } from "@/shared/lib/wallet-client";
import { useAppStore } from "@/shared/store/app-store";
import type { Card } from "@/shared/types";
import { walletPassFace } from "./wallet-update-plaque";

type NameSnap = { cardId: string; name: string; pass: string };

/** The rename window and the Wallet plaque that follows it. The name changes only in Edit. */
export function useRenamePrompt() {
  const updateCard = useAppStore((state) => state.updateCard);
  const [open, setOpen] = useState(false);
  const [askedId, setAskedId] = useState<string | null>(null);
  const [plaque, setPlaque] = useState(false);
  const snapRef = useRef<NameSnap | null>(null);
  const leaveRef = useRef<(() => void) | null>(null);
  const sawWallet = useRef(false);

  const markWallet = useCallback(() => {
    sawWallet.current = true;
  }, []);

  const note = useCallback((cardId: string | undefined, editing: boolean) => {
    if (!cardId) return;
    if (editing && snapRef.current?.cardId === cardId) return;
    sawWallet.current = false;
    const { cards, contactItems } = useAppStore.getState();
    const card = cards.find((entry) => entry.id === cardId);
    snapRef.current = {
      cardId,
      name: card?.displayName ?? "",
      pass: card ? walletPassFace(card, contactItems) : "",
    };
  }, []);

  const revealPlaque = useCallback((snap: NameSnap | null, warned: boolean) => {
    if (warned || !snap) return;
    const { cards, contactItems } = useAppStore.getState();
    const card = cards.find((entry) => entry.id === snap.cardId);
    if (!card || walletPassFace(card, contactItems) === snap.pass) return;
    void cardInWallet(card.id).then((added) => {
      if (added === true) setPlaque(true);
    });
  }, []);

  const ask = useCallback((card: Card | undefined, nameWhenOpened: string | null, leave: () => void) => {
    if (leaveRef.current) return;
    const nameChanged = Boolean(
      card?.handle?.trim() &&
        nameWhenOpened !== null &&
        card.displayName.trim() !== nameWhenOpened.trim(),
    );
    if (card && (nameChanged || renameChangesAddress(card, nameWhenOpened))) {
      leaveRef.current = leave;
      setAskedId(card.id);
      setOpen(true);
      return;
    }
    leave();
  }, []);

  const finishEdit = useCallback(
    (leave: () => void) => {
      const snap = snapRef.current;
      const { cards, currentCardIndex } = useAppStore.getState();
      const card = cards[currentCardIndex];
      const nameWhenOpened = snap && card && snap.cardId === card.id ? snap.name : null;
      ask(card, nameWhenOpened, leave);
    },
    [ask],
  );

  const takeSnap = useCallback(() => {
    const snap = snapRef.current;
    const warned = sawWallet.current;
    sawWallet.current = false;
    snapRef.current = null;
    return { snap, warned };
  }, []);

  const apply = useCallback(
    (keepCode: boolean) => {
      const leave = leaveRef.current;
      leaveRef.current = null;
      setOpen(false);
      if (askedId) {
        const { cards } = useAppStore.getState();
        const card = cards.find((entry) => entry.id === askedId);
        if (card?.handle?.trim()) {
          const handle = handleAfterRename(card, cards, keepCode);
          if (handle && handle !== card.handle.trim().toLowerCase()) updateCard(card.id, { handle });
        }
      }
      leave?.();
    },
    [askedId, updateCard],
  );

  const reset = useCallback(() => {
    snapRef.current = null;
    leaveRef.current = null;
    sawWallet.current = false;
    setOpen(false);
  }, []);

  const pending = useCallback(() => leaveRef.current !== null, []);
  const dismissPlaque = useCallback(() => setPlaque(false), []);

  return {
    open,
    askedId,
    plaque,
    dismissPlaque,
    markWallet,
    note,
    finishEdit,
    takeSnap,
    revealPlaque,
    apply,
    reset,
    pending,
  };
}
