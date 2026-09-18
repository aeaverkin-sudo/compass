"use client";

import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Card, ContactItem, User } from "@/shared/types";

type OnboardingPayload = {
  photo: string;
  firstName: string;
  secondName: string;
};

interface AppState {
  hydrated: boolean;
  user: User;
  card: Card | null;
  contactItems: ContactItem[];
  setHydrated: (value: boolean) => void;
  completeOnboarding: (payload: OnboardingPayload) => void;
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
      card: null,
      contactItems: [],

      setHydrated: (value) => set({ hydrated: value }),

      completeOnboarding: ({ photo, firstName, secondName }) => {
        const now = new Date().toISOString();
        const displayName = buildDisplayName(firstName, secondName);
        const existing = get().card;

        set({
          user: { ...get().user, onboarded: true },
          card: {
            id: existing?.id ?? nanoid(),
            displayName,
            photo,
            title: existing?.title ?? "",
            contactItemIds: existing?.contactItemIds ?? [],
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          },
        });
      },
    }),
    {
      name: "compass-storage-v4",
      partialize: (state) => ({
        user: state.user,
        card: state.card,
        contactItems: state.contactItems,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

export function isCardReady(card: Card | null): card is Card {
  return Boolean(card?.displayName.trim() && card.photo);
}
