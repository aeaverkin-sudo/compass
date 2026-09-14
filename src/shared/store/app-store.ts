"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import type {
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
import { createEmptySlot, createPortfolio } from "@/features/portfolio/services/portfolio-factory";

interface PersistedState {
  user: User;
  portfolios: Portfolio[];
  contentLibrary: ContentSlot[];
  currentPortfolioIndex: number;
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

  setCurrentPortfolioIndex: (index: number) => void;
  addPortfolio: () => boolean;
  updatePortfolio: (id: string, data: Partial<Portfolio>) => void;

  addLibrarySlot: () => boolean;
  updateLibrarySlot: (slotId: string, data: Partial<ContentSlot>) => void;
  deleteLibrarySlot: (slotId: string) => void;

  addSlotToPortfolio: (portfolioId: string, slotId: string) => void;
  removeSlotFromPortfolio: (portfolioId: string, slotId: string) => void;

  addPerson: (person: Omit<Person, "id" | "createdAt">) => void;
  updatePerson: (id: string, data: Partial<Person>) => void;
  addNote: (personId: string, note: Omit<PersonNote, "id" | "createdAt">) => void;

  joinEvent: (code: string) => EventSpace | null;
  setEventMatchingQuery: (eventId: string, query: string) => void;
}

function migratePersistedState(raw: Partial<PersistedState>): PersistedState {
  const user = raw.user ?? {
    id: nanoid(),
    name: "",
    tier: "free" as SubscriptionTier,
    onboarded: false,
  };

  let contentLibrary = raw.contentLibrary ?? [];
  let portfolios = raw.portfolios ?? [createPortfolio("PERSONAL")];

  // Migrate legacy portfolios that had embedded slots
  if (contentLibrary.length === 0 && portfolios.some((p) => "slots" in p)) {
    const legacyPortfolios = portfolios as Array<
      Portfolio & { slots?: ContentSlot[]; headline?: string }
    >;
    const allSlots: ContentSlot[] = [];
    portfolios = legacyPortfolios.map((p) => {
      const slots = p.slots ?? [];
      slots.forEach((s) => {
        if (!allSlots.find((x) => x.id === s.id)) {
          allSlots.push({
            id: s.id,
            label: s.label,
            type: s.type,
            value: s.value,
            order: allSlots.length,
          });
        }
      });
      const activeSlotIds = slots
        .filter((s) => "inCurrentCard" in s && s.inCurrentCard && s.type !== "empty")
        .map((s) => s.id);
      const headline = p.headline ?? "";
      const parts = headline.split(" ");
      return {
        id: p.id,
        name: p.name,
        firstName: p.firstName || parts[0] || "",
        lastName: p.lastName || parts.slice(1).join(" ") || "",
        photo: p.photo,
        description: p.description ?? "",
        activeSlotIds: p.activeSlotIds ?? activeSlotIds,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });
    contentLibrary = allSlots;
  }

  if (portfolios.length === 0) {
    portfolios = [createPortfolio("PERSONAL")];
  }

  return {
    user,
    portfolios,
    contentLibrary,
    currentPortfolioIndex: raw.currentPortfolioIndex ?? 0,
    people: raw.people ?? [],
    events: raw.events ?? [],
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

      setCurrentPortfolioIndex: (index) => set({ currentPortfolioIndex: index }),

      addPortfolio: () => {
        const { user, portfolios } = get();
        if (portfolios.length >= TIER_LIMITS[user.tier].maxPortfolios) return false;
        const p = createPortfolio(`PORTFOLIO ${portfolios.length + 1}`);
        set({ portfolios: [...portfolios, p], currentPortfolioIndex: portfolios.length });
        get().triggerQrFlash();
        return true;
      },

      updatePortfolio: (id, data) =>
        set((s) => ({
          portfolios: s.portfolios.map((p) =>
            p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p,
          ),
        })),

      addLibrarySlot: () => {
        const { user, contentLibrary } = get();
        if (contentLibrary.length >= TIER_LIMITS[user.tier].maxSlots) return false;
        set({
          contentLibrary: [
            ...contentLibrary,
            createEmptySlot(contentLibrary.length),
          ],
        });
        return true;
      },

      updateLibrarySlot: (slotId, data) =>
        set((s) => ({
          contentLibrary: s.contentLibrary.map((slot) =>
            slot.id === slotId ? { ...slot, ...data } : slot,
          ),
        })),

      deleteLibrarySlot: (slotId) =>
        set((s) => ({
          contentLibrary: s.contentLibrary
            .filter((slot) => slot.id !== slotId)
            .map((slot, order) => ({ ...slot, order })),
          portfolios: s.portfolios.map((p) => ({
            ...p,
            activeSlotIds: p.activeSlotIds.filter((id) => id !== slotId),
            updatedAt: new Date().toISOString(),
          })),
        })),

      addSlotToPortfolio: (portfolioId, slotId) => {
        set((s) => ({
          portfolios: s.portfolios.map((p) => {
            if (p.id !== portfolioId || p.activeSlotIds.includes(slotId)) return p;
            return {
              ...p,
              activeSlotIds: [slotId, ...p.activeSlotIds],
              updatedAt: new Date().toISOString(),
            };
          }),
        }));
        get().triggerQrFlash();
      },

      removeSlotFromPortfolio: (portfolioId, slotId) => {
        set((s) => ({
          portfolios: s.portfolios.map((p) => {
            if (p.id !== portfolioId) return p;
            return {
              ...p,
              activeSlotIds: p.activeSlotIds.filter((id) => id !== slotId),
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
      name: "compass-storage-v2",
      onRehydrateStorage: () => (state, raw) => {
        if (raw && state) {
          const migrated = migratePersistedState(raw as Partial<PersistedState>);
          Object.assign(state, migrated);
        }
        state?.setHydrated(true);
      },
      partialize: (s) => ({
        user: s.user,
        portfolios: s.portfolios,
        contentLibrary: s.contentLibrary,
        currentPortfolioIndex: s.currentPortfolioIndex,
        people: s.people,
        events: s.events,
      }),
    },
  ),
);
