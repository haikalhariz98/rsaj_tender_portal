/**
 * The catalogues a converted staff screen renders, and how far each has been reviewed (NFR-LNG-001,
 * ADR 0040). No Malay here is reviewed by the customer yet: a pair drafted in the N1 slice is
 * DRAFTED_NOT_REVIEWED, an existing pair registered by reference is CARRIED_NOT_REVIEWED. `forReview` is the
 * list RSAJ reads; RSAJ's review remains the go-live gate.
 *
 * A catalogue's keys are property names in code. They are never rendered: `say` takes the `Words`, not the key.
 */

import type { Words } from "@/lib/contract/labels";

import { CASE_PAGE, CONTRACTS_LIST } from "@/lib/contract/case-page-words";

import { CARRIED } from "./catalogues/carried";
import { COMPONENTS } from "./catalogues/components";
import { DASHBOARD } from "./catalogues/dashboard";
import { DATES } from "./catalogues/dates";
import { INBOX } from "./catalogues/inbox";
import { SHELL } from "./catalogues/shell";
import { COVERAGE_NOTICES } from "./coverage";
import { hasMalay } from "./say";

export type Review = "DRAFTED_NOT_REVIEWED" | "CARRIED_NOT_REVIEWED";

export interface Catalogue {
  readonly name: string;
  readonly review: Review;
  readonly words: Readonly<Record<string, Words>>;
}

/** Every catalogue a converted screen renders. Each slice that converts a screen registers its catalogues here. */
export const CONVERTED_CATALOGUES: readonly Catalogue[] = [DATES, COVERAGE_NOTICES, SHELL, COMPONENTS, DASHBOARD, INBOX, CASE_PAGE, CONTRACTS_LIST, ...CARRIED];

/** Every pair with no Malay, which therefore renders its English. */
export function untranslated(cats: readonly Catalogue[]): { catalogue: string; key: string; en: string }[] {
  return cats.flatMap((c) =>
    Object.entries(c.words)
      .filter(([, words]) => !hasMalay(words))
      .map(([key, words]) => ({ catalogue: c.name, key, en: words.en })),
  );
}

/** Every pair, with its review state: the list for the customer's review of the Malay. */
export function forReview(cats: readonly Catalogue[]): { catalogue: string; review: Review; key: string; en: string; ms: string }[] {
  return cats.flatMap((c) =>
    Object.entries(c.words).map(([key, words]) => ({ catalogue: c.name, review: c.review, key, en: words.en, ms: words.ms })),
  );
}
