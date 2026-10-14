import { publicCardPath } from "@/shared/services/public-card-url";

/**
 * What the Wallet passes carry, without the signing (ТЗ 35 builds the file).
 * Back fields are tappable phrases that open Safari; the plain value keeps the full URL.
 */

/** `attributedValue` shows a tappable phrase; `value` keeps the address for older Wallet. */
export type WalletBackField = { key: string; label?: string; value: string; attributedValue?: string };

/**
 * Up to two passes per person, one per card. Put in Wallet makes that card the primary one;
 * a third card replaces the pass put in Wallet longest ago.
 * A guest without an account holds the same pass of their one card; the door scanner takes any card of a registered owner.
 */
export function walletCardQr(origin: string, card: { publicToken: string; handle?: string }): string {
  return `${origin}${publicCardPath(card)}`;
}
