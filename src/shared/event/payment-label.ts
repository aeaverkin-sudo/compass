export type EventPay = {
  isPaid: boolean;
  paymentUrl: string | null;
  price: number | null;
  currency: string;
  badgeGate: boolean;
};

/** The guest button. EUR, USD, and GBP use a symbol; anything else keeps the code. */
export function payButtonLabel(price: number | null, currency: string): string {
  if (price == null || !Number.isFinite(price)) return "Pay";
  const amount = price.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  const code = currency.trim().toUpperCase() || "EUR";
  if (code === "EUR") return `Pay €${amount}`;
  if (code === "USD") return `Pay $${amount}`;
  if (code === "GBP") return `Pay £${amount}`;
  return `Pay ${amount} ${code}`;
}
