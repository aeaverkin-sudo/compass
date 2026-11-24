/**
 * One welcome per account, including two app instances and a mark that fails
 * after Resend has already accepted the letter.
 *
 * Resend keeps an idempotency key for 24 hours. Inside that window a retry
 * gets the first send's result. After it, the same key would send a second
 * letter, so an unresolved claim is not sent again.
 */

export const WELCOME_MAIL_AT = "welcome_mail_at";
export const WELCOME_CLAIM_AT = "welcome_claim_at";
export const WELCOME_RESEND_ID = "welcome_resend_id";
export const WELCOME_KEY_MS = 24 * 60 * 60 * 1000;

export type WelcomeAccount = { email: string; metadata: Record<string, unknown> };
export type WelcomePost = { accepted: true; id: string } | { accepted: false; inFlight: boolean };
export type WelcomeStep = "sent" | "skipped" | "refused" | "unmarked" | "expired" | "busy";

export function welcomeIdempotencyKey(userId: string): string | null {
  const id = userId.trim();
  if (!id || id.length > 128 || /[^A-Za-z0-9_-]/.test(id)) return null;
  return `welcome/${id}`;
}

function marked(metadata: Record<string, unknown>): boolean {
  return typeof metadata[WELCOME_MAIL_AT] === "string" && metadata[WELCOME_MAIL_AT].length > 0;
}

function claimTime(metadata: Record<string, unknown>): number | null {
  const raw = metadata[WELCOME_CLAIM_AT];
  if (typeof raw !== "string") return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : null;
}

function withoutClaim(metadata: Record<string, unknown>): Record<string, unknown> {
  const next = { ...metadata };
  delete next[WELCOME_CLAIM_AT];
  return next;
}

export async function deliverWelcome(input: {
  now: number;
  key: string;
  read: () => Promise<WelcomeAccount | null>;
  write: (recipe: (metadata: Record<string, unknown>) => Record<string, unknown>) => Promise<boolean>;
  send: (key: string) => Promise<WelcomePost>;
}): Promise<WelcomeStep> {
  const first = await input.read();
  if (!first?.email) return "skipped";
  if (marked(first.metadata)) return "skipped";
  const claimed = claimTime(first.metadata);
  if (claimed !== null && input.now - claimed >= WELCOME_KEY_MS) return "expired";

  if (claimed === null) {
    const wrote = await input.write((current) => {
      if (marked(current)) return current;
      if (claimTime(current) !== null) return current;
      return { ...current, [WELCOME_CLAIM_AT]: new Date(input.now).toISOString() };
    });
    if (!wrote) return "unmarked";
    const again = await input.read();
    if (!again?.email) return "skipped";
    if (marked(again.metadata)) return "skipped";
    const freshClaim = claimTime(again.metadata);
    if (freshClaim !== null && input.now - freshClaim >= WELCOME_KEY_MS) return "expired";
  }

  let post: WelcomePost;
  try {
    post = await input.send(input.key);
  } catch {
    post = { accepted: false, inFlight: false };
  }
  if (!post.accepted && post.inFlight) return "busy";
  if (!post.accepted) {
    const current = await input.read();
    if (current && marked(current.metadata)) return "skipped";
    await input.write((latest) => (marked(latest) ? latest : withoutClaim(latest)));
    return "refused";
  }

  const wrote = await input.write((current) => {
    if (marked(current)) return current;
    return {
      ...current,
      [WELCOME_CLAIM_AT]:
        typeof current[WELCOME_CLAIM_AT] === "string" ? current[WELCOME_CLAIM_AT] : new Date(input.now).toISOString(),
      [WELCOME_MAIL_AT]: new Date(input.now).toISOString(),
      [WELCOME_RESEND_ID]: post.id,
    };
  });
  return wrote ? "sent" : "unmarked";
}
