export type SubscriptionTier = "free" | "business" | "professional" | "conference";

export type ContentType = "link" | "pdf" | "image" | "text" | "empty";

export interface ContentSlot {
  id: string;
  label: string;
  type: ContentType;
  value: string;
  order: number;
}

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

/** Snapshot used when sharing / viewing a saved person */
export interface PortfolioSnapshot {
  name: string;
  firstName: string;
  lastName: string;
  photo?: string;
  description: string;
  slots: ContentSlot[];
}

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
