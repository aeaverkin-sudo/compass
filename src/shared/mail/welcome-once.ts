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
export const WELCOME_CLAIM_PORTFOLIO = "welcome_claim_portfolio";
export const WELCOME_RESEND_ID = "welcome_resend_id";
export const WELCOME_KEY_MS = 24 * 60 * 60 * 1000;

const CONFIRMED_REFUSAL = new Set([
  "validation_error",
  "invalid_from_address",
  "invalid_parameter",
  "missing_required_field",
  "invalid_attachment",
  "invalid_access",
  "invalid_api_key",
  "missing_api_key",
  "restricted_api_key",
  "monthly_quota_exceeded",
  "daily_quota_exceeded",
  "rate_limit_exceeded",
  "security_error",
  "invalid_idempotency_key",
]);

export type WelcomeAccount = { email: string; metadata: Record<string, unknown> };
export type WelcomePost = { accepted: true; id: string } | { accepted: false; inFlight: boolean; unknown?: boolean };
export type WelcomeStep = "sent" | "skipped" | "refused" | "unmarked" | "expired" | "busy" | "unknown";

/** GoTrue v2 keeps keys that are omitted and deletes a key only when the update sends null. */
export function appMetadataPatch(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(current), ...Object.keys(next)])) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) patch[key] = null;
    else if (next[key] !== current[key]) patch[key] = next[key];
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

export function applyAppMetadata(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

/** A stored claim keeps the first letter. A later portfolio must not change it. */
export function welcomeVariant(metadata: Record<string, unknown>, requested: boolean): boolean {
  if (metadata[WELCOME_CLAIM_PORTFOLIO] === "1") return true;
  if (metadata[WELCOME_CLAIM_PORTFOLIO] === "0") return false;
  return requested;
}

export function classifyWelcomeFailure(code: string): WelcomePost {
  if (code === "concurrent_idempotent_requests") return { accepted: false, inFlight: true };
  if (CONFIRMED_REFUSAL.has(code)) return { accepted: false, inFlight: false };
  return { accepted: false, inFlight: false, unknown: true };
}

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
  delete next[WELCOME_CLAIM_PORTFOLIO];
  return next;
}

export async function deliverWelcome(input: {
  now: number;
  key: string;
  read: () => Promise<WelcomeAccount | null>;
  write: (recipe: (metadata: Record<string, unknown>) => Record<string, unknown>) => Promise<boolean>;
  send: (key: string) => Promise<WelcomePost>;
  /** Written with the claim, so a later retry rebuilds the first letter. */
  claim?: Record<string, string>;
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
      return {
        ...current,
        [WELCOME_CLAIM_AT]: new Date(input.now).toISOString(),
        ...(input.claim ?? {}),
      };
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
    post = { accepted: false, inFlight: false, unknown: true };
  }
  if (!post.accepted && post.inFlight) return "busy";
  if (!post.accepted && post.unknown) return "unknown";
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
