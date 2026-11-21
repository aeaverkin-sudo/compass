/** A contact collected by hand. Not a card and not a connection. */

export const CONTACT_SOURCES = ["manual", "scan", "voice", "photo"] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];

export type LineFlag = "wa" | "tg";

/** Which filled field is shown under the name. Absent on older rows. */
export type HeaderField = "position" | "company";

export type ExternalLine = {
  value: string;
  /** From detectContactType. The client does not choose it. */
  type: string;
  /** Letter marks on a phone. Absent when the line is not a phone. */
  flags?: LineFlag[];
};

/** A Web or Social row. Stored apart from Contacts. */
export type ContactLink = {
  value: string;
  type: string;
};

/** A file uploaded into the contact's private bucket. */
export type ContactFileRef = {
  id: string;
  name: string;
  type: string;
};

export type PushbackChannel = "email" | "whatsapp" | "telegram";

export type ExternalContact = {
  id: string;
  displayName: string;
  position: string;
  company: string;
  /** null / undefined: nothing under the name (legacy contacts). */
  headerField: HeaderField | null;
  note: string;
  eventTag: string;
  source: ContactSource;
  photoUrl: string | null;
  photoAttachmentId: string | null;
  lines: ExternalLine[];
  web: ContactLink[];
  social: ContactLink[];
  about: string;
  files: ContactFileRef[];
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
  headerField: HeaderField | null;
  note: string;
  eventTag: string;
  source: ContactSource;
  photoAttachmentId: string | null;
  lines: ExternalLine[];
  /**
   * Absent on a short save and on an old client.
   * Present only together: one update writes all four, or none of them.
   */
  web?: ContactLink[];
  social?: ContactLink[];
  about?: string;
  files?: ContactFileRef[];
};
