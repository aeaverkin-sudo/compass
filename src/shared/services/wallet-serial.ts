import { createHmac, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SERIAL = /^person-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-(\d+))?$/i;
/** Last segment of a Wallet register or pass URL. The slot suffix stays on the serial. */
const SERIAL_IN_PATH = /\/v1\/(?:devices\/[^/]+\/registrations|passes)\/[^/]+\/([^/]+)$/;

/** The serial Wallet already has for this place. Slot 1 keeps the original form. */
export function walletSerialFor(ownerId: string, slot: number): string {
  return slot === 1 ? `person-${ownerId}` : `person-${ownerId}-${slot}`;
}

export function ownerIdFromSerial(serial: string): string | null {
  const match = SERIAL.exec(serial);
  const ownerId = match?.[1];
  if (!ownerId || !UUID.test(ownerId)) return null;
  const extra = match?.[2];
  if (extra && Number(extra) < 2) return null;
  return ownerId;
}

/** Full serial from the request path, including `-2` / `-3`. */
export function serialFromWalletPath(pathname: string): string | null {
  const raw = SERIAL_IN_PATH.exec(pathname)?.[1];
  if (!raw) return null;
  let serial = raw;
  try {
    serial = decodeURIComponent(raw);
  } catch {
    serial = raw;
  }
  return ownerIdFromSerial(serial) ? serial : null;
}

/** Stable token baked into the pass. Apple sends it back when the pass is added. */
export function passAuthenticationToken(serial: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("wallet pass token missing");
  return createHmac("sha256", secret).update(`aded-wallet-device.${serial}`).digest("base64url");
}

export function passTokenMatches(serial: string, given: string): boolean {
  if (!ownerIdFromSerial(serial) || !given) return false;
  try {
    const expected = Buffer.from(passAuthenticationToken(serial));
    const actual = Buffer.from(given);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
