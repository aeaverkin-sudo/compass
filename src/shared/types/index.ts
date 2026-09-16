export type SubscriptionTier = "free" | "business" | "professional" | "conference";

export type ContactType =
  | "instagram"
  | "linkedin"
  | "website"
  | "email"
  | "phone"
  | "pdf"
  | "telegram"
  | "whatsapp"
  | "audio"
  | "text"
  | "link"
  | "custom";

export type NextScanAddonType = "text" | "voice" | "selfie";

export interface NextScanAddon {
  id: string;
  type: NextScanAddonType;
  content: string;
  createdAt: string;
}

export const MAX_NEXT_SCAN_NOTES = 3;

/** @deprecated use ContactItem — kept for Person / migration */
export type ContentType = "link" | "pdf" | "image" | "text" | "empty";

/** @deprecated use ContactItem */
export interface ContentSlot {
  id: string;
  label: string;
  type: ContentType;
  value: string;
  order: number;
}

export interface ContactItem {
  id: string;
  type: ContactType;
  label: string;
  value: string;
  url: string;
  order: number;
  createdAt: string;
}

export interface Card {
  id: string;
  label: string;
  displayName: string;
  photo?: string;
  title: string;
  subtitle: string;
  description: string;
  location: string;
  contactItemIds: string[];
  nextScanAddons: NextScanAddon[];
  /** @deprecated migrated to nextScanAddons */
  nextScanAddon?: NextScanAddon | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** @deprecated use Card */
export interface Portfolio {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  photo?: string;
  description: string;
  activeSlotIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  email?: string;
  tier: SubscriptionTier;
  onboarded: boolean;
}

export interface PersonNote {
  id: string;
  type: "text" | "voice";
  content: string;
  createdAt: string;
}

export interface PersonContext {
  eventId?: string;
  eventName?: string;
  location?: string;
  date: string;
  metAt?: string;
}

export interface CardSnapshot {
  label: string;
  displayName: string;
  photo?: string;
  title: string;
  subtitle: string;
  description: string;
  location: string;
  items: ContactItem[];
  nextScanAddons?: NextScanAddon[];
  /** @deprecated legacy single note */
  nextScanAddon?: NextScanAddon | null;
  /** @deprecated legacy share payloads */
  firstName?: string;
  lastName?: string;
  name?: string;
  slots?: ContentSlot[];
}

/** @deprecated */
export type PortfolioSnapshot = CardSnapshot;

export interface Person {
  id: string;
  direction: "received" | "sent";
  name: string;
  photo?: string;
  selfiePhoto?: string;
  showSelfie: boolean;
  headline: string;
  description: string;
  slots: ContentSlot[];
  context: PersonContext;
  notes: PersonNote[];
  privateSave: boolean;
  savedByName?: string;
  positiveOutcome: "none" | "pending" | "confirmed";
  createdAt: string;
}

export interface EventSpace {
  id: string;
  name: string;
  code: string;
  location: string;
  startDate: string;
  endDate: string;
  activeUntil: string;
  joinedAt: string;
  matchingQuery?: string;
}

export interface MatchingProfile {
  id: string;
  name: string;
  photo?: string;
  headline: string;
  relevance: number;
  reason: string;
  location: string;
  tags: string[];
}

export interface PortfolioAnalytics {
  portfolioId: string;
  portfolioName: string;
  opened: number;
  linksOpened: number;
  pitchDeck: number;
  website: number;
  instagram: number;
}
