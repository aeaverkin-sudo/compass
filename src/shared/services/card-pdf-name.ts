/** Safe download name. Cyrillic and emoji become empty slots; empty → portfolio.pdf. */
export function cardPdfFilename(displayName: string) {
  const ascii = displayName
    .replace(/\n/g, " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]+/g, "")
    .replace(/[-\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${ascii || "portfolio"}.pdf`;
}
