/** The open-link questionnaire, kept in this browser until Create portfolio. */
export type CreateDraft = {
  email: string;
  website: string;
  name: string;
};

function draftKey(lookup: string, guestToken: string | null) {
  return `aded:create-portfolio:${lookup}:${guestToken ?? "open"}`;
}

export function readDraft(lookup: string, guestToken: string | null): CreateDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(lookup, guestToken));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CreateDraft>;
    return {
      email: typeof parsed.email === "string" ? parsed.email : "",
      website: typeof parsed.website === "string" ? parsed.website : "",
      name: typeof parsed.name === "string" ? parsed.name : "",
    };
  } catch {
    return null;
  }
}

export function writeDraft(lookup: string, guestToken: string | null, draft: CreateDraft) {
  try {
    window.localStorage.setItem(draftKey(lookup, guestToken), JSON.stringify(draft));
  } catch {
    /* private mode: the screen still works, the draft is not kept */
  }
}

export function dropDraft(lookup: string, guestToken: string | null) {
  try {
    window.localStorage.removeItem(draftKey(lookup, guestToken));
  } catch {
    /* storage unavailable */
  }
}
