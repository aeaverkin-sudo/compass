"use client";

import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MAX_CARDS } from "@main/layout";
import {
  createEmptyContactItem,
  isContactFilled,
  normalizeContactItem,
} from "@/shared/services/contact-item";
import type { Card, ContactItem, User } from "@/shared/types";

type OnboardingPayload = {
  photo: string;
  firstName: string;
  secondName: string;
};

interface AppState {
  hydrated: boolean;
  user: User;
  cards: Card[];
  currentCardIndex: number;
  contactItems: ContactItem[];
  setHydrated: (value: boolean) => void;
  resetApp: () => void;
  completeOnboarding: (payload: OnboardingPayload) => void;
  setCurrentCardIndex: (index: number) => void;
  addCard: () => boolean;
  updateCard: (id: string, data: Partial<Card>) => void;
  updateSecondCardDraft: (data: Partial<Pick<Card, "displayName" | "photo">>) => void;
  addContactItemForCard: (cardId: string) => boolean;
  updateContactItem: (itemId: string, data: Partial<Pick<ContactItem, "value">>) => void;
  addItemToCard: (cardId: string, itemId: string) => void;
  removeItemFromCard: (cardId: string, itemId: string) => void;
  deleteContactItem: (itemId: string) => void;
}

function createInitialUser(): User {
  return {
    id: nanoid(),
    onboarded: false,
    shareToken: nanoid(12),
  };
}

function buildDisplayName(firstName: string, secondName: string) {
  return [firstName, secondName].filter(Boolean).join(" ").trim();
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      user: createInitialUser(),
      cards: [],
      currentCardIndex: 0,
      contactItems: [],

      setHydrated: (value) => set({ hydrated: value }),

      resetApp: () => {
        void useAppStore.persist.clearStorage();
        set({
          hydrated: true,
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
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };

        set({
          user: { ...get().user, onboarded: true },
          cards: [primary, ...get().cards.slice(1)],
          currentCardIndex: 0,
        });
      },

      setCurrentCardIndex: (index) => {
        const { cards } = get();
        if (cards.length === 0) return;
        const wrapped = ((index % cards.length) + cards.length) % cards.length;
        set({ currentCardIndex: wrapped });
      },

      addCard: () => {
        const { cards } = get();
        if (cards.length >= MAX_CARDS || cards.length === 0) return false;

        const now = new Date().toISOString();
        const next: Card = {
          id: nanoid(),
          displayName: "",
          title: "",
          contactItemIds: [],
          createdAt: now,
          updatedAt: now,
        };

        set({
          cards: [...cards, next],
          currentCardIndex: cards.length,
        });
        return true;
      },

      updateCard: (id, data) => {
        const now = new Date().toISOString();
        set({
          cards: get().cards.map((card) =>
            card.id === id ? { ...card, ...data, updatedAt: now } : card,
          ),
        });
      },

      addContactItemForCard: (cardId) => {
        const { cards, contactItems } = get();
        if (contactItems.some((item) => !isContactFilled(item))) return false;

        const now = new Date().toISOString();
        const item = createEmptyContactItem(contactItems.length);

        set({
          contactItems: [...contactItems, item],
          cards: cards.map((card) =>
            card.id === cardId
              ? {
                  ...card,
                  contactItemIds: [...card.contactItemIds, item.id],
                  updatedAt: now,
                }
              : card,
          ),
        });
        return true;
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
      version: 5,
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown>;
        if (version < 5) {
          const legacyCard = state.card as Card | null | undefined;
          if (legacyCard && !state.cards) {
            return {
              ...state,
              cards: [legacyCard],
              currentCardIndex: 0,
            };
          }
        }
        return persisted as AppState;
      },
      partialize: (state) => ({
        user: state.user,
        cards: state.cards,
        currentCardIndex: state.currentCardIndex,
        contactItems: state.contactItems,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
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
