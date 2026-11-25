export type LocalLine = { key: string; value: string; onCard: boolean };

/** What Enter does with text that is already trimmed and stored the way a row is stored. */
export function decideComposerLine(
  text: string,
  local: readonly LocalLine[],
  library: readonly { id: string; value: string }[],
):
  | { kind: "empty" }
  | { kind: "library"; id: string }
  | { kind: "local"; key: string }
  | { kind: "add" } {
  const typed = text.trim();
  if (!typed) return { kind: "empty" };
  const known = library.find((item) => item.value.trim() === typed);
  if (known) return { kind: "library", id: known.id };
  const row = local.find((item) => item.value.trim() === typed);
  if (row) return { kind: "local", key: row.key };
  return { kind: "add" };
}
