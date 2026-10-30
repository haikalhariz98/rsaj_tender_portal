/**
 * My Projects' findings in plain words, English and Malay (AGENTS.md rule 5: no code reaches a screen). A finding names what the contractor can do about it where it can do something.
 */

import { formatDate } from "@/lib/format";

import type { ProjectFault, ProjectFinding } from "./types";

export interface Words {
  en: string;
}
const w = (en: string): Words => ({ en });
type Data = Record<string, string | number | null>;
const n = (d: Data, k: string) => String(d[k] ?? "");

const OWN: Readonly<Record<ProjectFault, (d: Data) => Words>> = {
  NOT_FOUND: () => w("That contract is not one you can open."),
  CONTRACT_NOT_ACTIVE: () => w("Contract not being administered. Nothing can be sent."),
  DAY_NOT_KNOWN: () => w("Time zone not set, so the day cannot be recorded. Tell the procurement office."),
  TITLE_REQUIRED: () => w("Give the submission a title."),
  TITLE_TOO_LONG: (d) => w(`The title is longer than ${n(d, "max")} characters.`),
  BODY_REQUIRED: () => w("Write what you are submitting."),
  BODY_TOO_LONG: (d) => w(`The text is longer than ${n(d, "max")} characters.`),
  AMOUNT_REQUIRED: () => w("Give the amount claimed."),
  AMOUNT_FORMAT: () => w("The amount must be a figure in ringgit and sen, such as 12500.00."),
  AMOUNT_NOT_ON_KIND: () => w("Only an interim claim carries an amount."),
  DAY_REQUIRED: () => w("Give the day."),
  DAY_FORMAT: () => w("The day is not a date."),
  DAY_IN_FUTURE: (d) => w(`The day cannot be after today (${formatDate(n(d, "day"))}).`),
  DAY_NOT_ON_KIND: () => w("Only an interim claim, a materials-on-site list and a notice of a cause of delay carry a day."),
  LINES_REQUIRED: () => w("List at least one item of materials."),
  LINES_NOT_ON_KIND: () => w("Only a materials-on-site list carries items."),
  LINE_INCOMPLETE: (d) => w(`Item ${n(d, "line")} needs a description, a quantity and where it is.`),
  LINE_VALUE_FORMAT: (d) => w(`Item ${n(d, "line")}'s value must be a figure in ringgit and sen.`),
  TOO_MANY_LINES: (d) => w(`A list holds at most ${n(d, "max")} items. Send the rest as another list.`),
  PASSWORD_REQUIRED: () => w("Enter your password to sign the notice."),
  TOO_MANY_SUBMISSIONS: (d) => w(`Limit: ${n(d, "max")} submissions in the last ${n(d, "minutes")} minutes. Wait, or call the office if urgent.`),
  PORTAL_SIGNING_NOT_SET: () =>
    w(
      "The office has not yet decided whether a contractor may sign here. Sign on paper, or ask the office to decide.",
    ),
  PORTAL_SIGNING_OFF: () =>
    w(
      "The office takes a contractor's signature on paper only. Sign it on paper.",
    ),
  // Ruling on 1875(3): the supplier's standing bars the act, in its own words (src/lib/portal/standing-gate.ts).
  SUPPLIER_STANDING_BARS: (d) => w(n(d, "en")),
  SIGNER_NOT_AUTHORISED_NOT_SET: () =>
    w(
      "The office has not recorded that you may sign for your company. Ask it to, or sign on paper.",
    ),
  SIGNER_NOT_AUTHORISED: () =>
    w(
      "The office has recorded that you do not sign for your company. Another signatory can sign, or sign on paper.",
    ),
  ALREADY_ANSWERED: () => w("This submission has already been answered."),
  NOTE_REQUIRED: () => w("Say why it is returned, for the contractor to read."),
  NOTE_TOO_LONG: (d) => w(`The note is longer than ${n(d, "max")} characters.`),
  ENTRY_NOT_FOUND: () => w("That diary entry is not on this contract."),
  DEFECT_NOT_FOUND: () => w("That defect is not on this contract."),
  // F6: the portal's Defects tab does not say a draft certificate exists, so these are the not-found words; the Work core words it itself (WR-1).
  DEFECT_ON_DRAFT_CPC: () => w("That defect is not on this contract."),
  DEFECT_NOT_OPEN: () => w("This defect is already reported rectified, made good or withdrawn."),
  EVIDENCE_NOT_YOURS: () => w("Choose one of the documents you sent on this contract."),
  ALREADY_ATTESTED: () => w("The contractor's agent has already attested this entry."),
  ALREADY_DISPUTED: () => w("A disagreement is already recorded on this entry."),
  DISAGREEMENT_REQUIRED: () => w("Say what you disagree with."),
  DISAGREEMENT_TOO_LONG: (d) => w(`The disagreement is longer than ${n(d, "max")} characters.`),
  ENTRY_IN_FUTURE: () => w("This entry's day has not come yet."),
  CERTIFICATE_NOT_FOUND: () => w("That certificate is not on this contract."),
  NOT_SIGNING: () => w("This certificate is not being signed at the moment."),
  NO_CONTRACTOR_BLOCK: () => w("This certificate has no block for the contractor to sign here."),
  BLOCK_NOT_NEXT: (d) => w(`The certificate is signed in order: "${n(d, "first")}" comes before the contractor's block.`),
  BLOCK_SIGNED: () => w("The contractor's block on this certificate is already recorded."),
  BLOCK_IS_LAST: () =>
    w(
      "Your block is the last, and recording it issues the certificate. Sign or dispute it on paper.",
    ),
  WITNESS_ON_PAPER: () => w("This certificate is signed on paper: a witness signs after the contractor. Sign or dispute it at the office."),
  REFUSAL_NOT_ALLOWED: () => w("The form has no refusal to sign. Dispute in writing with the Superintending Officer."),
  REFUSAL_NOTE_REQUIRED: () => w("Say what you dispute."),
  REFUSAL_NOTE_TOO_LONG: (d) => w(`The dispute is longer than ${n(d, "max")} characters.`),
};

export function projectFaultText(f: Pick<ProjectFinding, "code" | "data">): Words {
  return OWN[f.code]((f.data ?? {}) as Data);
}
export const hasProjectFaultText = (code: string): boolean => code in OWN;

export interface FaultView {
  field: string | null;
  level: ProjectFinding["level"];
  message: string;
}

export const projectFaultViews = (fs: readonly ProjectFinding[]): FaultView[] =>
  fs.map((f) => {
    const t = projectFaultText(f);
    return { field: null, level: f.level, message: t.en };
  });
