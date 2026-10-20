import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import {
  ownerIdFromSerial,
  passAuthenticationToken,
  passTokenMatches,
  serialFromWalletPath,
  walletSerialFor,
} from "@/shared/services/wallet-serial";

export { ownerIdFromSerial, passAuthenticationToken, passTokenMatches, serialFromWalletPath, walletSerialFor };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DEVICES = 16;

type WalletSlot = { cardId: string; slot: number };
type WalletDevice = { serial: string; device: string; pushToken: string };

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

function missingTable(message: string): boolean {
  return /wallet_pass_devices|does not exist|schema cache/i.test(message);
}

async function rememberDevice(ownerId: string, serial: string, device: string, pushToken: string) {
  const admin = createAdminSupabaseClient();
  const saved = await admin.from("wallet_pass_devices").upsert(
    { device, serial, push_token: pushToken, owner_id: ownerId, updated_at: new Date().toISOString() },
    { onConflict: "device,serial" },
  );
  if (saved.error && !missingTable(saved.error.message)) console.error("[wallet] device row", saved.error.message);
}

async function forgetDevice(serial: string, device: string) {
  const admin = createAdminSupabaseClient();
  const removed = await admin.from("wallet_pass_devices").delete().eq("device", device).eq("serial", serial);
  if (removed.error && !missingTable(removed.error.message)) console.error("[wallet] device row", removed.error.message);
}

/** Apple Wallet registered a device for this pass. */
export async function registerPassDevice(serial: string, device: string, pushToken: string): Promise<"created" | "exists" | null> {
  const ownerId = ownerIdFromSerial(serial);
  if (!ownerId) return null;
  await rememberDevice(ownerId, serial, device, pushToken);
  const admin = createAdminSupabaseClient();
  let created = true;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const loaded = await admin.auth.admin.getUserById(ownerId);
    const user = loaded.data.user;
    if (!user) return null;
    const devices = readDevices(user.app_metadata?.wallet_devices);
    created = !devices.some((row) => row.serial === serial && row.device === device);
    const next = [{ serial, device, pushToken }, ...devices.filter((row) => !(row.serial === serial && row.device === device))].slice(
      0,
      MAX_DEVICES,
    );
    const saved = await admin.auth.admin.updateUserById(ownerId, {
      app_metadata: { ...user.app_metadata, wallet_devices: next },
    });
    if (saved.error) throw new Error(saved.error.message);
    const check = await admin.auth.admin.getUserById(ownerId);
    const stored = readDevices(check.data.user?.app_metadata?.wallet_devices);
    if (stored.some((row) => row.serial === serial && row.device === device)) return created ? "created" : "exists";
  }
  throw new Error("Could not store the Wallet registration");
}

/** Apple Wallet removed the pass from this device. */
export async function unregisterPassDevice(serial: string, device: string): Promise<boolean> {
  const ownerId = ownerIdFromSerial(serial);
  if (!ownerId) return false;
  await forgetDevice(serial, device);
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
  const listed = await admin.from("wallet_pass_devices").select("serial").eq("serial", serial).limit(1);
  if (!listed.error && (listed.data ?? []).length > 0) return true;
  if (listed.error && !missingTable(listed.error.message)) throw new Error(listed.error.message);
  return readDevices(user.app_metadata?.wallet_devices).some((row) => row.serial === serial);
}

/** Serials this device has registered, slot suffix included. Empty when the table is not there yet. */
export async function serialsForDevice(device: string): Promise<{ serials: string[]; updated: string } | null> {
  const admin = createAdminSupabaseClient();
  const listed = await admin.from("wallet_pass_devices").select("serial, updated_at").eq("device", device);
  if (listed.error) {
    if (missingTable(listed.error.message)) return null;
    throw new Error(listed.error.message);
  }
  const rows = (listed.data ?? []) as { serial: string; updated_at: string }[];
  const serials = rows.map((row) => row.serial).filter((serial) => ownerIdFromSerial(serial));
  if (serials.length === 0) return null;
  const newest = rows.reduce((max, row) => Math.max(max, new Date(row.updated_at).getTime()), 0);
  return { serials, updated: String(Math.floor(newest / 1000)) };
}
