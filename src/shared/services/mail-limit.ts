import { createHmac } from "node:crypto";
import { isIP } from "node:net";

/**
 * HMAC-SHA256 for the signup and reset counters.
 * The key is MAIL_HASH_SECRET. A bare hash of the address is not stored.
 */
export function mailLimitKey(kind: "email" | "ip", value: string): string {
  const secret = process.env.MAIL_HASH_SECRET?.trim() ?? "";
  if (!secret) throw new Error("mail_hash_secret");
  return createHmac("sha256", secret).update(`${kind}\n${value}`, "utf8").digest("hex");
}

/**
 * The client address Cloudflare gives Render, in CF-Connecting-IP.
 * One address, set at the edge. The first X-Forwarded-For value is not read:
 * a client can send that one itself.
 */
export function renderClientIp(request: { headers: { get(name: string): string | null } }): string {
  const raw = request.headers.get("cf-connecting-ip")?.trim() ?? "";
  return isIP(raw) ? raw : "unknown";
}
