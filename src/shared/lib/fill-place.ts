/** Where a questionnaire or an Edit session was left. Kept two hours from the last touch. */

const KEY = "aded-fill-place";
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
      return null;
    }
    if (place.kind === "questionnaire" && createHref(place.href)) return place;
    if (place.kind === "portfolio" && place.cardId) return place;
    window.localStorage.removeItem(KEY);
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

export function clearFillPlace() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // The record expires on its own.
  }
}
