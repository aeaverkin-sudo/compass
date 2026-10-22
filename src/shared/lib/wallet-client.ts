export const WALLET_SOON = "Apple Wallet · coming soon";

/** After the pass file is handed to Apple, the device registration arrives a few seconds later. */
export const WALLET_RECHECK_MS = [2000, 6000, 12000, 20000];

const WALLET_STATUS_KEY = "compass.wallet-status";
const walletStatus = new Map<string, boolean>();

function readWalletStatus(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(WALLET_STATUS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== "object") return {};
    const stored: Record<string, boolean> = {};
    for (const [cardId, added] of Object.entries(parsed)) {
      if (typeof added === "boolean") stored[cardId] = added;
    }
    return stored;
  } catch {
    return {};
  }
}

function writeWalletStatus(cardId: string, added: boolean) {
  walletStatus.set(cardId, added);
  if (typeof window === "undefined") return;
  try {
    const stored = readWalletStatus();
    if (stored[cardId] === added) return;
    stored[cardId] = added;
    window.localStorage.setItem(WALLET_STATUS_KEY, JSON.stringify(stored));
  } catch {
    /* private mode */
  }
}

/** The last answer for this card, if this phone has seen one. */
export function cachedWalletStatus(cardId: string): boolean | undefined {
  const live = walletStatus.get(cardId);
  if (live !== undefined) return live;
  const stored = readWalletStatus()[cardId];
  if (stored === undefined) return undefined;
  walletStatus.set(cardId, stored);
  return stored;
}

export function forgetWalletStatus() {
  walletStatus.clear();
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(WALLET_STATUS_KEY);
  } catch {
    /* private mode */
  }
}

/**
 * Whether this pass is in Wallet right now.
 * `true` / `false` come from the server. `null` means this read failed — keep the last label.
 */
export async function cardInWallet(cardId: string): Promise<boolean | null> {
  try {
    const response = await fetch(`/api/wallet/status?card=${encodeURIComponent(cardId)}`, { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { added?: boolean };
    if (body.added === true || body.added === false) {
      writeWalletStatus(cardId, body.added);
      return body.added;
    }
  } catch {
    /* no server answer on this view */
  }
  return null;
}

/**
 * Asks whether Wallet is set up, then opens the pass address itself.
 * iOS adds a pass from a real response with the pkpass type; a blob URL is not reliable.
 * Resolves false when Wallet is not ready, so the caller shows «coming soon».
 */
export async function openWalletPass(href: string): Promise<boolean> {
  try {
    const response = await fetch("/api/wallet/status", { cache: "no-store" });
    const body = response.ok ? ((await response.json()) as { configured?: boolean }) : null;
    if (!body?.configured) return false;
  } catch {
    return false;
  }
  window.location.href = href;
  return true;
}
