export const WALLET_SOON = "Apple Wallet · coming soon";

/** After the pass file is handed to Apple, the device registration arrives a few seconds later. */
export const WALLET_RECHECK_MS = [2000, 6000, 12000, 20000];

/**
 * Whether this pass is in Wallet right now.
 * `true` / `false` come from the server. `null` means this read failed — keep the last label.
 */
export async function cardInWallet(cardId: string): Promise<boolean | null> {
  try {
    const response = await fetch(`/api/wallet/status?card=${encodeURIComponent(cardId)}`, { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { added?: boolean };
    if (body.added === true) return true;
    if (body.added === false) return false;
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
