/**
 * An Edit draft stays in localStorage for two hours, so a killed app can reopen it.
 * A questionnaire stays in this tab only, until the tab is closed. Tabs do not share it.
 */

const KEY = "aded-fill-place";
const PHOTO_KEY = "aded-fill-photo";
const TTL_MS = 2 * 60 * 60 * 1000;

let retiredSharedQuestionnaire = false;

/** An old shared record that is a questionnaire is dropped once. An Edit draft there stays. */
function retireSharedQuestionnaire() {
  if (retiredSharedQuestionnaire || typeof window === "undefined") return;
  retiredSharedQuestionnaire = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const place = JSON.parse(raw) as { kind?: string };
    if (place?.kind !== "questionnaire") return;
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(PHOTO_KEY);
  } catch {
    // An Edit draft stays. A broken record is ignored when it is read.
  }
}

function dropLocalPhoto() {
  try {
    window.localStorage.removeItem(PHOTO_KEY);
  } catch {
    // The old picture leaves with the old questionnaire record.
  }
}

function dropSessionPhoto() {
  try {
    window.sessionStorage.removeItem(PHOTO_KEY);
  } catch {
    // The picture leaves with the tab.
  }
}

export type QuestionnaireZone = {
  id: string;
  title: string;
  custom: boolean;
  rows: { key: string; value: string; type?: string }[];
};

export type QuestionnairePlace = {
  kind: "questionnaire";
  at: number;
  href: string;
  name: string;
  email: string;
  password: string;
  agreed: boolean;
  zones: QuestionnaireZone[];
  headerKey: string | null;
  editKey: string | null;
  editText: string;
  seedId: string | null;
  seedText: string;
};

export type PortfolioPlace = {
  kind: "portfolio";
  at: number;
  cardId: string;
  rowId: string | null;
  sectionId: string | null;
  /** Text still in the row. Null once the row has been saved. */
  rowText: string | null;
};

export type FillPlace = QuestionnairePlace | PortfolioPlace;

function fresh(at: number) {
  return Number.isFinite(at) && Date.now() - at < TTL_MS;
}

export function createHref(href: string) {
  if (!href.startsWith("/create") || href.startsWith("//")) return null;
  return href;
}

function readQuestionnaireRaw(): QuestionnairePlace | null {
  retireSharedQuestionnaire();
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const place = JSON.parse(raw) as QuestionnairePlace;
    if (!place || place.kind !== "questionnaire" || !createHref(place.href)) {
      window.sessionStorage.removeItem(KEY);
      dropSessionPhoto();
      return null;
    }
    return place;
  } catch {
    return null;
  }
}

function readPortfolioRaw(): PortfolioPlace | null {
  retireSharedQuestionnaire();
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const place = JSON.parse(raw) as FillPlace;
    const keep = Boolean(
      place && place.kind === "portfolio" && typeof place.at === "number" && fresh(place.at) && place.cardId,
    );
    if (!keep) {
      window.localStorage.removeItem(KEY);
      dropLocalPhoto();
      return null;
    }
    dropLocalPhoto();
    const row = place as PortfolioPlace;
    return {
      ...row,
      rowId: typeof row.rowId === "string" ? row.rowId : null,
      sectionId: typeof row.sectionId === "string" ? row.sectionId : null,
      rowText: typeof row.rowText === "string" ? row.rowText : null,
    };
  } catch {
    return null;
  }
}

export function readQuestionnaire(): QuestionnairePlace | null {
  return readQuestionnaireRaw();
}

export function readPortfolio(): PortfolioPlace | null {
  return readPortfolioRaw();
}

export function writeQuestionnaire(place: Omit<QuestionnairePlace, "kind" | "at">) {
  if (!createHref(place.href) || typeof window === "undefined") return;
  retireSharedQuestionnaire();
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ ...place, kind: "questionnaire", at: Date.now() }));
  } catch {
    // A full tab keeps the live page. Closing it starts empty.
  }
}

export function writePortfolio(place: Omit<PortfolioPlace, "kind" | "at">) {
  if (!place.cardId || typeof window === "undefined") return;
  retireSharedQuestionnaire();
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...place, kind: "portfolio", at: Date.now() }));
  } catch {
    // A full disk keeps the live page. The next open starts empty.
  }
}

type PhotoPlace = { at: number; href: string; dataUrl: string };

/** The questionnaire photo, kept with the text until this tab closes. */
export function readQuestionnairePhoto(href: string): string | null {
  const place = readQuestionnaire();
  if (!place || place.href !== href) return null;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PHOTO_KEY);
    if (!raw) return null;
    const photo = JSON.parse(raw) as PhotoPlace;
    if (!photo || photo.href !== href || typeof photo.dataUrl !== "string" || !photo.dataUrl.startsWith("data:image/")) {
      dropSessionPhoto();
      return null;
    }
    return photo.dataUrl;
  } catch {
    return null;
  }
}

export function writeQuestionnairePhoto(href: string, dataUrl: string | null) {
  if (typeof window === "undefined" || !createHref(href)) return;
  try {
    if (!dataUrl?.startsWith("data:image/")) {
      dropSessionPhoto();
      return;
    }
    window.sessionStorage.setItem(PHOTO_KEY, JSON.stringify({ at: Date.now(), href, dataUrl }));
  } catch {
    // The text is already saved. A picture that does not fit stays on this page only.
  }
}

/** A file the Create button can upload after the page is opened again. */
export function photoFileFromDraft(dataUrl: string): File | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  try {
    const mime = dataUrl.slice(0, comma).match(/^data:([^;,]+)/)?.[1] || "image/jpeg";
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new File([bytes], "photo.jpg", { type: mime });
  } catch {
    return null;
  }
}

const SIGNIN_KEY = "aded-signin-email";

type SignInEmailPlace = { email: string; at: number };

/** Half-typed Sign in email. Not the questionnaire, and never the password. */
export function readSignInEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SIGNIN_KEY);
    if (!raw) return null;
    const place = JSON.parse(raw) as SignInEmailPlace;
    if (!place || typeof place.at !== "number" || !fresh(place.at) || typeof place.email !== "string") {
      window.localStorage.removeItem(SIGNIN_KEY);
      return null;
    }
    return place.email;
  } catch {
    return null;
  }
}

export function writeSignInEmail(email: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIGNIN_KEY, JSON.stringify({ email, at: Date.now() }));
  } catch {
    // The field stays on this page.
  }
}

export function clearSignInEmail() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SIGNIN_KEY);
  } catch {
    // It expires on its own.
  }
}

/** This tab's questionnaire only. The Edit draft stays. */
export function clearQuestionnaire() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // The questionnaire leaves with the tab.
  }
  dropSessionPhoto();
}

export function clearFillPlace() {
  if (typeof window === "undefined") return;
  retireSharedQuestionnaire();
  clearQuestionnaire();
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // The Edit draft expires on its own.
  }
  dropLocalPhoto();
}
