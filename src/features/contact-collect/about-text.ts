/**
 * One About text for the contact screen and Edit.
 * Note comes first, then the old About, with a blank line between them.
 * The same text is kept once. An event tag is not part of this text.
 * The joined text is not cut to the save limit.
 */
export function joinAbout(note: string, about: string): string {
  const first = note.trim();
  const second = about.trim();
  if (!first) return second;
  if (!second || first === second) return first;
  return `${first}\n\n${second}`;
}
