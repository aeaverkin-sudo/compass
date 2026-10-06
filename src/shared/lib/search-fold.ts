/** Lower case, without accents, so "ines" matches "Inês". */
export function foldSearch(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
}
