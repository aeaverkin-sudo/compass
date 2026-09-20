"use client";

import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MAX_CARDS } from "@main/layout";
import {
  contactItemFromAttachment,
  createEmptyContactItem,
  isContactFilled,
  normalizeContactItem,
} from "@/shared/services/contact-item";
import {
  type PortfolioValidationResult,
  validatePortfolioAttachment,
} from "@/shared/services/portfolio-limits";
import { detectAttachmentType } from "@/shared/services/portfolio-catalog";
import type { Card, ContactItem, User } from "@/shared/types";

type OnboardingPayload = {
  photo: string;
  firstName: string;
  secondName: string;
};

interface AppState {
  user: User;
  cards: Card[];
  currentCardIndex: number;
  contactItems: ContactItem[];
  resetApp: () => void;
  completeOnboarding: (payload: OnboardingPayload) => void;
  markMainIntroSeen: () => void;
  setCurrentCardIndex: (index: number) => void;
  updateCard: (id: string, data: Partial<Card>) => void;
  updateSecondCardDraft: (data: Partial<Pick<Card, "displayName" | "photo">>) => void;
  /** Add an empty draft to the library pool (not bound to any card). One draft at a time. */
  addContactItem: () => string | null;
  updateContactItem: (itemId: string, data: Partial<Pick<ContactItem, "value">>) => void;
  updateContactItemAttachment: (
    cardId: string,
    itemId: string,
    file: File,
    dataUrl: string,
  ) => PortfolioValidationResult;
  addItemToCard: (cardId: string, itemId: string) => void;
  removeItemFromCard: (cardId: string, itemId: string) => void;
  deleteContactItem: (itemId: string) => void;
}

function createInitialUser(): User {
  return {
    id: nanoid(),
    onboarded: false,
    mainIntroSeen: false,
    shareToken: nanoid(12),
  };
}

function buildDisplayName(firstName: string, secondName: string) {
  return [firstName, secondName].filter(Boolean).join(" ").trim();
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

      completeOnboarding: ({ photo, firstName, secondName }) => {
        const now = new Date().toISOString();
        const displayName = buildDisplayName(firstName, secondName);
        const existing = get().cards[0];

        const primary: Card = {
          id: existing?.id ?? nanoid(),
          displayName,
          photo,
          title: existing?.title ?? "",
          contactItemIds: existing?.contactItemIds ?? [],
          nextScanAddons: existing?.nextScanAddons ?? [],
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };

        set({
          user: { ...get().user, onboarded: true },
          cards: [primary, ...get().cards.slice(1)],
          currentCardIndex: 0,
        });
      },

      markMainIntroSeen: () => {
        if (get().user.mainIntroSeen) return;
        set({ user: { ...get().user, mainIntroSeen: true } });
      },

      setCurrentCardIndex: (index) => {
        const { cards } = get();
        if (cards.length === 0) return;
        const wrapped = ((index % cards.length) + cards.length) % cards.length;
        set({ currentCardIndex: wrapped });
      },

      updateCard: (id, data) => {
        const now = new Date().toISOString();
        set({
          cards: get().cards.map((card) =>
            card.id === id ? { ...card, ...data, updatedAt: now } : card,
          ),
        });
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
        set({
          contactItems: get().contactItems.map((item) => {
            if (item.id !== itemId) return item;
            if (data.value === undefined) return { ...item, ...data };
            return normalizeContactItem(item, data.value);
          }),
        });
      },

      updateContactItemAttachment: (cardId, itemId, file, dataUrl) => {
        const { cards, contactItems } = get();
        const card = cards.find((entry) => entry.id === cardId);
        if (!card) return { ok: false, message: "Card not found." };

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
        return { ok: true };
      },

      addItemToCard: (cardId, itemId) => {
        const now = new Date().toISOString();
        set({
          cards: get().cards.map((card) => {
            if (card.id !== cardId || card.contactItemIds.includes(itemId)) return card;
            return {
              ...card,
              contactItemIds: [...card.contactItemIds, itemId],
              updatedAt: now,
            };
          }),
        });
      },

      removeItemFromCard: (cardId, itemId) => {
        const now = new Date().toISOString();
        set({
          cards: get().cards.map((card) => {
            if (card.id !== cardId) return card;
            return {
              ...card,
              contactItemIds: card.contactItemIds.filter((id) => id !== itemId),
              updatedAt: now,
            };
          }),
        });
      },

      deleteContactItem: (itemId) => {
        const now = new Date().toISOString();
        set({
          contactItems: get()
            .contactItems.filter((item) => item.id !== itemId)
            .map((item, order) => ({ ...item, order })),
          cards: get().cards.map((card) => ({
            ...card,
            contactItemIds: card.contactItemIds.filter((id) => id !== itemId),
            updatedAt: now,
          })),
        });
      },

      updateSecondCardDraft: (data) => {
        const { cards } = get();
        if (cards.length === 0) return;

        const now = new Date().toISOString();

        if (cards.length < 2) {
          const next: Card = {
            id: nanoid(),
            displayName: data.displayName ?? "",
            photo: data.photo,
            title: "",
            contactItemIds: [],
            nextScanAddons: [],
            createdAt: now,
            updatedAt: now,
          };

          set({
            cards: [...cards, next],
            currentCardIndex: 1,
          });
          return;
        }

        const second = cards[1]!;
        set({
          cards: cards.map((card) =>
            card.id === second.id ? { ...card, ...data, updatedAt: now } : card,
          ),
        });
      },
    }),
    {
      name: "compass-storage-v4",
      version: 6,
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
        return state as unknown as AppState;
      },
      partialize: (state) => ({
        user: state.user,
        cards: state.cards,
        currentCardIndex: state.currentCardIndex,
        contactItems: state.contactItems,
      }),
    },
  ),
);

export function selectActiveCard(cards: Card[], currentCardIndex: number): Card | null {
  if (cards.length === 0) return null;
  return cards[currentCardIndex] ?? cards[0];
}

export function canAddMoreCards(cards: Card[]): boolean {
  return cards.length > 0 && cards.length < MAX_CARDS;
}

export function isCardReady(card: Card | null): card is Card {
  return Boolean(card?.displayName.trim() && card.photo);
}
