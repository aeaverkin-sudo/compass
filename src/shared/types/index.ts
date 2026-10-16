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
  | "threads"
  | "pinterest"
  | "snapchat"
  | "reddit"
  | "twitch"
  | "github"
  | "behance"
  | "dribbble"
  | "spotify"
  | "applemusic"
  | "calendly"
  | "appstore"
  | "playstore"
  | "website"
  | "email"
  | "phone"
  | "telegram"
  | "whatsapp"
  | "viber"
  | "signal"
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
  /**
   * Account the row was last saved under or loaded from. Absent: never on the server yet.
   * Set and missing from that account's rows means it was deleted on another device.
   */
  syncedOwner?: string;
}

export type CardStatus = "draft" | "published" | "archived" | "suspended";

export interface Card {
  id: string;
  displayName: string;
  photo?: string;
  /** Card avatar in Storage. The picture is served from `/f/{id}`. */
  photoAttachmentId?: string;
  /** Outline or shadow of the photo slot. Absent means the plain square. */
  photoLook?: "frame" | "shadow";
  title: string;
  status: CardStatus;
  /** Public QR token (`cards.public_token`). Not the legacy `User.shareToken`. */
  publicToken: string;
  /** Pretty public address: adedme.com/@handle. Empty until the name has letters. */
  handle?: string;
  /**
   * Public when true. At least one portfolio per owner stays public.
   * A new portfolio is created private (`false`): the column default is true.
   */
  listed?: boolean;
  /**
   * When true, people who saved this card can search its visible fields.
   * Absent means on, matching the column default.
   */
  searchable?: boolean;
  qrVersion: number;
  contactItemIds: string[];
  /** When true, card rows keep the user's manual order instead of auto shelves. */
  itemOrderManual?: boolean;
  /** Rubric keys in display order. Missing keys follow the default zone order. */
  rubricOrder?: string[];
  /** Пер-карточное переименование разделов: zoneId → своя подпись. */
  rubricLabels?: Record<string, string>;
  /** Пер-карточный перенос строки в другой раздел: itemId → zoneId. Сам айтем не меняется. */
  itemZones?: Record<string, string>;
  /** Base edit shelves hidden on this card. Empty placeholders stay gone; a shelf with rows still shows. */
  hiddenZones?: string[];
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
  /** True once, after the first library row, the tap-to-use hint has been shown. */
  firstRowHintSeen?: boolean;
  /** True once the add-to-library hint has been shown. */
  addLibraryHintSeen?: boolean;
  /** True once a guest's event pass has shown what to add next. */
  passAddHintSeen?: boolean;
  /** True once the one-time password reminder has been shown on the portfolio. */
  passwordHintSeen?: boolean;
  /** Where the QR side rail sits: beside the QR or beside the photo. */
  railDock?: "qr" | "photo";
  /** The side rail's look: the photo's shadow. Absent is Basic, the plain sky bar. */
  railLook?: "shadow";
  /** Gray interface. Photos stay in color. */
  monochrome?: boolean;
  shareToken: string;
}
