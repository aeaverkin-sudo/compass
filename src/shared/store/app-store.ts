"use client";

import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import {
  contactItemFromAttachment,
  createEmptyContactItem,
  isContactFilled,
  normalizeContactItem,
} from "@/shared/services/contact-item";
import {
  isAttachmentType,
  type PortfolioValidationResult,
  validatePortfolioAttachment,
} from "@/shared/services/portfolio-limits";
import { detectAttachmentType } from "@/shared/services/portfolio-catalog";
import { recoverFileRow, uploadAttachment } from "@/shared/services/attachment-upload";
import { useUploadStatus } from "@/shared/store/upload-status";
import { assignHandle, handlesForCards } from "@/shared/services/card-handle";
import { dropPendingCardUpsert, ensureCardIdentity, scheduleCardUpsert, writeCardItemZones, writeCardListed, writeCardRubricLabels, writeCardRubricOrder, writeCardSearchable } from "@/shared/services/card-sync";
import {
  BASE_EDIT_ZONES,
  canonZoneId,
  isExtraZoneId,
  nextExtraZoneId,
  normalizeRubricOrder,
  withItemZone,
  zoneForItem,
} from "@/shared/services/card-zones";
import { scheduleNotesSync } from "@/shared/services/notes-sync";
import {
  deleteItemRow,
  rekeyContactItems,
  scheduleItemUpsert,
  syncCardLinkOrder,
  syncItemOnCard,
  unlinkItem,
} from "@/shared/services/card-items-sync";
import { cardHasPhoto } from "@/shared/services/card-photo";
import type { Card, ContactItem, User } from "@/shared/types";

type OnboardingPayload = {
  displayName: string;
  photoAttachmentId: string;
  cardId?: string;
};

interface AppState {
  user: User;
  cards: Card[];
  currentCardIndex: number;
  contactItems: ContactItem[];
  resetApp: () => void;
  completeOnboarding: (payload: OnboardingPayload) => void;
  markMainIntroSeen: () => void;
  markEmptyFillHintSeen: () => void;
  markFirstRowHintSeen: () => void;
  markAddLibraryHintSeen: () => void;
  markPassAddHintSeen: () => void;
  markPasswordHintSeen: () => void;
  setRailDock: (dock: "qr" | "photo") => void;
  setRailLook: (look: "shadow" | null) => void;
  setMonochrome: (value: boolean) => void;
  setCurrentCardIndex: (index: number) => void;
  updateCard: (id: string, data: Partial<Card>) => void;
  /** The first portfolio: everything but the photo and the name comes off. The library stays. */
  resetCard: (id: string) => void;
  /** Any other portfolio, once the server has deleted it. The library stays. */
  removeCard: (id: string) => void;
  /** Public/Private. The first card stays public. A new second card is created private. */
  setCardListed: (id: string, listed: boolean) => void;
  /** Whether connections may search this card's visible fields. The name stays findable. */
  setCardSearchable: (id: string, searchable: boolean) => void;
  updateSecondCardDraft: (
    data: Partial<Pick<Card, "displayName" | "photo" | "photoAttachmentId">>,
    portfolioLimit: number,
  ) => void;
  /** Add an empty draft to the library pool (not bound to any card). One draft at a time. */
  addContactItem: () => string | null;
  updateContactItem: (itemId: string, data: Partial<Pick<ContactItem, "value" | "label">>) => void;
  updateContactItemAttachment: (
    cardId: string,
    itemId: string,
    file: File,
    dataUrl: string,
  ) => PortfolioValidationResult;
  /** File rows with neither a file nor a link: link a complete upload, or mark the row failed. */
  recoverFileRows: () => void;
  addItemToCard: (cardId: string, itemId: string, zoneId?: string) => void;
  removeItemFromCard: (cardId: string, itemId: string) => void;
  setCardItemOrder: (cardId: string, orderedIds: string[]) => void;
  setCardRubricOrder: (cardId: string, orderedRubricKeys: string[]) => void;
  /** Append a named extra shelf. Returns its id. */
  addCustomZone: (cardId: string) => string | null;
  /** Rename one section on this card. An empty title restores the built-in heading. */
  setRubricLabel: (cardId: string, zoneId: string, title?: string) => void;
  /** Hide an empty scaffold shelf on this card. A shelf with rows still shows. */
  hideZone: (cardId: string, zoneId: string) => void;
  /** Show one row in another section on this card. The item itself stays unchanged. */
  setItemZone: (cardId: string, itemId: string, zoneId?: string) => void;
  /** Remove a library row. `keepRemote` leaves the server row until undo expires. */
  deleteContactItem: (itemId: string, options?: { keepRemote?: boolean }) => ContactItemSnapshot | null;
  /** Put a deleted row back, same id, same cards, same positions. */
  restoreContactItem: (snapshot: ContactItemSnapshot) => void;
  /** Finish a deferred delete on the server. */
  commitContactItemDelete: (itemId: string) => void;
}

export type ContactItemSnapshot = {
  item: ContactItem;
  placements: { cardId: string; index: number; zoneId?: string; header?: boolean }[];
};

function createInitialUser(): User {
  return {
    id: nanoid(),
    onboarded: false,
    mainIntroSeen: false,
    monochrome: false,
    shareToken: nanoid(12),
  };
}

function cardForDisk(card: Card): Card {
  if (card.photoAttachmentId && card.photo?.startsWith("data:")) {
    return { ...card, photo: undefined };
  }
  return card;
}

function itemForDisk(item: ContactItem): ContactItem {
  if (item.attachmentId && item.url.startsWith("data:")) {
    return { ...item, url: "" };
  }
  return item;
}

/** Latest upload per row. A replaced upload that finishes late is ignored. */
const uploadRuns = new Map<string, number>();

/**
 * Paint the tap first. Stringify and localStorage run after the frame, and the latest
 * snapshot wins. Leaving the page writes immediately so a closed tab does not drop it.
 */
function idlePersistStorage<S>(): PersistStorage<S> {
  let pending: { name: string; value: StorageValue<S> } | null = null;
  let timer = 0;

  const writeNow = () => {
    const next = pending;
    pending = null;
    if (!next || typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(next.name, JSON.stringify(next.value));
    } catch {
      // Private mode or a full disk. The live store stays in memory.
    }
  };

  const flush = () => {
    if (typeof window !== "undefined" && timer) window.clearTimeout(timer);
    timer = 0;
    writeNow();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flush);
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }

  return {
    getItem: (name) => {
      if (pending?.name === name) return pending.value;
      if (typeof localStorage === "undefined") return null;
      const raw = localStorage.getItem(name);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as StorageValue<S>;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      pending = { name, value };
      if (typeof window === "undefined") {
        writeNow();
        return;
      }
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        writeNow();
      }, 48);
    },
    removeItem: (name) => {
      pending = null;
      if (typeof window !== "undefined" && timer) window.clearTimeout(timer);
      timer = 0;
      if (typeof localStorage === "undefined") return;
      localStorage.removeItem(name);
    },
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: createInitialUser(),
      cards: [],
      currentCardIndex: 0,
      contactItems: [],

      resetApp: () => {
        void useAppStore.persist.clearStorage();
        set({
          user: createInitialUser(),
          cards: [],
          currentCardIndex: 0,
          contactItems: [],
        });
      },

      completeOnboarding: ({ photoAttachmentId, displayName, cardId }) => {
        const now = new Date().toISOString();
        const name = displayName.trim();
        const existing = get().cards[0];

        const primary = assignHandle(ensureCardIdentity({
          id: cardId ?? existing?.id ?? crypto.randomUUID(),
          displayName: name,
          photoAttachmentId,
          title: existing?.title ?? "",
          status: existing?.status ?? "draft",
          publicToken: existing?.publicToken ?? "",
          qrVersion: existing?.qrVersion ?? 1,
          contactItemIds: existing?.contactItemIds ?? [],
          itemOrderManual: existing?.itemOrderManual,
          listed: existing?.listed ?? true,
          nextScanAddons: existing?.nextScanAddons ?? [],
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }), get().cards, true);

        set({
          user: { ...get().user, onboarded: true },
          cards: [primary, ...get().cards.slice(1)],
          currentCardIndex: 0,
        });
        scheduleCardUpsert(primary);
      },

      markMainIntroSeen: () => {
        if (get().user.mainIntroSeen) return;
        set({ user: { ...get().user, mainIntroSeen: true } });
      },

      markEmptyFillHintSeen: () => {
        if (get().user.emptyFillHintSeen) return;
        set({ user: { ...get().user, emptyFillHintSeen: true } });
      },

      markFirstRowHintSeen: () => {
        if (get().user.firstRowHintSeen) return;
        set({ user: { ...get().user, firstRowHintSeen: true } });
      },

      markPassAddHintSeen: () => {
        if (get().user.passAddHintSeen) return;
        set({ user: { ...get().user, passAddHintSeen: true } });
      },

      markAddLibraryHintSeen: () => {
        if (get().user.addLibraryHintSeen) return;
        set({ user: { ...get().user, addLibraryHintSeen: true } });
      },

      markPasswordHintSeen: () => {
        if (get().user.passwordHintSeen) return;
        set({ user: { ...get().user, passwordHintSeen: true } });
      },

      setRailDock: (dock) => {
        if (get().user.railDock === dock) return;
        set({ user: { ...get().user, railDock: dock } });
      },

      setRailLook: (look) => set({ user: { ...get().user, railLook: look ?? undefined } }),

      setMonochrome: (value) => set({ user: { ...get().user, monochrome: value } }),

      setCurrentCardIndex: (index) => {
        const { cards } = get();
        if (cards.length === 0) return;
        const wrapped = ((index % cards.length) + cards.length) % cards.length;
        set({ currentCardIndex: wrapped });
      },

      updateCard: (id, data) => {
        const now = new Date().toISOString();
        const current = get().cards.find((card) => card.id === id);
        if (!current) return;

        const nameChanged = data.displayName !== undefined && data.displayName.trim() !== current.displayName.trim();
        const next = assignHandle(
          ensureCardIdentity({ ...current, ...data, updatedAt: now }),
          get().cards,
          nameChanged || !current.handle?.trim(),
        );
        set({
          cards: get().cards.map((card) => (card.id === id ? next : card)),
        });
        scheduleCardUpsert(next);
        if ("nextScanAddons" in data) scheduleNotesSync(next);
      },

      resetCard: (id) => {
        const current = get().cards.find((card) => card.id === id);
        if (!current) return;
        get().updateCard(id, {
          contactItemIds: [],
          title: "",
          headerItemId: undefined,
          itemOrderManual: false,
          rubricOrder: undefined,
          rubricLabels: undefined,
          itemZones: undefined,
          hiddenZones: undefined,
          nextScanAddons: [],
        });
        for (const itemId of current.contactItemIds) void unlinkItem(id, itemId);
      },

      removeCard: (id) => {
        const { cards, currentCardIndex } = get();
        const index = cards.findIndex((card) => card.id === id);
        if (index < 0 || cards.length <= 1) return;
        dropPendingCardUpsert(id);
        let next = cards.filter((card) => card.id !== id);
        if (!next.some((card) => card.listed !== false)) {
          next = next.map((card, position) => (position === 0 ? { ...card, listed: true } : card));
        }
        const shown = currentCardIndex >= index ? Math.max(0, currentCardIndex - 1) : currentCardIndex;
        set({ cards: next, currentCardIndex: Math.min(shown, next.length - 1) });
      },

      setCardListed: (id, listed) => {
        const cards = get().cards;
        const current = cards.find((card) => card.id === id);
        if (!current || current.listed === listed) return;
        if (listed && !isCardReady(current)) return;
        if (!listed && isSolePublic(cards, id)) return;
        set({
          cards: cards.map((card) => (card.id === id ? { ...card, listed } : card)),
        });
        writeCardListed(id, listed);
      },

      setCardSearchable: (id, searchable) => {
        const cards = get().cards;
        const current = cards.find((card) => card.id === id);
        if (!current || (current.searchable !== false) === searchable) return;
        set({
          cards: cards.map((card) => (card.id === id ? { ...card, searchable } : card)),
        });
        writeCardSearchable(id, searchable);
      },

      addContactItem: () => {
        const { contactItems } = get();

        const existingDraft = contactItems.find((item) => !isContactFilled(item));
        if (existingDraft) return existingDraft.id;

        const item = createEmptyContactItem(contactItems.length);
        set({ contactItems: [...contactItems, item] });
        return item.id;
      },

      updateContactItem: (itemId, data) => {
        const nextItems = get().contactItems.map((item) => {
          if (item.id !== itemId) return item;
          if (data.value === undefined) return { ...item, ...data };
          return normalizeContactItem(item, data.value);
        });
        set({ contactItems: nextItems });
        const next = nextItems.find((item) => item.id === itemId);
        if (next) scheduleItemUpsert(next);
      },

      updateContactItemAttachment: (cardId, itemId, file, dataUrl) => {
        const { cards, contactItems } = get();
        const card = cards.find((entry) => entry.id === cardId);
        if (!card) return { ok: false, message: "Portfolio not found." };

        const attachmentType = detectAttachmentType(file);
        const validation = validatePortfolioAttachment(
          file,
          attachmentType,
          card,
          contactItems,
          itemId,
        );
        if (!validation.ok) return validation;

        set({
          contactItems: contactItems.map((item) =>
            item.id === itemId ? contactItemFromAttachment(item, file, dataUrl) : item,
          ),
        });

        const run = (uploadRuns.get(itemId) ?? 0) + 1;
        uploadRuns.set(itemId, run);
        const current = () => uploadRuns.get(itemId) === run;
        useUploadStatus.getState().setStatus(itemId, { state: "uploading", percent: null });

        void uploadAttachment({
          file,
          kind: attachmentType,
          cardId,
          onProgress: (percent) => {
            if (current()) useUploadStatus.getState().setStatus(itemId, { state: "uploading", percent });
          },
        })
          .then((ready) => {
            if (!current()) return;
            useUploadStatus.getState().setStatus(itemId, null);
            const nextItems = get().contactItems.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    attachmentId: ready.attachmentId,
                    url: item.url.startsWith("data:") ? "" : item.url,
                  }
                : item,
            );
            set({ contactItems: nextItems });
            const saved = nextItems.find((item) => item.id === itemId);
            if (saved) scheduleItemUpsert(saved);
          })
          .catch((error: unknown) => {
            console.error("[attachment]", error);
            if (!current()) return;
            const reason = error instanceof Error && error.message ? error.message : "Upload failed";
            useUploadStatus.getState().fail(itemId, reason);
          });

        return { ok: true };
      },

      recoverFileRows: () => {
        for (const item of get().contactItems) {
          if (!isAttachmentType(item.type) || item.attachmentId || item.url) continue;
          if (useUploadStatus.getState().byItem[item.id] || uploadRuns.has(item.id)) continue;
          useUploadStatus.getState().setStatus(item.id, { state: "checking" });
          void recoverFileRow(item.id)
            .then((attachmentId) => {
              if (uploadRuns.has(item.id)) return;
              if (!attachmentId) {
                useUploadStatus.getState().setStatus(item.id, { state: "failed" });
                return;
              }
              useUploadStatus.getState().setStatus(item.id, null);
              set({
                contactItems: get().contactItems.map((entry) =>
                  entry.id === item.id ? { ...entry, attachmentId } : entry,
                ),
              });
            })
            .catch((error: unknown) => {
              console.error("[attachment] recover failed", error);
              if (!uploadRuns.has(item.id)) useUploadStatus.getState().setStatus(item.id, { state: "failed" });
            });
        }
      },

      addItemToCard: (cardId, itemId, zoneId) => {
        const now = new Date().toISOString();
        const item = get().contactItems.find((entry) => entry.id === itemId);
        if (!item) return;
        const current = get().cards.find((card) => card.id === cardId);
        if (!current || current.contactItemIds.includes(itemId)) return;
        const zone = canonZoneId(zoneId) ?? zoneForItem(item);
        const itemZones = withItemZone(current, item, zone);
        const hiddenZones = (current.hiddenZones ?? []).filter((id) => canonZoneId(id) !== zone);
        const next = {
          ...current,
          contactItemIds: [...current.contactItemIds, itemId],
          itemZones,
          hiddenZones: hiddenZones.length > 0 ? hiddenZones : undefined,
          updatedAt: now,
        };
        set({
          cards: get().cards.map((card) => (card.id === cardId ? next : card)),
        });
        void syncItemOnCard(next, item);
      },

      removeItemFromCard: (cardId, itemId) => {
        const now = new Date().toISOString();
        const cards = get().cards.map((card) => {
          if (card.id !== cardId) return card;
          return {
            ...card,
            contactItemIds: card.contactItemIds.filter((id) => id !== itemId),
            headerItemId: card.headerItemId === itemId ? undefined : card.headerItemId,
            updatedAt: now,
          };
        });
        set({ cards });
        void unlinkItem(cardId, itemId);
        const card = cards.find((entry) => entry.id === cardId);
        if (card) void syncCardLinkOrder(card, get().contactItems);
      },

      setCardItemOrder: (cardId, orderedIds) => {
        const now = new Date().toISOString();
        set({
          cards: get().cards.map((card) => {
            if (card.id !== cardId) return card;
            const onCard = new Set(card.contactItemIds);
            const nextIds = orderedIds.filter((id) => onCard.has(id));
            for (const id of card.contactItemIds) {
              if (!nextIds.includes(id)) nextIds.push(id);
            }
            const sameOrder =
              nextIds.length === card.contactItemIds.length &&
              nextIds.every((id, index) => id === card.contactItemIds[index]);
            if (sameOrder) return card;
            return {
              ...card,
              contactItemIds: nextIds,
              itemOrderManual: true,
              updatedAt: now,
            };
          }),
        });
        const card = get().cards.find((entry) => entry.id === cardId);
        if (card) void syncCardLinkOrder(card, get().contactItems);
      },

      setCardRubricOrder: (cardId, orderedRubricKeys) => {
        const keys = normalizeRubricOrder(orderedRubricKeys);
        if (!keys) return;
        const now = new Date().toISOString();
        const current = get().cards.find((card) => card.id === cardId);
        if (!current) return;
        const same =
          (current.rubricOrder ?? []).length === keys.length &&
          (current.rubricOrder ?? []).every((id, index) => id === keys[index]);
        if (same) return;
        const next = { ...current, rubricOrder: keys, updatedAt: now };
        set({
          cards: get().cards.map((card) => (card.id === cardId ? next : card)),
        });
        writeCardRubricOrder(cardId, keys);
        scheduleCardUpsert(next, { pulse: false });
      },

      addCustomZone: (cardId) => {
        const current = get().cards.find((card) => card.id === cardId);
        if (!current) return null;
        const hidden = new Set((current.hiddenZones ?? []).map((id) => canonZoneId(id)).filter(Boolean));
        const order =
          current.rubricOrder && current.rubricOrder.length > 0
            ? [...current.rubricOrder]
            : BASE_EDIT_ZONES.filter((id) => !hidden.has(id));
        const id = nextExtraZoneId([
          ...order,
          ...Object.keys(current.rubricLabels ?? {}),
          ...Object.values(current.itemZones ?? {}),
        ]);
        const keys = normalizeRubricOrder([...order, id]);
        if (!keys) return null;
        const next = { ...current, rubricOrder: keys, updatedAt: new Date().toISOString() };
        set({ cards: get().cards.map((card) => (card.id === cardId ? next : card)) });
        writeCardRubricOrder(cardId, keys);
        scheduleCardUpsert(next, { pulse: false });
        return id;
      },

      setRubricLabel: (cardId, zoneId, title) => {
        const id = canonZoneId(zoneId);
        if (!id) return;
        const current = get().cards.find((card) => card.id === cardId);
        if (!current) return;
        const labels = { ...(current.rubricLabels ?? {}) };
        delete labels.additional;
        const trimmed = title?.trim().slice(0, 80) ?? "";
        if (trimmed) labels[id] = trimmed;
        else delete labels[id];
        const rubricLabels = Object.keys(labels).length > 0 ? labels : undefined;
        const same = JSON.stringify(rubricLabels ?? null) === JSON.stringify(current.rubricLabels ?? null);
        if (same) return;
        const next = { ...current, rubricLabels, updatedAt: new Date().toISOString() };
        set({ cards: get().cards.map((card) => (card.id === cardId ? next : card)) });
        writeCardRubricLabels(cardId, rubricLabels ?? null);
        scheduleCardUpsert(next, { pulse: false });
      },

      hideZone: (cardId, zoneId) => {
        const id = canonZoneId(zoneId);
        if (!id) return;
        const current = get().cards.find((card) => card.id === cardId);
        if (!current) return;
        if (isExtraZoneId(id)) {
          const rubricOrder = (current.rubricOrder ?? []).filter((entry) => entry !== id);
          const labels = { ...(current.rubricLabels ?? {}) };
          delete labels[id];
          const next = {
            ...current,
            rubricOrder: rubricOrder.length > 0 ? rubricOrder : undefined,
            rubricLabels: Object.keys(labels).length > 0 ? labels : undefined,
            updatedAt: new Date().toISOString(),
          };
          set({ cards: get().cards.map((card) => (card.id === cardId ? next : card)) });
          writeCardRubricOrder(cardId, next.rubricOrder ?? null);
          writeCardRubricLabels(cardId, next.rubricLabels ?? null);
          scheduleCardUpsert(next, { pulse: false });
          return;
        }
        if ((current.hiddenZones ?? []).includes(id)) return;
        const hiddenZones = [...(current.hiddenZones ?? []), id];
        const next = { ...current, hiddenZones, updatedAt: new Date().toISOString() };
        set({ cards: get().cards.map((card) => (card.id === cardId ? next : card)) });
      },

      setItemZone: (cardId, itemId, zoneId) => {
        const current = get().cards.find((card) => card.id === cardId);
        const item = get().contactItems.find((entry) => entry.id === itemId);
        if (!current || !item) return;
        const pinned = zoneId ? canonZoneId(zoneId) : undefined;
        if (zoneId && !pinned) return;
        const zones = { ...(current.itemZones ?? {}) };
        const natural = zoneForItem(item);
        if (!pinned || pinned === natural) delete zones[itemId];
        else zones[itemId] = pinned;
        const itemZones = Object.keys(zones).length > 0 ? zones : undefined;
        const same = JSON.stringify(itemZones ?? null) === JSON.stringify(current.itemZones ?? null);
        if (same) return;
        const next = { ...current, itemZones, updatedAt: new Date().toISOString() };
        set({ cards: get().cards.map((card) => (card.id === cardId ? next : card)) });
        writeCardItemZones(cardId, itemZones ?? null);
        scheduleCardUpsert(next, { pulse: false });
      },

      deleteContactItem: (itemId, options) => {
        const item = get().contactItems.find((entry) => entry.id === itemId);
        if (!item) return null;
        const placements = get().cards.flatMap((card) => {
          const index = card.contactItemIds.indexOf(itemId);
          if (index < 0) return [];
          const zoneId = card.itemZones?.[itemId];
          return [{ cardId: card.id, index, zoneId, header: card.headerItemId === itemId }];
        });
        const snapshot: ContactItemSnapshot = { item: { ...item }, placements };
        const now = new Date().toISOString();
        const touched = placements.map((spot) => spot.cardId);
        set({
          contactItems: get()
            .contactItems.filter((entry) => entry.id !== itemId)
            .map((entry, order) => ({ ...entry, order })),
          cards: get().cards.map((card) => {
            const zones = card.itemZones ? { ...card.itemZones } : undefined;
            if (zones) delete zones[itemId];
            return {
              ...card,
              contactItemIds: card.contactItemIds.filter((id) => id !== itemId),
              itemZones: zones && Object.keys(zones).length > 0 ? zones : undefined,
              headerItemId: card.headerItemId === itemId ? undefined : card.headerItemId,
              updatedAt: now,
            };
          }),
        });
        if (!options?.keepRemote) get().commitContactItemDelete(itemId);
        else {
          const currentId = get().cards[get().currentCardIndex]?.id;
          if (currentId && touched.includes(currentId)) {
            void import("@/shared/lib/live-qr-pulse").then(({ requestLiveQrPulse }) => {
              requestLiveQrPulse(currentId);
            });
          }
        }
        return snapshot;
      },

      restoreContactItem: (snapshot) => {
        const { item } = snapshot;
        if (!item?.id || get().contactItems.some((entry) => entry.id === item.id)) return;
        const place = new Map(snapshot.placements.map((spot) => [spot.cardId, spot]));
        const now = new Date().toISOString();
        set({
          contactItems: [...get().contactItems, item]
            .sort((a, b) => a.order - b.order)
            .map((entry, order) => ({ ...entry, order })),
          cards: get().cards.map((card) => {
            const spot = place.get(card.id);
            if (!spot) return card;
            const ids = card.contactItemIds.filter((id) => id !== item.id);
            ids.splice(Math.max(0, Math.min(spot.index, ids.length)), 0, item.id);
            const zones = { ...(card.itemZones ?? {}) };
            const restored = canonZoneId(spot.zoneId);
            if (restored) zones[item.id] = restored;
            else delete zones[item.id];
            return {
              ...card,
              contactItemIds: ids,
              itemZones: Object.keys(zones).length > 0 ? zones : undefined,
              headerItemId: spot.header ? item.id : card.headerItemId,
              updatedAt: now,
            };
          }),
        });
        const currentId = get().cards[get().currentCardIndex]?.id;
        if (currentId && place.has(currentId)) {
          void import("@/shared/lib/live-qr-pulse").then(({ requestLiveQrPulse }) => {
            requestLiveQrPulse(currentId);
          });
        }
      },

      commitContactItemDelete: (itemId) => {
        const currentId = get().cards[get().currentCardIndex]?.id;
        void deleteItemRow(itemId).then(async () => {
          if (!currentId) return;
          const { requestLiveQrPulse } = await import("@/shared/lib/live-qr-pulse");
          requestLiveQrPulse(currentId);
        });
      },

      updateSecondCardDraft: (data, portfolioLimit) => {
        const { cards } = get();
        if (!Number.isFinite(portfolioLimit) || cards.length >= portfolioLimit) return;

        const now = new Date().toISOString();
        const next = assignHandle(ensureCardIdentity({
          id: crypto.randomUUID(),
          displayName: data.displayName ?? "",
          photo: data.photo,
          photoAttachmentId: data.photoAttachmentId,
          title: "",
          status: "draft",
          publicToken: "",
          qrVersion: 1,
          contactItemIds: [],
          nextScanAddons: [],
          listed: cards.length === 0,
          createdAt: now,
          updatedAt: now,
        }), cards, true);

        set({
          cards: [...cards, next],
          currentCardIndex: cards.length,
        });
        scheduleCardUpsert(next);
      },
    }),
    {
      name: "compass-storage-v4",
      storage: idlePersistStorage(),
      version: 10,
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown>;
        if (version < 5) {
          const legacyCard = state.card as Card | null | undefined;
          if (legacyCard && !state.cards) {
            state.cards = [legacyCard];
            state.currentCardIndex = 0;
          }
        }
        if (version < 6) {
          const user = state.user as User | undefined;
          if (user) {
            // Existing onboarded users have already set up their card — don't
            // replay the one-time library intro for them.
            state.user = { ...user, mainIntroSeen: Boolean(user.onboarded) };
          }
        }
        if (version < 7) {
          const cards = (state.cards as Card[] | undefined) ?? [];
          state.cards = cards.map((card) => ({
            ...card,
            status: card.status ?? "draft",
            publicToken: card.publicToken && card.publicToken.length >= 16 ? card.publicToken : nanoid(21),
            qrVersion: card.qrVersion && card.qrVersion > 0 ? card.qrVersion : 1,
          }));
        }
        if (version < 8) {
          const rekeyed = rekeyContactItems(
            (state.cards as Card[] | undefined) ?? [],
            (state.contactItems as ContactItem[] | undefined) ?? [],
          );
          state.cards = rekeyed.cards;
          state.contactItems = rekeyed.items;
        }
        if (version < 10) {
          state.cards = handlesForCards((state.cards as Card[] | undefined) ?? []);
        }
        return state as unknown as AppState;
      },
      partialize: (state) => ({
        user: state.user,
        cards: state.cards.map(cardForDisk),
        currentCardIndex: state.currentCardIndex,
        contactItems: state.contactItems.map(itemForDisk),
      }),
    },
  ),
);

export function selectActiveCard(cards: Card[], currentCardIndex: number): Card | null {
  if (cards.length === 0) return null;
  return cards[currentCardIndex] ?? cards[0];
}

/** One empty slot at a time: the next one opens only after the last portfolio has a photo or a name. */
export function canAddMoreCards(cards: Card[], portfolioLimit: number | null): boolean {
  if (portfolioLimit === null) return false;
  const last = cards[cards.length - 1];
  if (!last || (!cardHasPhoto(last) && !last.displayName.trim())) return false;
  return cards.length < portfolioLimit;
}

/** True when this portfolio is public and no other portfolio is. */
export function isSolePublic(cards: Card[], id: string): boolean {
  const card = cards.find((entry) => entry.id === id);
  if (!card || card.listed === false) return false;
  return cards.filter((entry) => entry.listed !== false).length === 1;
}

export function isCardReady(card: Card | null): card is Card {
  return Boolean(card?.displayName.trim());
}
