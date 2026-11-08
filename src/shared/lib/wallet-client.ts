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
 * `true` / `false` come from the server. `null` means this read failed, or Wallet is not set up.
 * A miss does not erase a previous answer.
 */
export async function cardInWallet(cardId: string): Promise<boolean | null> {
  try {
    const response = await fetch(`/api/wallet/status?card=${encodeURIComponent(cardId)}`, { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { configured?: boolean; added?: boolean };
    if (body.configured === false) return null;
    if (body.added === true || body.added === false) {
      writeWalletStatus(cardId, body.added);
      return body.added;
    }
  } catch {
    /* no server answer on this view */
  }
  return null;
}

/** `false` only when the server says Wallet is off. A failed read stays `null`. */
export async function walletIsConfigured(): Promise<boolean | null> {
  try {
    const response = await fetch("/api/wallet/status", { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { configured?: boolean };
    if (body.configured === true || body.configured === false) return body.configured;
  } catch {
    /* the buttons stay until a real answer */
  }
  return null;
}

const AGAIN_MS = 1500;

async function passReady(href: string) {
  const head = await fetch(href, { method: "HEAD", cache: "no-store" });
  return head.status === 200;
}

/**
 * Asks whether the pass can be opened, then opens that address.
 * iOS adds a pass from a real response with the pkpass type; a blob URL is not reliable.
 * Resolves false when the pass is not opened. The caller does not add a message.
 */
export async function openWalletPass(href: string): Promise<boolean> {
  try {
    const response = await fetch("/api/wallet/status", { cache: "no-store" });
    if (response.ok) {
      const body = (await response.json()) as { configured?: boolean };
      if (body.configured === false) return false;
    }
  } catch {
    // The pass request itself answers.
  }
  let ready = false;
  try {
    ready = await passReady(href);
  } catch {
    ready = false;
  }
  if (!ready) {
    await new Promise((resolve) => window.setTimeout(resolve, AGAIN_MS));
    try {
      ready = await passReady(href);
    } catch {
      ready = false;
    }
  }
  if (!ready) return false;
  window.location.href = href;
  return true;
}
