export type ComposerLine = { key: string; value: string };

/** Enter adds one draft row. An empty line adds nothing. An unchecked box adds nothing. */
export function commitComposerLine(
  lines: readonly ComposerLine[],
  text: string,
  included: boolean,
  key: string,
): ComposerLine[] {
  const typed = text.trim();
  if (!typed || !included) return [...lines];
  return [...lines, { key, value: typed }];
}

/** A library tick changes only the picked ids. The line still being typed stays as it is. */
export function toggleLibraryPick(picked: readonly string[], id: string): string[] {
  return picked.includes(id) ? picked.filter((item) => item !== id) : [...picked, id];
}
