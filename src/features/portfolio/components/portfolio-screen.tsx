"use client";

import { useCallback, useEffect, useState } from "react";
import { Share } from "lucide-react";
import { useAppStore } from "@/shared/store/app-store";
import {
  buildCardSnapshot,
  isCardReady,
} from "@/features/portfolio/services/contact-item";
import { QrZone } from "./qr-zone";
import { PortfolioStack } from "./portfolio-stack";

/** The QR plate is fixed: same size and position in both states. */
const HEADER_TOP = 16;
const SHARE_ICON = 19;
const QR_TOP = HEADER_TOP + SHARE_ICON + 14;
const QR_SIZE = 168;
const GAP_UNDER_QR = 18;
const CARD_OVERLAP = 112;

const CARD_TOP_BROWSE = QR_TOP + QR_SIZE + GAP_UNDER_QR;
const CARD_TOP_LIBRARY = QR_TOP + QR_SIZE - CARD_OVERLAP;

export function PortfolioScreen() {
  const cards = useAppStore((s) => s.cards);
  const contactItems = useAppStore((s) => s.contactItems);
  const currentIndex = useAppStore((s) => s.currentCardIndex);
  const user = useAppStore((s) => s.user);
  const qrFlashKey = useAppStore((s) => s.qrFlashKey);

  const setCurrentCardIndex = useAppStore((s) => s.setCurrentCardIndex);
  const addContactItem = useAppStore((s) => s.addContactItem);
  const updateCard = useAppStore((s) => s.updateCard);
  const updateContactItem = useAppStore((s) => s.updateContactItem);
  const addItemToCard = useAppStore((s) => s.addItemToCard);
  const deleteContactItem = useAppStore((s) => s.deleteContactItem);
  const purgeEmptyContactItems = useAppStore((s) => s.purgeEmptyContactItems);
  const triggerQrFlash = useAppStore((s) => s.triggerQrFlash);

  const [shareTokens, setShareTokens] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);

  const card = cards[currentIndex];
  const qrVisible = card ? isCardReady(card) : false;

  const toggleEdit = () => {
    if (editing) purgeEmptyContactItems();
    setEditing((v) => !v);
  };

  const syncShareToken = useCallback(async () => {
    if (!card || !qrVisible) return;
    const snapshot = buildCardSnapshot(card, contactItems);
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolio: snapshot, ownerName: user.name }),
    });
    const { token } = await res.json();
    setShareTokens((prev) => ({ ...prev, [card.id]: token }));
  }, [card, contactItems, qrVisible, user.name]);

  const libraryFingerprint = contactItems
    .map((i) => `${i.id}:${i.value}:${i.type}`)
    .join("|");

  const addonFingerprint = card?.nextScanAddons
    ?.map((a) => `${a.id}:${a.type}:${a.content.slice(0, 24)}`)
    .join("|") ?? "";

  useEffect(() => {
    syncShareToken();
  }, [
    syncShareToken,
    card?.updatedAt,
    card?.contactItemIds.join(","),
    libraryFingerprint,
    addonFingerprint,
  ]);

  useEffect(() => {
    if (card && qrVisible) triggerQrFlash();
  }, [currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const shareToken = card ? shareTokens[card.id] : "";

  useEffect(() => {
    if (!card?.nextScanAddons?.length || !shareToken) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/share/${shareToken}/status`);
        if (!res.ok) return;
        const { nextScanDelivered } = await res.json();
        if (nextScanDelivered) {
          updateCard(card.id, { nextScanAddons: [] });
        }
      } catch {
        /* ignore */
      }
    };

    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [card?.id, card?.nextScanAddons, shareToken, updateCard]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const pdfShareUrl = shareToken ? `${origin}/share/${shareToken}?pdf=1` : "";
  const linkShareUrl = shareToken ? `${origin}/share/${shareToken}` : "";

  const handleShare = async () => {
    if (!card || !linkShareUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: card.displayName,
          text: card.title || card.description,
          url: linkShareUrl,
        });
      } else {
        await navigator.clipboard.writeText(linkShareUrl);
      }
    } catch {
      /* cancelled */
    }
  };

  if (!card) return null;

  return (
    <div
      className="compass-main relative mx-auto h-[100dvh] max-w-lg overflow-hidden"
      style={{ background: "var(--background)" }}
    >
      <header
        className="absolute inset-x-0 top-0 z-30 flex items-center"
        style={{
          paddingTop: `calc(env(safe-area-inset-top) + ${HEADER_TOP}px)`,
          paddingLeft: 24,
        }}
      >
        <button
          type="button"
          onClick={handleShare}
          disabled={!linkShareUrl}
          className="disabled:opacity-25"
          style={{ color: "oklch(25% 0.01 60)" }}
          aria-label="Share card"
        >
          <Share size={SHARE_ICON} strokeWidth={1.7} />
        </button>
      </header>

      <QrZone
        url={pdfShareUrl}
        visible={qrVisible}
        flashKey={qrFlashKey}
        top={QR_TOP}
        size={QR_SIZE}
      />

      <PortfolioStack
        cards={cards}
        currentIndex={currentIndex}
        library={contactItems}
        editing={editing}
        cardTop={editing ? CARD_TOP_LIBRARY : CARD_TOP_BROWSE}
        onIndexChange={setCurrentCardIndex}
        onToggleEdit={toggleEdit}
        onUpdate={updateCard}
        onAddItem={() => addContactItem()}
        onUpdateItem={(id, data) => {
          updateContactItem(id, data);
          // A filled item belongs on the card right away.
          if (data.value?.trim() && !card.contactItemIds.includes(id)) {
            addItemToCard(card.id, id);
          }
          updateCard(card.id, { updatedAt: new Date().toISOString() });
          triggerQrFlash();
        }}
        onDeleteItem={deleteContactItem}
      />
    </div>
  );
}
