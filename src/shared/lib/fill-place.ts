/** Where a questionnaire or an Edit session was left. Kept two hours from the last touch. */

const KEY = "aded-fill-place";
const PHOTO_KEY = "aded-fill-photo";
const TTL_MS = 2 * 60 * 60 * 1000;

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
};

export type FillPlace = QuestionnairePlace | PortfolioPlace;

function fresh(at: number) {
  return Number.isFinite(at) && Date.now() - at < TTL_MS;
}

function dropPhoto() {
  try {
    window.localStorage.removeItem(PHOTO_KEY);
  } catch {
    // The picture expires with the questionnaire.
  }
}

export function createHref(href: string) {
  if (!href.startsWith("/create") || href.startsWith("//")) return null;
  return href;
}

function readRaw(): FillPlace | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const place = JSON.parse(raw) as FillPlace;
    if (!place || typeof place.at !== "number" || !fresh(place.at)) {
      window.localStorage.removeItem(KEY);
      dropPhoto();
      return null;
    }
    if (place.kind === "questionnaire" && createHref(place.href)) return place;
    if (place.kind === "portfolio" && place.cardId) {
      dropPhoto();
      return place;
    }
    window.localStorage.removeItem(KEY);
    dropPhoto();
    return null;
  } catch {
    return null;
  }
}

function write(place: FillPlace) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...place, at: Date.now() }));
  } catch {
    // A full disk keeps the live page. The next open starts empty.
  }
}

export function readQuestionnaire(): QuestionnairePlace | null {
  const place = readRaw();
  return place?.kind === "questionnaire" ? place : null;
}

export function readPortfolio(): PortfolioPlace | null {
  const place = readRaw();
  return place?.kind === "portfolio" ? place : null;
}

export function writeQuestionnaire(place: Omit<QuestionnairePlace, "kind" | "at">) {
  if (!createHref(place.href)) return;
  write({ ...place, kind: "questionnaire", at: Date.now() });
}

export function writePortfolio(place: Omit<PortfolioPlace, "kind" | "at">) {
  if (!place.cardId) return;
  write({ ...place, kind: "portfolio", at: Date.now() });
}

type PhotoPlace = { at: number; href: string; dataUrl: string };

/** The questionnaire photo, kept for the same two hours as the text. */
export function readQuestionnairePhoto(href: string): string | null {
  const place = readQuestionnaire();
  if (!place || place.href !== href) return null;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PHOTO_KEY);
    if (!raw) return null;
    const photo = JSON.parse(raw) as PhotoPlace;
    if (
      !photo ||
      photo.href !== href ||
      !fresh(photo.at) ||
      typeof photo.dataUrl !== "string" ||
      !photo.dataUrl.startsWith("data:image/")
    ) {
      dropPhoto();
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
      dropPhoto();
      return;
    }
    window.localStorage.setItem(PHOTO_KEY, JSON.stringify({ at: Date.now(), href, dataUrl }));
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

export function clearFillPlace() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // The record expires on its own.
  }
  dropPhoto();
}
