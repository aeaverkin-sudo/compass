export type EventPay = {
  isPaid: boolean;
  paymentUrl: string | null;
  paymentNote: string | null;
  price: number | null;
  currency: string;
};

export type PaymentTally = {
  guests: number;
  byCode: number;
  byName: number;
  notConfirmed: number;
};

export type StatementReport = {
  byCode: number;
  byName: number;
  notMatched: { amount: number; text: string }[];
  notes: string[];
};

export type PayView = {
  key: "confirmed" | "pending";
  label: string;
  long: string;
  method: string | null;
  dot: string;
};

function amountText(price: number): string {
  return price.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

/** The guest button. EUR, USD, and GBP use a symbol; anything else keeps the code. */
export function payButtonLabel(price: number | null, currency: string): string {
  if (price == null || !Number.isFinite(price)) return "Pay";
  const amount = amountText(price);
  const code = currency.trim().toUpperCase() || "EUR";
  if (code === "EUR") return `Pay €${amount}`;
  if (code === "USD") return `Pay $${amount}`;
  if (code === "GBP") return `Pay £${amount}`;
  return `Pay ${amount} ${code}`;
}

/** Ready poster string, such as €25. Empty when the price is missing. */
export function priceLabel(price: number | null, currency: string): string | null {
  if (price == null || !Number.isFinite(price)) return null;
  const amount = amountText(price);
  const code = currency.trim().toUpperCase() || "EUR";
  if (code === "EUR") return `€${amount}`;
  if (code === "USD") return `$${amount}`;
  if (code === "GBP") return `£${amount}`;
  return `${amount} ${code}`;
}

export function payView(paidStatus: string, paidSource: string | null): PayView {
  const confirmed = paidStatus === "paid" && (paidSource === "statement" || paidSource === "name" || paidSource === "manual");
  if (confirmed) {
    const method = paidSource === "statement" ? "by code" : paidSource === "name" ? "by name" : "manual";
    return { key: "confirmed", label: "Confirmed", long: "Payment confirmed", method, dot: "var(--pay-confirmed)" };
  }
  const saysPaid = paidStatus === "paid" && paidSource === "return";
  return { key: "pending", label: "Not confirmed", long: "Payment not confirmed", method: saysPaid ? "says paid" : null, dot: "var(--pay-pending)" };
}
