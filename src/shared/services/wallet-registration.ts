import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SERIAL = /^person-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-(\d+))?$/i;
const MAX_DEVICES = 16;

type WalletSlot = { cardId: string; slot: number };
type WalletDevice = { serial: string; device: string; pushToken: string };

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

function readSlots(value: unknown): WalletSlot[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is WalletSlot =>
      Boolean(entry) && typeof entry.cardId === "string" && Number.isInteger(entry.slot) && entry.slot >= 1,
  );
}

function readDevices(value: unknown): WalletDevice[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is WalletDevice =>
      Boolean(entry) &&
      typeof entry.serial === "string" &&
      typeof entry.device === "string" &&
      typeof entry.pushToken === "string",
  );
}

async function accountUser(ownerId: string) {
  const admin = createAdminSupabaseClient();
  const loaded = await admin.auth.admin.getUserById(ownerId);
  return { admin, user: loaded.data.user };
}

/** Apple Wallet registered a device for this pass. */
export async function registerPassDevice(serial: string, device: string, pushToken: string): Promise<"created" | "exists" | null> {
  const ownerId = ownerIdFromSerial(serial);
  if (!ownerId) return null;
  const { admin, user } = await accountUser(ownerId);
  if (!user) return null;
  const devices = readDevices(user.app_metadata?.wallet_devices);
  const present = devices.some((row) => row.serial === serial && row.device === device);
  const next = [{ serial, device, pushToken }, ...devices.filter((row) => !(row.serial === serial && row.device === device))].slice(
    0,
    MAX_DEVICES,
  );
  const saved = await admin.auth.admin.updateUserById(ownerId, {
    app_metadata: { ...user.app_metadata, wallet_devices: next },
  });
  if (saved.error) throw new Error(saved.error.message);
  return present ? "exists" : "created";
}

/** Apple Wallet removed the pass from this device. */
export async function unregisterPassDevice(serial: string, device: string): Promise<boolean> {
  const ownerId = ownerIdFromSerial(serial);
  if (!ownerId) return false;
  const { admin, user } = await accountUser(ownerId);
  if (!user) return false;
  const devices = readDevices(user.app_metadata?.wallet_devices);
  const next = devices.filter((row) => !(row.serial === serial && row.device === device));
  if (next.length === devices.length) return true;
  const saved = await admin.auth.admin.updateUserById(ownerId, {
    app_metadata: { ...user.app_metadata, wallet_devices: next },
  });
  if (saved.error) throw new Error(saved.error.message);
  return true;
}

/** True when Wallet has registered a device for this card's pass. */
export async function cardPassRegistered(ownerId: string, cardId: string): Promise<boolean> {
  if (!UUID.test(cardId)) return false;
  const { admin, user } = await accountUser(ownerId);
  if (!user) return false;
  const owned = await admin.from("cards").select("id").eq("id", cardId).eq("owner_id", ownerId).maybeSingle();
  if (owned.error || !owned.data) return false;
  const slot = readSlots(user.app_metadata?.wallet_cards).find((entry) => entry.cardId === cardId);
  if (!slot) return false;
  const serial = walletSerialFor(ownerId, slot.slot);
  return readDevices(user.app_metadata?.wallet_devices).some((row) => row.serial === serial);
}
