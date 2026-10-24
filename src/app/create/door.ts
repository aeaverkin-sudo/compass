import { isEventInvitePath, isEventJoinPath, isEventTeamPath } from "@/shared/event/lookup";

const CARD_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

export type EntryInput = {
  name?: string;
  email?: string;
  event?: { lookup: string; guestToken?: string };
  sourceToken?: string;
  next?: string;
};

/** A return path the sign-in screen already accepts. Anything else is dropped. */
export function doorNext(path: string | null | undefined) {
  if (!path || path.includes("//") || path.includes("\\") || path.includes("#")) return undefined;
  if (path.startsWith("/save/") && !path.includes("?")) {
    return CARD_TOKEN.test(path.slice("/save/".length)) ? path : undefined;
  }
  if (isEventInvitePath(path) || isEventJoinPath(path) || isEventTeamPath(path)) return path;
  return undefined;
}

/** An existing account signs in and finishes the door there. The questionnaire is not shown again. */
export function signInHref(email: string | undefined, input: EntryInput) {
  const query = new URLSearchParams();
  query.set("signin", "1");
  if (email) query.set("email", email);
  if (input.event) {
    const next = input.event.guestToken
      ? `/e/${encodeURIComponent(input.event.lookup)}?g=${encodeURIComponent(input.event.guestToken)}&go=1`
      : `/e/${encodeURIComponent(input.event.lookup)}`;
    query.set("next", next);
  } else if (input.sourceToken) {
    query.set("next", `/save/${input.sourceToken}`);
  } else if (input.next) {
    query.set("next", input.next);
  }
  return `/register?${query.toString()}`;
}

/** Sign Up from the sign-in screen: the questionnaire, with the same door. */
export function questionnaireHref(next: string | null, email?: string | null) {
  const query = new URLSearchParams();
  const mail = email?.trim().toLowerCase();
  if (mail) query.set("email", mail);
  const safe = doorNext(next);
  if (safe?.startsWith("/save/")) {
    query.set("card", safe.slice("/save/".length));
  } else if (safe && isEventInvitePath(safe)) {
    const cut = safe.indexOf("?");
    const pathname = cut === -1 ? safe : safe.slice(0, cut);
    const lookup = decodeURIComponent(pathname.split("/").filter(Boolean)[1] ?? "");
    if (lookup) query.set("event", lookup);
    if (cut !== -1) {
      const guest = new URLSearchParams(safe.slice(cut + 1)).get("g");
      if (guest) query.set("g", guest);
    }
  } else if (safe) {
    query.set("next", safe);
  }
  const text = query.toString();
  return text ? `/create?${text}` : "/create";
}
