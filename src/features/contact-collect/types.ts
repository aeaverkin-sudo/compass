/** A contact collected by hand. Not a card and not a connection. */

export const CONTACT_SOURCES = ["manual", "scan", "voice", "photo"] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];

export type LineFlag = "wa" | "tg";

export type ExternalLine = {
  value: string;
  /** From detectContactType. The client does not choose it. */
  type: string;
  /** Letter marks on a phone. Absent when the line is not a phone. */
  flags?: LineFlag[];
};

export type PushbackChannel = "email" | "whatsapp" | "telegram";

export type ExternalContact = {
  id: string;
  displayName: string;
  position: string;
  company: string;
  note: string;
  eventTag: string;
  source: ContactSource;
  photoUrl: string | null;
  photoAttachmentId: string | null;
  lines: ExternalLine[];
  createdAt: string;
  updatedAt: string;
  pushbackAt: string | null;
  pushbackChannel: PushbackChannel | null;
  pushbackCardId: string | null;
  searchText: string;
};

/** What a save may change. Pushback columns are not in here. */
export type ExternalContactInput = {
  displayName: string;
  position: string;
  company: string;
  note: string;
  eventTag: string;
  source: ContactSource;
  photoAttachmentId: string | null;
  lines: ExternalLine[];
};
