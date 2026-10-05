/**
 * How a committee step's citation is run (founder, 2026-10-05): by its own "Cite committee decision" act, or by the
 * sitting's outcome act, which runs the same citation function in its own transaction (`linkOutcome`). The function is
 * the same either way; only its History says which.
 */

import { AUTO_LINK_WORDS } from "./labels";

export type CiteVia = "BY_HAND" | "OUTCOME";

/// What a citation run by the outcome adds to the cited step's History entry: the words, never a code.
export const linkedVia = (via: CiteVia): { linkedHow?: string } => (via === "OUTCOME" ? { linkedHow: AUTO_LINK_WORDS.linked.en } : {});
