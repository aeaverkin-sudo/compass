/** Sky under a row that just moved or was matched, fading out. The look is `.row-flash` in globals.css. */
export function flashRow(node: HTMLElement | null | undefined) {
  if (!node) return;
  node.classList.remove("row-flash");
  void node.offsetWidth;
  node.classList.add("row-flash");
  node.addEventListener("animationend", () => node.classList.remove("row-flash"), { once: true });
}
