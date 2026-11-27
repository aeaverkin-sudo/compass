import { CODE_TTL_MS, MAX_ATTEMPTS, codesMatch } from "@/shared/services/email-code";

export const RESEND_MS = 60 * 1000;
export const MAIL_HOUR_MS = 60 * 60 * 1000;
export const MAIL_PER_EMAIL = 5;
export const MAIL_PER_IP = 20;

export const WAIT_MINUTE = "Wait a minute and try again.";
export const TRY_LATER = "Try again in a few minutes.";

export { CODE_TTL_MS };

export type MailPlan =
  | { kind: "limited"; error: string }
  | { kind: "quiet" }
  | { kind: "code"; code: string }
  | { kind: "taken" };

/**
 * What this request may send. A live code stays quiet.
 * A taken address and a new one are not told apart by the result the browser sees.
 */
export function planSignupMail(input: {
  now: number;
  resend: boolean;
  taken: boolean;
  row: { expiresAt: number } | null;
  letters: number;
  requests: number;
  lastLetterAt: number | null;
  nextCode: string;
}): MailPlan {
  if (input.requests >= MAIL_PER_IP) return { kind: "limited", error: TRY_LATER };
  if (input.resend && input.lastLetterAt != null && input.now - input.lastLetterAt < RESEND_MS) {
    return { kind: "limited", error: WAIT_MINUTE };
  }
  if (!input.resend && !input.taken && input.row && input.row.expiresAt > input.now) return { kind: "quiet" };
  if (input.letters >= MAIL_PER_EMAIL) return { kind: "limited", error: TRY_LATER };
  if (input.taken) return { kind: "taken" };
  return { kind: "code", code: input.nextCode };
}

/** The browser gets one success body for every plan that is not a limit. */
export function signupMailStatus(plan: MailPlan): { status: number; error?: string } {
  if (plan.kind === "limited") return { status: 429, error: plan.error };
  return { status: 200 };
}

export function judgeSignupCode(input: {
  now: number;
  code: string;
  row: { hash: string; expiresAt: number; attempts: number } | null;
}): "ok" | "wrong" | "expired" | "limited" | "missing" {
  if (!input.row) return "missing";
  if (input.row.attempts >= MAX_ATTEMPTS) return "limited";
  if (input.row.expiresAt <= input.now) return "expired";
  if (!codesMatch(input.code.trim(), input.row.hash)) return "wrong";
  return "ok";
}
