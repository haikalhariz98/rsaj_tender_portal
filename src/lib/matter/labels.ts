/**
 * A contract matter's words (6.13 Part B run 1b; ADR 0029), English and Malay. A code never reaches a screen. Each
 * refusal names what refuses it and the way out. Pure.
 */

import { formatDate } from "@/lib/format";
import { hasMatterLabel, matterLabel } from "@/lib/labels";
import type { Finding } from "@/lib/method/types";

export interface Words {
  en: string;
}
const w = (en: string): Words => ({ en });
type Data = Record<string, string | number | null | undefined>;
const s = (v: unknown, fallback: string) => (v == null || v === "" ? fallback : String(v));
const domainWords = (d: unknown): Words => (typeof d === "string" && hasMatterLabel(d) ? { en: matterLabel(d, "en") } : { en: "this matter" });

export const MATTER_FAULT_WORDS: Readonly<Record<string, (d: Data) => Words>> = {
  MATTER_SERIES_NOT_SET: () => w('No numbering series is set for contract matters ("contract_matter"). Set it under Configuration › Numbering.'),
  MATTER_CLOSED: (d) => w(`The matter is closed (${s(d.reason, "its reason recorded")}).`),
  ROUTE_WAITING: () => w("Its approval route is still waiting for a decision."),
  ALREADY_APPROVED: () => w("It is approved already: its approval of record stands."),
  COND_REQUIRED: () => w("Say whether the extension has a financial impact, and its cause: the route is picked by it, never by a value."),
  VALUE_REQUIRED: () => w("The matter is routed on its value, and none is given."),
  RATIO_REQUIRED: () => w("The waiver is routed on the share waived of the damages, and that share cannot be read (no damages amount)."),
  MATTER_NOT_APPROVED: () => w("The certificate certifies the matter once its route is approved, and it is not (no route approved on the matter)."),
  // The one tabling rule's words (ADR 0029 §3), the variation's, naming the matter.
  NOT_COMMITTEE_STEP: () => w("That is not a committee's step on the matter's open route."),
  OTHER_COMMITTEE: () => w("That sitting is of another committee than the one the step needs."),
  SITTING_FROZEN: () => w("That sitting no longer takes matters (it is minuted or cancelled)."),
  ALREADY_TABLED: () => w("This step's matter is tabled already and waits for the committee: cite its decision once it is decided."),
  NOT_TABLED_YET: () => w("Nothing is tabled from this matter for this step's committee yet: table it first."),
  NOT_DECIDED_YET: () => w("The committee has not decided the matter tabled for this step yet: cite it once it is decided."),
  NO_ROUTE_WAITING: () => w("No approval route is waiting for a decision on this matter."),
  NO_MATRIX: (d) => w(`No approval matrix is in force on ${d.day ? formatDate(String(d.day)) : "the day"}.`),
  NO_RULE: (d) => {
    const dom = domainWords(d.domain);
    return w(
      `The approval matrix (${s(d.matrix, "in force")}) has no row for ${dom.en} on these facts${d.why ? ` (${d.why})` : ""}. Add the row (Configuration › Approval matrix), or a gap row saying it is undecided.`,
    );
  },
};

export function matterFaultWords(f: Finding): Words {
  const fn = MATTER_FAULT_WORDS[f.code];
  return fn ? fn(f.data ?? {}) : w("Refused.");
}
