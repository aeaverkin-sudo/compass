export const WALLET_SOON = "Apple Wallet · coming soon";

const HINT = "aded:wallet-hint";
/** Apple usually registers the pass within a few minutes of the file opening. */
const HINT_MS = 15 * 60 * 1000;

type Hint = { id: string; at: number; seen?: boolean };

function hints(): Hint[] {
  try {
    const raw = window.localStorage.getItem(HINT);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is Hint =>
        Boolean(entry) &&
        typeof entry.id === "string" &&
        typeof entry.at === "number" &&
        (entry.seen === undefined || typeof entry.seen === "boolean"),
    );
  } catch {
    return [];
  }
}

function writeHints(rows: Hint[]) {
  try {
    window.localStorage.setItem(HINT, JSON.stringify(rows.slice(0, 12)));
  } catch {
    /* private mode: the status still follows the server */
  }
}

function hintRow(cardId: string): Hint | undefined {
  return hints().find((entry) => entry.id === cardId);
}

function hintIsFresh(cardId: string): boolean {
  const row = hintRow(cardId);
  return Boolean(row && Date.now() - row.at < HINT_MS);
}

/** Apple has confirmed this pass once. A later `added: false` means it was removed. */
function markSeen(cardId: string) {
  const prev = hintRow(cardId);
  writeHints([{ id: cardId, at: prev?.at ?? Date.now(), seen: true }, ...hints().filter((entry) => entry.id !== cardId)]);
}

function clearHint(cardId: string) {
  writeHints(hints().filter((entry) => entry.id !== cardId));
}

/** This browser just received the pass file. It fills in until Apple's registration arrives. */
export function hintWalletAdded(cardId: string) {
  const prev = hintRow(cardId);
  writeHints([{ id: cardId, at: Date.now(), seen: prev?.seen }, ...hints().filter((entry) => entry.id !== cardId)]);
}

/**
 * Whether this pass is in Wallet right now.
 * `true` / `false` come from the server. `null` means this read failed — keep the last label.
 * A fresh hand-off still counts until Apple's first registration; after that, a removal wins.
 */
export async function cardInWallet(cardId: string): Promise<boolean | null> {
  try {
    const response = await fetch(`/api/wallet/status?card=${encodeURIComponent(cardId)}`, { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { added?: boolean };
    if (body.added === true) {
      markSeen(cardId);
      return true;
    }
    if (body.added === false) {
      if (hintRow(cardId)?.seen) {
        clearHint(cardId);
        return false;
      }
      return hintIsFresh(cardId);
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
