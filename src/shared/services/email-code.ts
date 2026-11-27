import { createHash, randomInt, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Same lifetime as the address-change code. */
export const CODE_TTL_MS = 30 * 60 * 1000;

/** Wrong tries before the code stops. */
export const MAX_ATTEMPTS = 8;

export function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export function codesMatch(code: string, hash: string) {
  const next = Buffer.from(hashCode(code));
  const prev = Buffer.from(hash);
  if (next.length !== prev.length) return false;
  return timingSafeEqual(next, prev);
}

/** Eight letters for a signed-in address change. Not the signup code. */
export function starterCode() {
  let code = "";
  for (let i = 0; i < 8; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** Six digits. The signup letter puts this in the subject. */
export function digitCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}
