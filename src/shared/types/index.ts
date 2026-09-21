export type NextScanAddonType = "text" | "voice" | "selfie";

export interface NextScanAddon {
  id: string;
  type: NextScanAddonType;
  content: string;
  createdAt: string;
}

/** One-time notes/selfie delivered on the next share view only. */
export const MAX_NEXT_SCAN_NOTES = 3;

export type ContactType =
  | "instagram"
  | "linkedin"
  | "meta"
  | "x"
  | "youtube"
  | "tiktok"
  | "github"
  | "behance"
  | "dribbble"
  | "spotify"
  | "calendly"
  | "appstore"
  | "playstore"
  | "website"
  | "email"
  | "phone"
  | "telegram"
  | "whatsapp"
  | "pdf"
  | "photo"
  | "presentation"
  | "document"
  | "spreadsheet"
  | "audio"
  | "video"
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
  /** When true, card rows keep the user's manual order instead of auto shelves. */
  itemOrderManual?: boolean;
  nextScanAddons: NextScanAddon[];
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
  nextScanAddons?: NextScanAddon[];
}

export interface User {
  id: string;
  onboarded: boolean;
  /** True once the one-time library ("fill") intro has been shown on the main screen. */
  mainIntroSeen: boolean;
  shareToken: string;
}
