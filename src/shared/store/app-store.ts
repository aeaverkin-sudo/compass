"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import type {
  Card,
  ContactItem,
  ContentSlot,
  EventSpace,
  Person,
  PersonNote,
  Portfolio,
  SubscriptionTier,
  User,
} from "@/shared/types";
import { TIER_LIMITS } from "@/shared/constants/tiers";
import { DEMO_EVENTS } from "@/shared/constants/mock-data";
import {
  buildContactItem,
  createCard,
  createEmptyContactItem,
  getNextScanAddons,
  isContactFilled,
} from "@/features/portfolio/services/contact-item";
interface PersistedState {
  user: User;
  cards: Card[];
  contactItems: ContactItem[];
  currentCardIndex: number;
  people: Person[];
  events: EventSpace[];
}

interface AppState extends PersistedState {
  hydrated: boolean;
  qrFlashKey: number;

  setHydrated: (v: boolean) => void;
  triggerQrFlash: () => void;
  onboard: () => void;
  setTier: (tier: SubscriptionTier) => void;

  setCurrentCardIndex: (index: number) => void;
  addCard: () => boolean;
  updateCard: (id: string, data: Partial<Card>) => void;

  addContactItem: (cardId: string) => boolean;
  updateContactItem: (itemId: string, data: Partial<ContactItem>) => void;
  deleteContactItem: (itemId: string) => void;
  purgeEmptyContactItems: () => void;

  addItemToCard: (cardId: string, itemId: string) => void;
  removeItemFromCard: (cardId: string, itemId: string) => void;

  addPerson: (person: Omit<Person, "id" | "createdAt">) => void;
  updatePerson: (id: string, data: Partial<Person>) => void;
  addNote: (personId: string, note: Omit<PersonNote, "id" | "createdAt">) => void;

  joinEvent: (code: string) => EventSpace | null;
  setEventMatchingQuery: (eventId: string, query: string) => void;
}

function slotToContactItem(slot: ContentSlot, order: number): ContactItem {
  const value = slot.value.trim();
  const base = value ? buildContactItem(value) : createEmptyContactItem(order);
  return {
    ...base,
    id: slot.id,
    label: slot.label || base.label,
    order,
    createdAt: base.createdAt,
  };
}

function portfolioToCard(p: Portfolio, sortOrder: number): Card {
  return {
    id: p.id,
    label: p.name,
    displayName: [p.firstName, p.lastName].filter(Boolean).join(" "),
    photo: p.photo,
    title: "",
    subtitle: "",
    description: p.description ?? "",
    location: "",
    contactItemIds: p.activeSlotIds ?? [],
    nextScanAddons: [],
    sortOrder,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function migratePersistedState(raw: Record<string, unknown>): PersistedState {
  const user = (raw.user as User) ?? {
    id: nanoid(),
    name: "",
    tier: "free" as SubscriptionTier,
    onboarded: false,
  };

  let cards = raw.cards as Card[] | undefined;
  let contactItems = raw.contactItems as ContactItem[] | undefined;
  let currentCardIndex = raw.currentCardIndex as number | undefined;

  if (!cards || !contactItems) {
    const legacyPortfolios = (raw.portfolios as Portfolio[]) ?? [];
    const legacyLibrary = (raw.contentLibrary as ContentSlot[]) ?? [];

    if (legacyPortfolios.length > 0 || legacyLibrary.length > 0) {
      contactItems = legacyLibrary.map((s, i) => slotToContactItem(s, i));
      cards = legacyPortfolios.map((p, i) => portfolioToCard(p, i));
      currentCardIndex = (raw.currentPortfolioIndex as number) ?? 0;
    }
  }

  if (!cards || cards.length === 0) {
    cards = [createCard("Personal")];
  }
  if (!contactItems) {
    contactItems = [];
  }
  if (currentCardIndex === undefined) {
    currentCardIndex = 0;
  }

  currentCardIndex = Math.min(Math.max(0, currentCardIndex), cards.length - 1);

  cards = cards.map((c) => ({
    ...c,
    nextScanAddons: getNextScanAddons(c),
  }));

  return {
    user,
    cards,
    contactItems,
    currentCardIndex,
    people: (raw.people as Person[]) ?? [],
    events: (raw.events as EventSpace[]) ?? [],
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...migratePersistedState({}),
      hydrated: false,
      qrFlashKey: 0,

      setHydrated: (v) => set({ hydrated: v }),
      triggerQrFlash: () => set((s) => ({ qrFlashKey: s.qrFlashKey + 1 })),

      onboard: () =>
        set((s) => ({
          user: { ...s.user, onboarded: true },
        })),

      setTier: (tier) => set((s) => ({ user: { ...s.user, tier } })),

      setCurrentCardIndex: (index) => set({ currentCardIndex: index }),

      addCard: () => {
        const { user, cards } = get();
        if (cards.length >= TIER_LIMITS[user.tier].maxPortfolios) return false;
        const card = createCard(`Card ${cards.length + 1}`, { sortOrder: cards.length });
        set({ cards: [...cards, card], currentCardIndex: cards.length });
        get().triggerQrFlash();
        return true;
      },

      updateCard: (id, data) =>
        set((s) => ({
          cards: s.cards.map((c) =>
            c.id === id ? { ...c, ...data, updatedAt: new Date().toISOString() } : c,
          ),
        })),

      addContactItem: (cardId) => {
        const { user, contactItems } = get();
        if (contactItems.some((i) => !isContactFilled(i))) return false;
        if (contactItems.length >= TIER_LIMITS[user.tier].maxSlots) return false;
        const item = createEmptyContactItem(contactItems.length);
        const now = new Date().toISOString();
        set((s) => ({
          contactItems: [...s.contactItems, item],
          cards: s.cards.map((c) =>
            c.id === cardId
              ? { ...c, contactItemIds: [...c.contactItemIds, item.id], updatedAt: now }
              : c,
          ),
        }));
        return true;
      },

      purgeEmptyContactItems: () =>
        set((s) => {
          const emptyIds = new Set(
            s.contactItems.filter((i) => !isContactFilled(i)).map((i) => i.id),
          );
          if (emptyIds.size === 0) return s;
          return {
            contactItems: s.contactItems
              .filter((i) => isContactFilled(i))
              .map((item, order) => ({ ...item, order })),
            cards: s.cards.map((c) => ({
              ...c,
              contactItemIds: c.contactItemIds.filter((id) => !emptyIds.has(id)),
            })),
          };
        }),

      updateContactItem: (itemId, data) =>
        set((s) => ({
          contactItems: s.contactItems.map((item) => {
            if (item.id !== itemId) return item;
            const merged = { ...item, ...data };
            if (data.value !== undefined) {
              const detected = buildContactItem(data.value);
              merged.type = detected.type;
              merged.url = detected.url;
              if (!data.label && !item.label) merged.label = detected.label;
            }
            return merged;
          }),
        })),

      deleteContactItem: (itemId) =>
        set((s) => ({
          contactItems: s.contactItems
            .filter((item) => item.id !== itemId)
            .map((item, order) => ({ ...item, order })),
          cards: s.cards.map((c) => ({
            ...c,
            contactItemIds: c.contactItemIds.filter((id) => id !== itemId),
            updatedAt: new Date().toISOString(),
          })),
        })),

      addItemToCard: (cardId, itemId) => {
        set((s) => ({
          cards: s.cards.map((c) => {
            if (c.id !== cardId || c.contactItemIds.includes(itemId)) return c;
            return {
              ...c,
              contactItemIds: [itemId, ...c.contactItemIds],
              updatedAt: new Date().toISOString(),
            };
          }),
        }));
        get().triggerQrFlash();
      },

      removeItemFromCard: (cardId, itemId) => {
        set((s) => ({
          cards: s.cards.map((c) => {
            if (c.id !== cardId) return c;
            return {
              ...c,
              contactItemIds: c.contactItemIds.filter((id) => id !== itemId),
              updatedAt: new Date().toISOString(),
            };
          }),
        }));
        get().triggerQrFlash();
      },

      addPerson: (person) =>
        set((s) => ({
          people: [{ ...person, id: nanoid(), createdAt: new Date().toISOString() }, ...s.people],
        })),

      updatePerson: (id, data) =>
        set((s) => ({
          people: s.people.map((p) => (p.id === id ? { ...p, ...data } : p)),
        })),

      addNote: (personId, note) =>
        set((s) => ({
          people: s.people.map((p) => {
            if (p.id !== personId) return p;
            return {
              ...p,
              notes: [
                { ...note, id: nanoid(), createdAt: new Date().toISOString() },
                ...p.notes,
              ],
            };
          }),
        })),

      joinEvent: (code) => {
        const normalized = code.trim().toUpperCase();
        const template = DEMO_EVENTS.find((e) => e.code === normalized);
        if (!template) return null;
        const existing = get().events.find((e) => e.id === template.id);
        if (existing) return existing;
        const event: EventSpace = { ...template, joinedAt: new Date().toISOString() };
        set((s) => ({ events: [...s.events, event] }));
        return event;
      },

      setEventMatchingQuery: (eventId, query) =>
        set((s) => ({
          events: s.events.map((e) => (e.id === eventId ? { ...e, matchingQuery: query } : e)),
        })),
    }),
    {
      name: "compass-storage-v3",
      onRehydrateStorage: () => (state, raw) => {
        if (raw && state) {
          const migrated = migratePersistedState(raw as Record<string, unknown>);
          Object.assign(state, migrated);
        }
        state?.setHydrated(true);
      },
      partialize: (s) => ({
        user: s.user,
        cards: s.cards,
        contactItems: s.contactItems,
        currentCardIndex: s.currentCardIndex,
        people: s.people,
        events: s.events,
      }),
    },
  ),
);
