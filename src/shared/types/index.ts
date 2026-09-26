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
  | "position"
  | "custom";

export interface ContactItem {
  id: string;
  type: ContactType;
  label: string;
  value: string;
  url: string;
  order: number;
}

export type CardStatus = "draft" | "published" | "archived" | "suspended";

export interface Card {
  id: string;
  displayName: string;
  photo?: string;
  title: string;
  status: CardStatus;
  /** Public QR token (`cards.public_token`). Not the legacy `User.shareToken`. */
  publicToken: string;
  /** First card is public. Extra cards are not. Not shown in the UI yet. */
  isPublic?: boolean;
  qrVersion: number;
  contactItemIds: string[];
  /** When true, card rows keep the user's manual order instead of auto shelves. */
  itemOrderManual?: boolean;
  /** Contact item shown under the name. Absent until the user picks one. */
  headerItemId?: string;
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
  /** True after the first empty card's blue hint has been used. */
  emptyFillHintSeen?: boolean;
  shareToken: string;
}
