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
  /** The signed-in account that continued this form. A guest draft has none. */
  ownerId?: string;
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

const OAUTH_QUERY = new Set(["account", "saved"]);
const OAUTH_ATTEMPT = "aded-oauth-attempt";
const OAUTH_USED = "aded-oauth-used";
const OAUTH_TRY = "aded_oauth_try";
const OAUTH_BIND = "aded_oauth_bind";
const ATTEMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const OAUTH_RETURN_MS = 10 * 60 * 1000;

export type OAuthAttempt = { id: string; href: string; at: number };
export type OAuthBind = { attemptId: string; userId: string; at: number };

function doorPairs(href: string): [string, string][] | null {
  const safe = createHref(href);
  if (!safe) return null;
  let url: URL;
  try {
    url = new URL(safe, "https://adedme.com");
  } catch {
    return null;
  }
  if (url.pathname !== "/create") return null;
  return [...url.searchParams.entries()]
    .filter(([key]) => !OAUTH_QUERY.has(key))
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
}

function pairsMatch(left: [string, string][], right: [string, string][]): boolean {
  return left.length === right.length && left.every((pair, index) => pair[0] === right[index]?.[0] && pair[1] === right[index]?.[1]);
}

/** The same questionnaire. `account` and `saved` may differ. Each parameter keeps its own value. */
export function sameCreateDoor(left: string, right: string): boolean {
  const a = doorPairs(left);
  const b = doorPairs(right);
  if (!a || !b) return false;
  return pairsMatch(a, b);
}

/**
 * Scan opens `/create?card=…&pick=1`. The OAuth return of that same card drops
 * `pick` and adds `account` and `saved`. No other `pick` value is ignored.
 */
function sameScanReturn(attemptHref: string, here: string): boolean {
  if (sameCreateDoor(attemptHref, here)) return true;
  const attemptPairs = doorPairs(attemptHref);
  const herePairs = doorPairs(here);
  if (!attemptPairs || !herePairs) return false;
  const pick = attemptPairs.filter(([key]) => key === "pick");
  if (pick.length !== 1 || pick[0]?.[1] !== "1") return false;
  if (herePairs.some(([key]) => key === "pick")) return false;
  const rest = attemptPairs.filter(([key]) => key !== "pick");
  const card = rest.find(([key]) => key === "card")?.[1] ?? "";
  if (!card) return false;
  return pairsMatch(rest, herePairs);
}

/** Fields typed into the portfolio. The sign-in email, password and consent box stay out. */
export function portfolioFields(place: QuestionnairePlace) {
  return {
    name: place.name,
    zones: place.zones,
    headerKey: place.headerKey,
    editKey: place.editKey,
    editText: place.editText,
    seedId: place.seedId,
    seedText: place.seedText,
  };
}

/**
 * The attempt id is the one baked into that OAuth start. A newer cookie must not
 * rename the sign-in that is already coming back.
 */
export function oauthCallbackBind(input: {
  queryAttemptId: string | null;
  cookieAttemptId: string | null;
  userId: string | null;
  confirmed: boolean;
  fromCreate: boolean;
  questionnaire: boolean;
  now: number;
}): OAuthBind | null {
  if (!input.fromCreate || !input.questionnaire || !input.confirmed || !input.userId) return null;
  if (!Number.isFinite(input.now)) return null;
  const attemptId = input.queryAttemptId?.trim() ?? "";
  if (!ATTEMPT_ID.test(attemptId)) return null;
  // cookieAttemptId is not the source. A newer shared cookie must not rename this return.
  return { attemptId, userId: input.userId, at: input.now };
}

function freshAttempt(at: number, now: number): boolean {
  return Number.isFinite(at) && Number.isFinite(now) && at <= now + 60_000 && now - at <= OAUTH_RETURN_MS;
}

/** The guest form restores a draft only when no account owns it, and only on the same address. */
export function guestQuestionnaireDraft(
  saved: QuestionnairePlace | null,
  here: string,
): QuestionnairePlace | null {
  if (!saved || saved.ownerId || saved.href !== here) return null;
  return saved;
}

/** An account draft reopens only for the confirmed account that owns it. */
export function ownedQuestionnaireDraft(input: {
  saved: QuestionnairePlace | null;
  here: string;
  sessionUserId: string | null;
  confirmed: boolean;
}): { fields: ReturnType<typeof portfolioFields>; photoHref: string } | null {
  const { saved } = input;
  if (!saved || !saved.ownerId || !input.confirmed || !input.sessionUserId) return null;
  if (saved.ownerId !== input.sessionUserId || saved.href !== input.here) return null;
  return { fields: portfolioFields(saved), photoHref: saved.href };
}

/**
 * The guest portfolio, only when this tab's unused attempt was finished by
 * that same confirmed account and the draft has no owner yet.
 * A shared "create" flag or a matching address is not enough.
 * The photo stays with the original draft address.
 */
export function oauthPortfolioDraft(input: {
  saved: QuestionnairePlace | null;
  here: string;
  attempt: OAuthAttempt | null;
  bind: OAuthBind | null;
  sessionUserId: string | null;
  confirmed: boolean;
  usedAttemptId: string | null;
  now: number;
}): { fields: ReturnType<typeof portfolioFields>; photoHref: string } | null {
  const { saved, attempt, bind } = input;
  if (!saved || saved.ownerId || !attempt || !bind) return null;
  if (!input.confirmed || !input.sessionUserId) return null;
  if (input.sessionUserId !== bind.userId) return null;
  if (!ATTEMPT_ID.test(attempt.id) || attempt.id !== bind.attemptId) return null;
  if (input.usedAttemptId === attempt.id) return null;
  if (!freshAttempt(attempt.at, input.now) || !freshAttempt(bind.at, input.now)) return null;
  if (!sameCreateDoor(saved.href, attempt.href) || !sameScanReturn(attempt.href, input.here)) return null;
  return { fields: portfolioFields(saved), photoHref: saved.href };
}

function cookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split("; ");
  const match = parts.find((part) => part.startsWith(`${name}=`));
  if (!match) return null;
  const value = match.slice(name.length + 1);
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=600; SameSite=Lax${secure}`;
}

function clearCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/** This tab is leaving for Google or Apple from the questionnaire now on screen. */
export function markQuestionnaireOAuth(href: string) {
  if (typeof window === "undefined" || !createHref(href)) return;
  const attempt: OAuthAttempt = { id: crypto.randomUUID(), href, at: Date.now() };
  try {
    window.sessionStorage.setItem(OAUTH_ATTEMPT, JSON.stringify(attempt));
  } catch {
    return;
  }
  writeCookie(OAUTH_TRY, attempt.id);
}

export function readOAuthAttempt(): OAuthAttempt | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(OAUTH_ATTEMPT);
    if (!raw) return null;
    const attempt = JSON.parse(raw) as { id?: unknown; href?: unknown; at?: unknown };
    const href = typeof attempt.href === "string" ? attempt.href : "";
    if (typeof attempt.id !== "string" || !ATTEMPT_ID.test(attempt.id) || !createHref(href)) return null;
    if (typeof attempt.at !== "number") return null;
    return { id: attempt.id, href, at: attempt.at };
  } catch {
    return null;
  }
}

/** The callback's record of which confirmed account finished this tab's attempt. */
export function readOAuthBind(): OAuthBind | null {
  const raw = cookieValue(OAUTH_BIND);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { attemptId?: unknown; userId?: unknown; at?: unknown };
    if (typeof parsed.attemptId !== "string" || !ATTEMPT_ID.test(parsed.attemptId)) return null;
    if (typeof parsed.userId !== "string" || !parsed.userId || parsed.userId.length > 128) return null;
    if (typeof parsed.at !== "number") return null;
    return { attemptId: parsed.attemptId, userId: parsed.userId, at: parsed.at };
  } catch {
    return null;
  }
}

export function readUsedOAuthAttempt(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = window.sessionStorage.getItem(OAUTH_USED);
    return id && ATTEMPT_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function markOAuthAttemptUsed(id: string) {
  if (typeof window === "undefined" || !ATTEMPT_ID.test(id)) return;
  try {
    window.sessionStorage.setItem(OAUTH_USED, id);
  } catch {
    // A used attempt that cannot be stored must not be replayed from the cookie.
    clearCookie(OAUTH_BIND);
    clearCookie(OAUTH_TRY);
  }
}

export function clearQuestionnaireOAuth() {
  const attempt = readOAuthAttempt();
  if (attempt && cookieValue(OAUTH_TRY) === attempt.id) {
    clearCookie(OAUTH_TRY);
    clearCookie(OAUTH_BIND);
  }
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(OAUTH_ATTEMPT);
  } catch {
    // The attempt leaves with the tab.
  }
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
    if (typeof place.password === "string" && place.password) {
      try {
        window.sessionStorage.setItem(KEY, JSON.stringify({ ...place, password: "" }));
      } catch {
        // The old password leaves on the next write.
      }
    }
    const ownerId = typeof place.ownerId === "string" && place.ownerId ? place.ownerId : undefined;
    return { ...place, password: "", ...(ownerId ? { ownerId } : {}) };
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
  const ownerId = typeof place.ownerId === "string" && place.ownerId ? place.ownerId : undefined;
  try {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({
        ...place,
        password: "",
        ...(ownerId ? { ownerId } : { ownerId: undefined }),
        kind: "questionnaire",
        at: Date.now(),
      }),
    );
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
  clearQuestionnaireOAuth();
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
