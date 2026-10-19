/**
 * Time's words (6.13 Part B run 1b), English and Malay, as the design note gives them (6.13B-run1b-design.md §6). A code
 * never reaches a screen: every refusal is worded here, naming what refuses and the way out. A contract matter's own
 * codes are matter/labels.ts's, read through. Pure.
 */

import { formatDate } from "@/lib/format";
import { matterFaultWords, MATTER_FAULT_WORDS } from "@/lib/matter/labels";

import type { EotPackItem, Finding } from "./types";
import type { PeriodPrecondition } from "./period";

export interface Words {
  en: string;
}
const w = (en: string): Words => ({ en });
type Data = Record<string, string | number | null | undefined>;
const s = (v: unknown, fallback: string) => (v == null || v === "" ? fallback : String(v));
const day = (v: unknown) => (v ? formatDate(String(v)) : "that day");

export const PACK_ITEM_WORDS: Readonly<Record<EotPackItem, Words>> = {
  CALCULATION: w("How the proposed period was calculated (bar charts or other methods attached)"),
  EMPLOYER_DELAY: w("Where the employer is responsible: whether the cause is resolved, and if not, what is being done"),
  LOSS_EXPENSE: w("Whether the contractor has claimed, or will claim, loss and expense, and the estimate"),
  PROGRESS: w("The progress achieved and the balance of work"),
  COMPLETION: w("Whether it can complete by the proposed date, and if not, when"),
};

export const PRECONDITION_WORDS: Readonly<Record<PeriodPrecondition, Words>> = {
  priorAgreement: w("The contractor's prior agreement"),
  termsRetained: w("The existing terms and conditions retained"),
  ratesRetained: w("The existing rates retained"),
  performanceSatisfactory: w("The contractor's satisfactory performance"),
  spanConfirmed: w("The SPAN Act's compliance"),
};

const packWords = (d: Data): Words => PACK_ITEM_WORDS[String(d.item) as EotPackItem] ?? w("A pack item");
const precondition = (d: Data): Words => PRECONDITION_WORDS[String(d.precondition) as PeriodPrecondition] ?? w("A precondition");

export const TIME_FAULT_WORDS: Readonly<Record<string, (d: Data) => Words>> = {
  // 6.1 the delay notice
  NOTICE_CAUSE_REQUIRED: () => w("Say what caused the delay, as the notice gives it."),
  RECEIVED_BEFORE_OCCURRED: () => w("The notice cannot have been received before the delay occurred."),
  FUTURE_DATE: (d) => w(`${day(d.day)} is after today.`),
  // 6.2 opening a claim
  NOTICE_REQUIRED: () => w("Name the delay notice (or the S.O.'s direction) the claim rests on."),
  NOTICE_NOT_ON_CONTRACT: () => w("That notice is not on this contract."),
  SECTION_REQUIRED: () => w("Choose the section of the baseline the claim is for."),
  GROUND_CLAUSE_REQUIRED: () => w("Give the clause of the conditions of contract the ground falls under."),
  CAUSE_REQUIRED: () => w("Say what caused the delay."),
  PROGRAMME_NOT_APPROVED: () => w("The delay is assessed against an approved programme revision, and the one named is not approved."),
  PROPOSED_DAYS_REQUIRED: () => w("Give the days the contractor proposes, as a whole number not below nothing."),
  EOT_INSTRUMENT_NOT_SET: (d) => w(`The contract type (${s(d.type, "of this contract")}) does not say which time instrument it offers. Set it under Configuration › Reference data › Contract types.`),
  EOT_NOT_OFFERED: (d) => w(`A contract of this type (${s(d.type, "its type")}) is extended by an extension of the contract period, not an extension of time.`),
  PERIOD_NOT_OFFERED: (d) => w(`A contract of this type (${s(d.type, "its type")}) is extended by an extension of time, not of its contract period.`),
  // 6.3 answering, reasons
  CLAIM_CLOSED: (d) => w(`The claim is closed (${s(d.reason, "its reason recorded")}): nothing more is recorded on it.`),
  CLAIM_DETERMINED: () => w("The claim is determined: its answers and reasons stand as they were determined."),
  ESTIMATED_COMPLETION_REQUIRED: () => w("The contractor cannot complete by the proposed date: give the estimated completion date."),
  DAYS_BELOW_NOTHING: () => w("A count of days is a whole number, never below nothing."),
  UNTIL_NOT_AFTER_FROM: () => w("The delay must end after it begins (the end day is the first day not delayed)."),
  GROUP_REQUIRED: () => w("A concurrent reason names the group of reasons it runs with."),
  REASON_FIELDS_REQUIRED: () => w("Give the reason's clause and its words."),
  // 6.4 the determination
  ENTITLEMENT_REQUIRED: () => w("Say whether the contractor is entitled to an extension."),
  ENTITLEMENT_REASON_REQUIRED: () => w("Say why the cause does or does not entitle the contractor to an extension."),
  EXCLUDED_BY_CONDITION: (d) => w(`The delay is put down to ${s(d.condition, "a condition of the award")}, a condition of the award that excludes an extension of time and is not met: not a ground, unless you record why it is overridden.`),
  WEATHER_EVIDENCE_REQUIRED: () => w("A weather claim needs the meteorological record attached to it."),
  WEATHER_NOT_EXCEPTIONAL: () => w("Weather that is not exceptional (monsoon season, heavy rain normal for the area) is not a ground: it was allowed for in the tender."),
  WEATHER_EXCEPTIONAL_REQUIRED: () => w("A weather claim says whether the weather was exceptional against the meteorological records."),
  PACK_ITEM_REQUIRED: (d) => w(`${packWords(d).en}: answer it, or mark it not required with the reason.`),
  PACK_NOT_REQUIRED_REASON: (d) => w(`${packWords(d).en} is marked not required: say why.`),
  ACTUAL_DELAY_REQUIRED: () => w("Give the actual delay, in days, against the approved programme."),
  REASONS_REQUIRED: () => w("An entitled claim has at least one reason, with its clause and its extension."),
  BEST_ENDEAVOURS_NONE: () => w("The contractor did not use best endeavours: no extension is granted. Determine it not entitled."),
  BEST_ENDEAVOURS_REQUIRED: () => w("Say whether the contractor used best endeavours (fully, in part or not)."),
  // 6.6 the certificate
  NOT_DETERMINED: () => w("The claim is sent for approval, and certified, once it is determined entitled."),
  EOT_CERTIFICATE_LIVE: (d) => w(`The claim's certificate is already raised (${s(d.number, "not yet numbered")}): void it first to raise another.`),
  GRANTED_DAYS_REQUIRED: () => w("Give the days granted, more than none."),
  UNEXTENDED_NOTE_REQUIRED: () => w("Best endeavours were met in part: state the period not extended."),
  NO_DATE_FOR_COMPLETION: () => w("The baseline in force has no date for completion (possession not recorded)."),
  GRANT_DIFFERS: (d) => w(`The days granted (${s(d.granted, "stated")}) differ from the reasons' computed ${s(d.computed, "days")} (assumed: consecutive reasons added, each concurrent group at its longest).`),
  EOT_MOVED: (d) => w(`Another extension of time moved the date for completion since this certificate was raised (now ${d.day ? formatDate(String(d.day)) : "unknown"}). Void it and raise it again from the claim.`),
  // 6.7 the period extension
  NEW_EXPIRY_NOT_LATER: (d) => w(`The new expiry must be after the current one (${day(d.day)}).`),
  PERIOD_REASON_REQUIRED: () => w("Say why the contract period is extended (the current need)."),
  FINANCIAL_IMPACT_BELOW_NOTHING: () => w("A financial impact is never below nothing."),
  PRECONDITION_NOT_MET: (d) => w(`${precondition(d).en} is not confirmed: all four, and the SPAN Act's compliance, are confirmed before the extension is evaluated.`),
  PERIOD_MOVED: (d) => w(`The contract period moved since the agreement was raised (now ${day(d.day)}). Void it and raise it again.`),
  PERIOD_AGREEMENT_LIVE: (d) => w(`The extension's agreement is already raised (${s(d.number, "not yet numbered")}): void it first to raise another.`),
  // 6.8 loss and expense
  CLAIMED_REQUIRED: () => w("Give the amount claimed, not below nothing."),
  VALUED_ALREADY_SENT: () => w("Its value was sent for approval and stands as sent."),
  VALUED_REQUIRED: () => w("Give the value and the day it was valued."),
  VALUATION_BASIS_REQUIRED: () => w("Say how it was valued."),
  NOT_VALUED: () => w("The claim is sent once it is valued."),
  CLAIMS_COMMITTEE_MISMATCH: (d) => w(`The route's committee step is ${s(d.committee, "another committee")}, and the contract type names ${s(d.claims, "another")} for its loss-and-expense claims. Correct the matrix row or the contract type.`),
  CLAIMS_COMMITTEE_NOT_SET: () => w("The contract type names no committee for its loss-and-expense claims, so the route's committee step is not compared."),
  LOSS_NOT_APPROVED: (d) => w(`A loss-and-expense line takes an approved claim; ${s(d.claim, "this claim")} is not approved.`),
};

/// The finding in words: time's own, else a contract matter's (fails closed in words: "Refused.").
export function timeFaultWords(f: Finding): Words {
  const fn = TIME_FAULT_WORDS[f.code];
  if (fn) return fn(f.data ?? {});
  if (MATTER_FAULT_WORDS[f.code]) return matterFaultWords(f);
  return w("Refused.");
}

export const timeFaultText = (f: Finding) => timeFaultWords(f).en;
export const timeRefusal = (lead: string, fs: readonly Finding[]) => `${lead} ${fs.map(timeFaultText).join(" ")}`.trim();
