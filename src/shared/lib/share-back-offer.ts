/** Grey Swap and the working Swap ask the same question: is there a card that can be sent. */
export function shareBackOffer(
  sendable: number,
  exchangeOpen: boolean,
  cardsReady: boolean,
): "send" | "create" | "closed" {
  if (!exchangeOpen) return "closed";
  if (sendable > 0) return "send";
  if (!cardsReady) return "closed";
  return "create";
}
