/**
 * What every 6.12 refusal says, in English and Malay. A code never reaches a screen: each finding is
 * worded here, naming what refuses the act and the way out of it. A setting frozen when preparation
 * started is never "set it": it is what this contract was formed under, and the words say what can
 * still be done.
 */

import { formatDate } from "@/lib/format";
import { SIGNER_FAULT_TEXT } from "@/lib/award/labels";
import { supervisionFaultWords } from "@/lib/supervision/labels";

import { AWARD_TERM_WORDS, type AwardTerm } from "./award-correction";
import { BASELINE_FIELD_WORDS, CHECK_WORDS, COMPARISON_WORDS, GATE_WORDS, w, type Words } from "./labels";
import type { Finding, FormationCheckKind, ReconciliationComparison } from "./types";

const day = (v: unknown) => (typeof v === "string" ? formatDate(v) : "that day");
const field = (v: unknown) => BASELINE_FIELD_WORDS[String(v)] ?? w("A baseline value");
const check = (v: unknown) => CHECK_WORDS[v as FormationCheckKind] ?? w("A check");
const comparison = (v: unknown) => COMPARISON_WORDS[v as ReconciliationComparison] ?? w("A comparison");
const gate = (v: unknown) => GATE_WORDS[String(v)] ?? w("a condition");
const lower = (x: Words): Words => ({ en: x.en.charAt(0).toLowerCase() + x.en.slice(1) });

const SIGNATORY_TEXT: Record<string, Words> = {
  SIGNATORY_UNRESOLVED: w("No signatory rule covers this sum. Add one on the approval matrix."),
  SIGNATORY_NOT_FOR_INSTRUMENT: w("Signatory rule names another condition. Set the agreement's condition on the matrix."),
  SIGNATORY_AMBIGUOUS: w("Two signatory rules overlap. Correct them on the approval matrix."),
  SIGNATORY_GAP: w("Signatory rule is a known gap. Record the rule on the approval matrix."),
  SIGNATORY_BOUNDARY_UNDECIDED: w("Signatory rule sits on a boundary. Decide it on the approval matrix."),
};

const PERSON_TEXT: Record<string, Words> = {
  NAME_REQUIRED: w("needs their full name"),
  IC_REQUIRED: w("needs their identity-card number"),
  IC_FORMAT: w("has an identity-card number not in the shape 000000-00-0000"),
};

export function contractFaultWords(f: Finding): Words {
  const d = f.data ?? {};
  switch (f.code) {
    // ------------------------------------------------ starting preparation
    case "NOT_NUMBER_ALLOCATED":
      return w("Preparation has already started on this contract.");
    case "AWARD_NOT_LIVE":
      return w("The award is not issued or accepted, so its contract is not prepared.");
    case "NO_TIME_ZONE":
      return w("Time zone not set. Set it under Configuration › Organisation.");
    case "BASIS_NOT_SET":
      return w("Exercise has no contract basis. Choose it on the sourcing exercise.");
    case "BASIS_BQ_NOT_SET":
      return w(`Whether a contract on ${d.basis ?? "this basis"} is let on a bill of quantities is not set, so which checks apply is not known. Set it under Configuration › Scope and estimate.`);
    case "NO_DOCUMENT_PARTS":
      return w(`No Contract Document parts are configured for ${d.basis ?? "this basis"}, so the document cannot be assembled in its prescribed order. Add them under Configuration › Contract controls.`);
    case "LEGAL_OFFICE_NOT_SET":
      return w("Legal office not set. See Configuration › Contract controls.");
    case "LEGAL_OFFICE_UNKNOWN":
      return w("Legal office is not a unit in force today (it has ended, or has not started yet). Choose one under Configuration › Contract controls.");
    case "SIGNATORY_COND_NOT_SET":
      return w("Signatory condition not set. See Configuration › Contract controls.");
    case "STAMP_NOT_SET":
      return w("Copy stamp words not set. See Configuration › Contract controls.");
    case "NO_COPY_RECIPIENTS":
      return w("No copy recipients. See Configuration › Contract controls.");

    // ------------------------------------------------ assembly, reconciliation, checks
    case "NO_PARTS":
      return w("No parts configured for the basis.");
    case "CANCELLED_WITHOUT_STATEMENT":
      return w(`${d.part ?? "A part"} is cancelled by the alternative proposal without saying what it cancels. State it on the part.`);
    case "COMPARISON_NOT_RECORDED":
      return w(`Reconciliation not recorded: ${lower(comparison(d.comparison)).en}.`);
    case "AMENDMENT_NOT_RECORDED":
      return w(`${comparison(d.comparison).en} is recorded as amended but lists no amendment.`);
    case "AMENDMENT_UNSIGNED":
      return w(`An amendment under "${comparison(d.comparison).en}" lacks a signature: both the contractor's signatory and the preparing officer sign it.`);
    case "DESCRIPTION_REQUIRED":
      return w("Say what the amendment changes.");
    case "SIGNATORY_REQUIRED":
      return w("Name who signed the amendment for the contractor.");
    case "CHECKS_NOT_SET":
      return w("Which checks this contract takes was not frozen when preparation started.");
    case "CHECK_INCOMPLETE":
      return w(`Not complete: ${lower(check(d.check)).en}.`);
    case "NOT_FOR_BASIS":
      return w("This check is not one this contract's basis takes.");
    case "ALREADY_COMPLETE":
      return w("This check is already recorded complete.");
    case "BEFORE_PREPARATION":
      return w("The day is before preparation started.");
    case "NO_RATE_COMPARED":
      return w("Compare at least one rate first.");
    case "FRONT_LOADING_NOTE_REQUIRED":
      return w("Say what was done about the listed rates.");

    // ------------------------------------------------ legal review
    case "NOT_IN_PREPARATION":
      return w("The contract is not being prepared now.");
    case "LEGAL_OFFICE_NOT_FROZEN":
      return w("No legal office was frozen when this contract's preparation started.");
    case "REVIEW_OPEN":
      return w("The contract is already with the legal office: record its decision first.");
    case "NO_SUBMISSION_DOCUMENTS":
      return w("Attach what goes to the legal office first.");
    case "FORMATION_INCOMPLETE":
      return w(`Formation is not complete: ${d.count ?? "some"} item${d.count === 1 ? "" : "s"} of the assembly, the reconciliation or the checks remain. See Formation.`);
    case "NO_OPEN_REVIEW":
      return w("Nothing is with the legal office.");
    case "COMMENTS_REQUIRED":
      return w("A return needs the legal office's comments.");
    case "BEFORE_SUBMISSION":
      return w("The decision cannot be before the day it was sent.");

    // ------------------------------------------------ signing
    case "NOT_ENDORSED":
      return w("The contract is not legally endorsed.");
    case "GATE_NOT_MET":
      return d.item
        ? w(`Not ready to sign: ${gate(d.item).en} — ${d.state === "NOT_SET" ? "not set" : "not met"}.`)
        : w("Readiness gate not met.");
    case "NO_RESOLUTION":
      return w("No proof of signing authority. Attach it under Signing.");
    case "ALREADY_SIGNED":
      return w("The contractor's signature is already recorded.");
    case "SIGNATORY":
      return w(`The contractor's signatory ${(PERSON_TEXT[String(d.fault)] ?? w("is incomplete")).en}.`);
    case "WITNESS":
      return w(`The witness ${(PERSON_TEXT[String(d.fault)] ?? w("is incomplete")).en}.`);
    case "NAME_REQUIRED":
    case "IC_REQUIRED":
    case "IC_FORMAT":
      return w(`The person ${PERSON_TEXT[f.code].en}.`);
    case "BEFORE_ENDORSEMENT":
      return w("The contractor cannot have signed before the legal endorsement.");
    case "CONTRACTOR_NOT_SIGNED":
      return w("The contractor's signature is not recorded: the contractor signs first.");
    case "CONTRACTOR_SIGNED_LATER":
      return w("The contractor's signature is recorded on a later day than today.");
    case "WITNESS_NOT_RECORDED":
      return w("The witness to the contractor's signature is not recorded.");
    case "ALREADY_EXECUTED":
      return w("The contract is already executed.");
    case "COMMITMENT":
      return d.fault === "NO_APPROVAL_ROUTE"
        ? w("The requisition has no approval route, so nothing may be committed against it.")
        : w(`The requisition is not approved${d.outstanding ? `: waiting on ${d.outstanding}` : ""}. Nothing is committed against an unapproved requisition.`);
    case "SIGNATORY_COND_NOT_FROZEN":
      return w("No signatory condition was frozen when this contract's preparation started.");
    case "SIGNER": {
      const t = SIGNER_FAULT_TEXT[d.fault as keyof typeof SIGNER_FAULT_TEXT];
      return t ? w(/^[A-Z]/.test(t) ? t : `The officer named ${t}`) : w("The officer named may not sign.");
    }
    case "NO_ISSUE_IN_FORCE":
      return w("No approval matrix in force. Issue one under Configuration › Approval matrix.");
    case "SIGNATORY_NOT_RESOLVED":
      return SIGNATORY_TEXT[String(d.fault)] ?? w("The contract agreement's signatory is not resolved on the approval matrix.");
    case "SO_UNRESOLVED":
      // BD-613-9 ruling: "S.O. not resolved", naming the matrix, saying in words that its S.O. rows are missing.
      return w(
        `S.O. not resolved: ${d.matrix ? `the approval matrix in force (${d.matrix})` : "the approval matrix in force"} has no Superintending Officer rows that give a single office at this contract's sum and method, so nobody would supervise the contract this signature executes. Add or settle its Superintending Officer rows under Configuration › Approval matrix.`,
      );
    case "BASELINE_INCOMPLETE":
      return w(`The baseline still lacks ${d.count ?? "some"} value${d.count === 1 ? "" : "s"}. See Baseline.`);

    // ------------------------------------------------ Contract Date, stamping, briefing
    case "NOT_EARLIER":
      return w(`A correction moves the Contract Date to an earlier day than ${day(d.current)} only.`);
    case "BEFORE_READY":
      return w(`The contract was not ready to sign before ${day(d.readySince)}.`);
    case "BEFORE_CONTRACTOR_SIGNED":
      return d.party === "WITNESS"
        ? w(`The contractor's signature was witnessed on ${day(d.signedOn)}: the employer signs after it, so the Contract Date cannot be before that day.`)
        : w(`The contractor signed on ${day(d.signedOn)}: the employer signs after the contractor, so the Contract Date cannot be before that day.`);
    case "READY_DAY_NOT_FROZEN":
      return w("Ready-to-sign day not frozen. The Contract Date stands.");
    case "REASON_REQUIRED":
      return w("Give the reason.");
    case "NOT_EXECUTED":
      return w("The contract is not executed yet.");
    case "ALREADY_STAMPED":
      return w("The contract is already recorded as stamped.");
    case "DAY_REQUIRED":
      return w("Record the day it was stamped.");
    case "REFERENCE_REQUIRED":
      return w("Record the LHDN stamping reference.");
    case "BEFORE_CONTRACT_DATE":
      return w("The day cannot be before the Contract Date.");
    // ------------------------------------------------ the S.O. moved with a corrected Contract Date (6.13A residual): worded once, in supervision
    case "SO_MOVE_NO_MATRIX":
    case "SO_MOVE_UNRESOLVED":
    case "SO_MOVE_OTHER_OFFICE":
      return supervisionFaultWords(f);
    case "NOT_YET_ENDORSED":
      return w("The briefing is recorded at signing, once the contract is legally endorsed.");
    case "ALREADY_RECORDED":
      return w("The briefing is already recorded.");
    case "NO_PARTICIPANTS":
      return w("Name who attended for the employer.");
    case "NO_ATTENDEES":
      return w("Name who attended for the contractor.");
    case "FUTURE_DATE":
      return w("The day cannot be after today.");

    // ------------------------------------------------ copies and custody
    case "STAMP_NOT_FROZEN":
      return w("No controlled-copy stamp was frozen when this contract's preparation started.");
    case "CONSULTANT_NOT_ANSWERED":
      return w("Say whether a consulting engineer is engaged.");
    case "NOT_A_RECIPIENT":
      return w("That recipient is not on this contract's list.");
    case "ALREADY_HOLDS_ONE":
      return w("That recipient already holds a live copy: recall it first, then reissue.");
    case "RECALLED":
      return w("The copy has been recalled.");
    case "NOT_RECALLED":
      return w("Only a recalled copy is reissued.");
    case "ALREADY_REISSUED":
      return w("The copy has already been reissued.");
    case "NOT_DESPATCHED":
      return w("Record the despatch first.");
    case "ALREADY_DESPATCHED":
      return w("The despatch is already recorded.");
    case "ALREADY_ACKNOWLEDGED":
      return w("The acknowledgement is already recorded.");
    case "BEFORE_DESPATCH":
      return w("The day cannot be before the copy went out.");
    case "ALREADY_OUT":
      return w(`The original is already out, with ${d.holder ?? "someone"}: check it in first.`);
    case "NOT_OUT":
      return w("The original is in custody: nothing to check in.");
    case "BEFORE_LAST_MOVEMENT":
      return w(`The day cannot be before the last movement, ${day(d.last)}.`);
    case "LOCATION_REQUIRED":
      return w("Say where the original is held.");
    case "ALREADY_REGISTERED":
      return w("That original is already in the custody register.");
    case "NOT_ON_CONTRACT":
      return w("That bond or policy is not on this contract's register.");

    // ------------------------------------------------ the baseline
    case "NO_DRAFT":
      return w("The baseline has no draft: it is built when preparation starts.");
    case "ALREADY_VERSIONED":
      return w("Baseline has a version. Correct it, with a reason.");
    case "VERSIONED":
      return w("Baseline has a version. Record a correction, with a reason.");
    case "CANCELLED":
      return w("The contract is cancelled.");
    case "NO_VERSION":
      return w("Nothing to correct: the baseline has no version yet. Key the draft instead.");
    case "NOTHING_CHANGED":
      return w("Nothing changes.");
    case "NOT_SET":
      return d.part
        ? w(`${field(d.field).en}: the ${d.part} is not set.`)
        : w(`${field(d.field).en} is not set.`);
    case "DLP_MONTHS_NOT_EXPECTED":
      return w("No defects liability period applies, yet months are stated.");
    case "DLP_NOT_FOR_TYPE":
      return w("The contract type carries no defects liability period, yet one is stated.");
    case "DLP_REQUIRED_BY_TYPE":
      return w("The contract type carries a defects liability period, yet none is stated.");
    case "DLP_BEHAVIOUR_NOT_SET":
      return w("Defects liability not set for the contract type. Not checked.");
    case "LAD_UNIT_NOT_DAILY":
      return w(`Liquidated damages are stated ${d.unit ? `"${d.unit}"` : "with no unit"}, not a day: no daily rate is read from it.`);
    case "LAD_PCT_NOT_VALID":
    case "RETENTION_PCT_NOT_VALID":
      return w("A percentage is not a valid figure.");
    case "SECTIONS_REQUIRED":
      return w("Sectional completion applies but no section is stated.");
    case "SECTION_LAD_NOT_SET":
      return w(`Section "${d.section ?? ""}" has no liquidated damages stated.`);
    case "BUILDERS_WORKS_NOT_POSITIVE":
      return w("The prime cost and provisional sums are the whole contract sum or more.");
    case "RETENTION_STATED_BUT_BAND_SAYS_NONE":
      return w("Letter states retention; the band says none. The band's answer is used.");
    case "PROVENANCE_NOT_CHOSEN":
      return w(`${field(d.group === "sums" ? "sums" : d.group).en}: choose where it came from (stated, observed or assumed). There is no default.`);
    case "STATED_ELSEWHERE":
      return w(`${field(d.group).en} is stated by the award, the Appendix or the bill, so it is not keyed here.`);
    // ------------------------------------------------ 612-C1: the award's recorded terms corrected after issue
    case "AWARD_NOT_ISSUED":
      return w("Not issued yet. Edit the terms on the award.");
    case "AWARD_CANCELLED":
      return w("The award is cancelled: its record is kept as it was.");
    case "NO_BASELINE_VERSION":
      return w("No baseline version. Confirm the baseline first.");
    case "NOT_AWARD_SOURCED": {
      const t = AWARD_TERM_WORDS[d.term as AwardTerm] ?? w("That term");
      return w(`${t.en} in the baseline is not taken from the Letter of Acceptance, so it is not the award's to correct: an entered value is corrected on the Baseline tab, and one the Appendix or the bill states is kept as stated.`);
    }
    case "VALUE_NOT_VALID":
      return w("Not a valid figure for this field.");
    case "STATED_NOT_CORRECTED": {
      // Ruling Q1 (BD-612-23, ADR 0021 Amendment 1): kept as stated. 612-C1 (6.13 Part A step 0, a faithful
      // change as ruled): a value the Letter of Acceptance states, recorded wrongly, is corrected at its source by
      // correcting the award's recorded terms; a variation changes the terms rather than fixing a record.
      const f = field(d.group);
      const plural = /s$/.test(f.en);
      if (d.source === "DERIVED") {
        return w(
          `${f.en} ${plural ? "are" : "is"} derived under a recorded rule from values the award, the Appendix or the bill state, so ${plural ? "they change" : "it changes"} only when they do.`,
        );
      }
      const by: Record<string, Words> = {
        AWARD: w("the Letter of Acceptance"),
        APPENDIX: w("the frozen tender Appendix"),
        BQ: w("the bill of quantities pinned to the approved documents"),
      };
      const src = by[String(d.source)] ?? w("the award, the Appendix or the bill");
      if (d.source === "AWARD") {
        return w(
          `${f.en} ${plural ? "are" : "is"} stated by ${src.en}, so ${plural ? "they are" : "it is"} not corrected here: the baseline keeps what the award, the Appendix and the bill state, in that order. If it was recorded wrongly from the signed letter, correct the award's recorded term (Correct the award's term, beside it): a reasoned correction writes a new version, still from the Letter of Acceptance. A change to the terms themselves is a variation, not a correction.`,
        );
      }
      return w(
        `${f.en} ${plural ? "are" : "is"} stated by ${src.en}, so ${plural ? "they are" : "it is"} not corrected here: the baseline keeps what the award, the Appendix and the bill state, in that order. Only the award's recorded terms are corrected after issue; ${src.en} is kept as frozen. A change to the terms themselves is a variation, not a correction.`,
      );
    }
    case "DERIVED_BY_POLICY":
      return w(`${field(d.group).en} is derived from the builder's works value under the recorded rule, so it is not keyed here.`);
  }
  return w("Refused.");
}

export const contractFaultText = (f: Finding) => contractFaultWords(f).en;

/// Several refusals as one sentence each, after a lead.
export const refusalText = (lead: string, fs: readonly Finding[]) => `${lead} ${fs.map(contractFaultText).join(" ")}`.trim();
