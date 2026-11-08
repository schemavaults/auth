/** Characters a URL may wrap before (the Chicago Manual of Style rules). */
const BREAK_BEFORE: ReadonlySet<string> = new Set([
  "/",
  "~",
  ".",
  ",",
  "-",
  "_",
  "?",
  "#",
  "%",
  "=",
  "&",
]);

/** Characters a URL may also wrap after. */
const BREAK_AFTER: ReadonlySet<string> = new Set(["=", "&"]);

/**
 * Splits a URL into the pieces it may wrap between: after a double slash
 * (`https://`), before a single slash, `~`, `.`, `,`, `-`, `_`, `?`, `#` or
 * `%`, and before and after `=` and `&`. The slashes of `://` stay with the
 * scheme, so a wrapped line never starts with a stray `/` of `//`.
 *
 * The pieces always join back into the given URL.
 */
export function splitUrlAtLineBreaks(url: string): string[] {
  const pieces: string[] = [];
  let piece = "";
  const endPiece = (): void => {
    if (piece.length > 0) {
      pieces.push(piece);
      piece = "";
    }
  };

  for (let i = 0; i < url.length; i++) {
    const char: string = url.charAt(i);
    const previous: string = i > 0 ? url.charAt(i - 1) : "";
    const isPartOfDoubleSlash: boolean =
      char === "/" && (previous === "/" || previous === ":");

    if (BREAK_BEFORE.has(char) && !isPartOfDoubleSlash) {
      endPiece();
    }
    piece += char;
    if (BREAK_AFTER.has(char) || (char === "/" && previous === "/")) {
      endPiece();
    }
  }
  endPiece();
  return pieces;
}

export default splitUrlAtLineBreaks;
