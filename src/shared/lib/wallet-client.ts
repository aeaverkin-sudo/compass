export const WALLET_SOON = "Apple Wallet · coming soon";

const HINT = "aded:wallet-hint";
/** Apple usually registers the pass within a few minutes of the file opening. */
const HINT_MS = 15 * 60 * 1000;

type Hint = { id: string; at: number };

function hints(): Hint[] {
  try {
    const raw = window.localStorage.getItem(HINT);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is Hint =>
        Boolean(entry) && typeof entry.id === "string" && typeof entry.at === "number",
    );
  } catch {
    return [];
  }
}

function hintIsFresh(cardId: string): boolean {
  const row = hints().find((entry) => entry.id === cardId);
  return Boolean(row && Date.now() - row.at < HINT_MS);
}

/** This browser just received the pass file. It fills in until Apple's registration arrives. */
export function hintWalletAdded(cardId: string) {
  try {
    const next = [{ id: cardId, at: Date.now() }, ...hints().filter((entry) => entry.id !== cardId)].slice(0, 12);
    window.localStorage.setItem(HINT, JSON.stringify(next));
  } catch {
    /* private mode: the status still follows the server */
  }
}

/**
 * Registered on the server, or — only while that answer is missing or still catching up —
 * the pass file was just handed to this browser.
 */
export async function cardInWallet(cardId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/wallet/status?card=${encodeURIComponent(cardId)}`, { cache: "no-store" });
    if (response.ok) {
      const body = (await response.json()) as { added?: boolean };
      if (body.added) return true;
      return hintIsFresh(cardId);
    }
  } catch {
    /* no server answer on this view */
  }
  return hintIsFresh(cardId);
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
