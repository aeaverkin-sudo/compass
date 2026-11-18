/**
 * A public card address. `/c/` and `/@` are the addresses already given out.
 * `/{code}/@slug` is a new card. The code is seven signs, or three already given out,
 * and always has a letter and a digit, so it cannot be a section of the site.
 * A note rides in front of the nick: `/{code}-{note}/@slug`, or `/-{note}/@slug`
 * when the card has no code. The same pieces build the rewrites in next.config.
 * `proxy.ts` and the browser session check both use this.
 */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Seven signs now, three already given out. A letter and a digit. */
const CARD_CODE = `(?=[${ALPHABET}]*[a-z])(?=[${ALPHABET}]*[23456789])(?:[${ALPHABET}]{7}|[${ALPHABET}]{3})`;

/** The note in a share link. Seven signs, same alphabet. */
const NOTE_CODE = `[${ALPHABET}]{7}`;

/** The nick after a card code. No hyphen: the hyphen belongs to the code. */
const CODED_SLUG = "[a-z0-9]+";

/** A nick already given out: `anna`, or `anna-2` when the plain name was taken. */
const PLAIN_HANDLE = "[a-z0-9]+(?:-[0-9]+)?";

export const publicCardRewrites = [
  {
    source: `/:code(${CARD_CODE})-:note(${NOTE_CODE})/@:slug(${CODED_SLUG})`,
    destination: "/c/h/:code-:slug?n=:note",
  },
  {
    source: `/-:note(${NOTE_CODE})/@:slug(${PLAIN_HANDLE})`,
    destination: "/c/h/:slug?n=:note",
  },
  {
    source: `/:code(${CARD_CODE})/@:slug(${CODED_SLUG})`,
    destination: "/c/h/:code-:slug",
  },
  { source: "/@:handle", destination: "/c/h/:handle" },
];

const CODED_CARD_PATH = new RegExp(`^/${CARD_CODE}/@${CODED_SLUG}/?$`, "i");
const NOTED_CODED_PATH = new RegExp(`^/${CARD_CODE}-${NOTE_CODE}/@${CODED_SLUG}/?$`, "i");
const NOTED_PLAIN_PATH = new RegExp(`^/-${NOTE_CODE}/@${PLAIN_HANDLE}/?$`, "i");

export function isPublicCardPath(path: string): boolean {
  const pathname = (path.split("?")[0]?.split("#")[0] ?? path).replace(/%40/gi, "@");
  return (
    pathname.startsWith("/c/") ||
    pathname.startsWith("/@") ||
    CODED_CARD_PATH.test(pathname) ||
    NOTED_CODED_PATH.test(pathname) ||
    NOTED_PLAIN_PATH.test(pathname)
  );
}
