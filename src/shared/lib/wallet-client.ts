export const WALLET_SOON = "Apple Wallet · coming soon";

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
