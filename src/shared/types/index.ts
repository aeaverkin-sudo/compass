export type NextScanAddonType = "text" | "voice" | "selfie";

export interface NextScanAddon {
  id: string;
  type: NextScanAddonType;
  content: string;
  createdAt: string;
  /** Ready file in transfer-assets. Text notes leave this unset. */
  attachmentId?: string;
}

/** One-time notes/selfie delivered on the next share view only. */
/** One text and one selfie for the next scan. Voice stays in the schema for later. */
export const MAX_NEXT_SCAN_NOTES = 2;

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
  /** Pool file pointer (`items.attachment_id`). Set only once the upload is ready. */
  attachmentId?: string;
  order: number;
}

export type CardStatus = "draft" | "published" | "archived" | "suspended";

export interface Card {
  id: string;
  displayName: string;
  photo?: string;
  /** Card avatar in Storage. The picture is served from `/f/{id}`. */
  photoAttachmentId?: string;
  title: string;
  status: CardStatus;
  /** Public QR token (`cards.public_token`). Not the legacy `User.shareToken`. */
  publicToken: string;
  /**
   * Public when true. At least one portfolio per owner stays public.
   * A new portfolio is created private (`false`): the column default is true.
   */
  listed?: boolean;
  qrVersion: number;
  contactItemIds: string[];
  /** When true, card rows keep the user's manual order instead of auto shelves. */
  itemOrderManual?: boolean;
  /** Row from the position zone shown under the portfolio title. Absent until the user picks one. */
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
