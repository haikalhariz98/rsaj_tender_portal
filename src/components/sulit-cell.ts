import type { Sulit } from "@/lib/auth/sulit-access";

import type { Cell } from "./data-list";

/**
 * A SULIT value as a list cell (ADR 0034 D14): the cell the figure makes where the reader is entitled to it, and where not, "SULIT · withheld" with the reason in
 * words, which carries no value to search, sort or export. A list that holds a withheld cell gives the row no sort key for the column, so the order cannot give the
 * figure away: `sortKeyOf` gives the key or nothing.
 */
export function sulitCell<T>(s: Sulit<T>, granted: (value: T) => Cell): Cell {
  return s.state === "WITHHELD" ? { kind: "withheld", words: s.words.en } : granted(s.value);
}

/// A figure shown as text where granted.
export const sulitText = (s: Sulit<string>, dim?: boolean): Cell => sulitCell(s, (text) => ({ kind: "text", text, dim }));

/// The sort key for a column of SULIT values: the value where it is shown, no key where it is withheld.
export const sortKeyOf = (s: Sulit<string | number>): string | number | undefined => (s.state === "GRANTED" ? s.value : undefined);
