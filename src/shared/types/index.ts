export type ContactType =
  | "instagram"
  | "linkedin"
  | "website"
  | "email"
  | "phone"
  | "telegram"
  | "whatsapp"
  | "link"
  | "text"
  | "custom";

export interface ContactItem {
  id: string;
  type: ContactType;
  label: string;
  value: string;
  url: string;
  order: number;
}

export interface Card {
  id: string;
  displayName: string;
  photo?: string;
  title: string;
  contactItemIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CardSnapshot {
  displayName: string;
  photo?: string;
  title: string;
  subtitle: string;
  description: string;
  items: ContactItem[];
}

export interface User {
  id: string;
  onboarded: boolean;
  shareToken: string;
}
