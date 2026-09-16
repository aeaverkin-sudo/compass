"use client";

import { useCallback, useEffect, useState } from "react";
import { Share } from "lucide-react";
import { useAppStore } from "@/shared/store/app-store";
import {
  buildCardSnapshot,
  buildContactItem,
  getLibraryItems,
  isCardReady,
  isContactFilled,
  parseInstagram,
} from "@/features/portfolio/services/contact-item";
import { fileToDataUrl } from "@/shared/lib/utils";
import {
  QR_SIZE,
  QR_TOP,
  safeTop,
  SHARE_SIZE,
  SHARE_TOP,
} from "@/features/portfolio/constants/layout";
import { QrZone } from "./qr-zone";
import { PortfolioStack } from "./portfolio-stack";

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
    if (editing) {
      purgeEmptyContactItems();
    } else if (card) {
      // Keep card chips in sync with filled library rows.
      contactItems
        .filter(isContactFilled)
        .forEach((item) => {
          if (!card.contactItemIds.includes(item.id)) {
            addItemToCard(card.id, item.id);
          }
        });
    }
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

  // Backfill: sync card chips + normalize instagram handles/urls.
  useEffect(() => {
    if (!card) return;
    contactItems.filter(isContactFilled).forEach((item) => {
      if (parseInstagram(item.value) && item.type !== "instagram") {
        updateContactItem(item.id, { value: item.value });
      }
      if (!card.contactItemIds.includes(item.id)) {
        addItemToCard(card.id, item.id);
      }
    });
  }, [card?.id, libraryFingerprint]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleAttachFile = async (file: File, itemId?: string) => {
    if (!card) return;
    const dataUrl = await fileToDataUrl(file);
    const built = buildContactItem(dataUrl, file.type, file.name);

    const cardItems = getLibraryItems(card, contactItems);
    const draft = itemId ? cardItems.find((i) => i.id === itemId) : undefined;
    let targetId =
      draft && !isContactFilled(draft) ? draft.id : cardItems.find((i) => !isContactFilled(i))?.id;

    if (!targetId) {
      if (!addContactItem(card.id)) return;
      targetId = getLibraryItems(card, useAppStore.getState().contactItems).find(
        (i) => !isContactFilled(i),
      )?.id;
    }
    if (!targetId) return;

    updateContactItem(targetId, {
      value: built.value,
      type: built.type,
      url: built.url,
      label: built.label,
    });
    if (!card.contactItemIds.includes(targetId)) {
      addItemToCard(card.id, targetId);
    }
    updateCard(card.id, { updatedAt: new Date().toISOString() });
    triggerQrFlash();
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
          paddingTop: safeTop(SHARE_TOP),
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
          <Share size={SHARE_SIZE} strokeWidth={1.7} />
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
        onIndexChange={setCurrentCardIndex}
        onToggleEdit={toggleEdit}
        onUpdate={updateCard}
        onAddItem={() => addContactItem(card.id)}
        onAttachFile={handleAttachFile}
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
