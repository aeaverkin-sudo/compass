/** Grey Swap and the working Swap ask the same question: is there a card that can be sent. */
export type ShareAttempt = "already" | "declined" | "send";

/** One Swap toward this card. A link already there, or a stored attempt, is not sent again. */
export function shareAttempt(input: { marked: boolean; linked: boolean; accepting: boolean }): ShareAttempt {
  if (input.marked || input.linked) return "already";
  if (!input.accepting) return "declined";
  return "send";
}

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
