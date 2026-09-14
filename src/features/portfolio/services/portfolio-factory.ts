import { nanoid } from "nanoid";
import type { ContentSlot, Portfolio, PortfolioSnapshot } from "@/shared/types";
import { isSlotFilled } from "./content-detector";

export function createEmptySlot(order: number): ContentSlot {
  return {
    id: nanoid(),
    label: "",
    type: "empty",
    value: "",
    order,
  };
}

export function createPortfolio(name: string, overrides?: Partial<Portfolio>): Portfolio {
  const now = new Date().toISOString();
  return {
    id: nanoid(),
    name,
    firstName: "",
    lastName: "",
    description: "",
    activeSlotIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function getFullName(portfolio: Portfolio): string {
  return [portfolio.firstName, portfolio.lastName].filter(Boolean).join(" ").trim();
}

export function isQrReady(portfolio: Portfolio): boolean {
  return Boolean(portfolio.firstName.trim() && portfolio.lastName.trim() && portfolio.photo);
}

export function getActiveSlots(portfolio: Portfolio, library: ContentSlot[]): ContentSlot[] {
  const map = new Map(library.map((s) => [s.id, s]));
  return portfolio.activeSlotIds
    .map((id) => map.get(id))
    .filter((s): s is ContentSlot => Boolean(s && isSlotFilled(s)));
}

export function sortLibrarySlots(library: ContentSlot[], activeIds: string[]): ContentSlot[] {
  const activeSet = new Set(activeIds);
  return [...library].sort((a, b) => {
    const aActive = activeSet.has(a.id) ? 0 : 1;
    const bActive = activeSet.has(b.id) ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return a.order - b.order;
  });
}

export function buildPortfolioSnapshot(
  portfolio: Portfolio,
  library: ContentSlot[],
): PortfolioSnapshot {
  return {
    name: portfolio.name,
    firstName: portfolio.firstName,
    lastName: portfolio.lastName,
    photo: portfolio.photo,
    description: portfolio.description,
    slots: getActiveSlots(portfolio, library),
  };
}

export function emptyFieldPlaceholder(isFirstEmpty: boolean, totalEmpty: number): string {
  if (isFirstEmpty && totalEmpty === 1) {
    return "Add file, link or social profile";
  }
  return "";
}
