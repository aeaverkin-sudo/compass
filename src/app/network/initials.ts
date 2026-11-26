/** First letter or digit in the word. A word with neither is skipped. */
function firstMark(word: string): string | null {
  const mark = word.match(/\p{L}|\p{N}/u);
  return mark ? mark[0] : null;
}

/**
 * Up to two initials from the name as stored. No transliteration.
 * An empty name is an empty string.
 */
export function contactInitials(name: string): string {
  const letters: string[] = [];
  for (const word of name.trim().split(/\s+/)) {
    if (!word || letters.length === 2) continue;
    const mark = firstMark(word);
    if (!mark) continue;
    letters.push(mark.toLocaleUpperCase());
  }
  return letters.join("");
}
