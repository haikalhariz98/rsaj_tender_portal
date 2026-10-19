/**
 * Supervision's words (6.13 Part A, 4b), English and Malay. A code never reaches a screen: every enum value and
 * every refusal is worded here, naming what refuses the act and the way out of it. Exhaustive maps.
 */

import { formatDate } from "@/lib/format";

import type { HiddenAct, HiddenNeed } from "./authority";
import { restsOnStraightLine, type DelayReading } from "./delay";
import type { DelegationState } from "./delegation";
import type { EntryState } from "./diary";
import type { startRuleReading } from "./possession";
import type { BRANCH_OPENS } from "./records";
import type { ComplianceArea, ContractPartyKind, DelegateKind, DelegationVariant, DiaryEndorser, DirectionCause, EarlyActionBranch, Finding, PendingDeductionKind, ProgrammeDecision, ProgrammeKind, SiteRecordsSet, SoAssignmentReason, SupervisionAct } from "./types";

export interface Words {
  en: string;
}
export const w = (en: string): Words => ({ en });

export const SO_REASON_WORDS: Readonly<Record<SoAssignmentReason, Words>> = {
  EXECUTION: w("Resolved at execution"),
  RESOLVED: w("Resolved for a contract executed before supervision was recorded"),
  RE_RESOLVED: w("Re-resolved after the contract sum moved across a band"),
};

export const DELEGATE_KIND_WORDS: Readonly<Record<DelegateKind, Words>> = {
  PRINCIPAL: w("Principal Representative"),
  SPECIALIST: w("Specialist Representative"),
  SPECIALIST_QS: w("Specialist Representative (Quantity Surveyor)"),
};

export const ACT_WORDS: Readonly<Record<SupervisionAct, Words>> = {
  DIARY: w("Keep and attest the site diary"),
  PROGRAMME_SCRUTINY: w("Scrutinise the work programme"),
  PROGRESS: w("Record progress"),
  OBSERVATION: w("Record compliance observations"),
  CONTRACTOR_COMMUNICATION: w("Communicate with the contractor"),
  INSTRUCTION: w("Issue instructions"),
  VALUATION: w("Value work for interim payment"),
  VARIATION_APPLICATION: w("Apply for variations"),
};

/// The acts that are on no letter of delegation, which a representative is not offered (FR-SUP-004): said in words, never by their code.
export const HIDDEN_NEED_WORDS: Readonly<Record<HiddenNeed, Words>> = {
  SO_ONLY: w(
    "the acts that are the S.O.'s own, which no letter of delegation gives (such as early action, special site meetings, warning letters, and the decision on a variation)",
  ),
  PRINCIPAL_OR_SO: w(
    "the acts that are the Principal Representative's or the S.O.'s (such as possession of the site, the decision on the work programme, directions on it, and the release of retention)",
  ),
};

/**
 * What a representative is told is left off their screens (FR-SUP-004): the title and the note of the callout that stands at the top of every screen that hides something, so a
 * reader can tell an act that is not offered to them from one that is not possible. Null where nothing is hidden. Pure; the acts are named in words.
 */
export function hiddenNote(hidden: readonly HiddenAct[]): { title: Words; body: Words } | null {
  if (hidden.length === 0) return null;
  const listed = hidden.filter((a): a is SupervisionAct => a !== "SO_ONLY" && a !== "PRINCIPAL_OR_SO");
  const needs = hidden.filter((a): a is HiddenNeed => a === "SO_ONLY" || a === "PRINCIPAL_OR_SO");
  const en = ["You act as the S.O.'s representative, so some acts are left off your screens."];
  if (listed.length > 0) {
    en.push(`Your letter of delegation does not list these acts: ${listed.map((a) => ACT_WORDS[a].en.toLowerCase()).join("; ")}.`);
  }
  if (needs.length > 0) {
    en.push(`Also left off: ${needs.map((n) => HIDDEN_NEED_WORDS[n].en).join("; and ")}.`);
  }
  en.push("The S.O. records them.");
  return { title: w("Acts outside your delegation are not shown"), body: w(en.join(" ")) };
}

export const VARIANT_WORDS: Readonly<Record<DelegationVariant, Words>> = {
  CONVENTIONAL: w("Conventional contracts (letters A/1 and A/2)"),
  DESIGN_AND_BUILD: w("Design and build and turnkey (letters B/1 and B/2)"),
};

export const PROGRAMME_KIND_WORDS: Readonly<Record<ProgrammeKind, Words>> = {
  WORK_PROGRAMME: w("Work programme"),
  SERVICE_SCHEDULE: w("Service and maintenance implementation schedule"),
};

export const PROGRAMME_DECISION_WORDS: Readonly<Record<ProgrammeDecision, Words>> = {
  APPROVED: w("Approved"),
  RETURNED: w("Returned for revision"),
};

export const ENDORSER_WORDS: Readonly<Record<DiaryEndorser, Words>> = {
  SUPERIOR_OFFICER: w("Superior officer"),
  SUPERINTENDING_OFFICER: w("Superintending Officer"),
};

export const AREA_WORDS: Readonly<Record<ComplianceArea, Words>> = {
  MATERIAL_QUALITY: w("Quality of materials"),
  WORKMANSHIP: w("Workmanship"),
  AUTHORITY_COMPLIANCE: w("Local-authority and third-party compliance"),
  WORKER_WELFARE: w("Worker welfare"),
  SAFETY: w("Safety"),
  INSURANCE: w("Insurance protection"),
  WAGES: w("Payment of wages due"),
  OSHA: w("Occupational Safety and Health Act"),
};

export const CAUSE_WORDS: Readonly<Record<DirectionCause, Words>> = {
  VARIATION: w("A variation order"),
  LOCAL_AUTHORITY_DELAY: w("A local-authority delay"),
  OTHER_DELAY: w("Another contractual delay event"),
};

export const DEDUCTION_KIND_WORDS: Readonly<Record<PendingDeductionKind, Words>> = {
  INSURANCE_PREMIUM: w("Insurance premium paid by the employer (self-help)"),
};

export const BRANCH_WORDS: Readonly<Record<EarlyActionBranch, Words>> = {
  EXTEND_TIME: w("Grant an extension of time or of the contract period"),
  IMPOSE_LAD: w("Impose liquidated damages"),
  TERMINATE: w("Terminate the contractor's employment"),
};

export const PARTY_KIND_WORDS: Readonly<Record<ContractPartyKind, Words>> = {
  NOMINATED_SUBCONTRACTOR: w("Nominated sub-contractor"),
  NOMINATED_SUPPLIER: w("Nominated supplier"),
  ASSIGNEE: w("Approved assignee"),
};

export const RECORDS_SET_WORDS: Readonly<Record<SiteRecordsSet, Words>> = {
  PIPE_LOG: w("Pipe log"),
  AS_BUILT: w("As-built drawings"),
};

// ------------------------------------------------------------------ readings shown on the contract

export const DELEGATION_STATE_WORDS: Readonly<Record<DelegationState, Words>> = {
  LETTER_NOT_ISSUED: w("Letter not issued: not yet in force"),
  IN_FORCE: w("In force"),
  REVOKED: w("Revoked"),
  LETTER_VOID: w("Letter void: not in force"),
};
export const DELEGATION_STATE_TONE: Readonly<Record<DelegationState, "ok" | "warn" | "neutral">> = { LETTER_NOT_ISSUED: "warn", IN_FORCE: "ok", REVOKED: "neutral", LETTER_VOID: "neutral" };

export const ENTRY_STATE_WORDS: Readonly<Record<EntryState, Words>> = {
  COMPLETE: w("Attested by both"),
  AWAITING_OFFICER: w("Awaiting the responsible officer's attestation"),
  AWAITING_AGENT: w("Awaiting the contractor's agent's attestation"),
  AWAITING_BOTH: w("Not yet attested"),
  DISPUTED: w("Disputed: escalated to the S.O."),
};
export const ENTRY_STATE_TONE: Readonly<Record<EntryState, "ok" | "warn" | "err" | "neutral">> = { COMPLETE: "ok", AWAITING_OFFICER: "warn", AWAITING_AGENT: "warn", AWAITING_BOTH: "warn", DISPUTED: "err" };

export const START_RULE_WORDS: Readonly<Record<ReturnType<typeof startRuleReading>, Words>> = {
  SECURITIES_FIRST: w("Work starts once the bond and the required insurance are verified"),
  WITHOUT_SECURITIES: w("This contract type starts work without its securities"),
  NOT_SET: w("Not set for this contract type"),
};

/// Where an early-action branch goes, in words (never a module number).
export const BRANCH_OPENS_WORDS: Readonly<Record<(typeof BRANCH_OPENS)[EarlyActionBranch], Words>> = {
  PART_B: w("opens with extensions of time and termination, which this version does not record yet"),
  LAD_CHAIN: w("opens with the liquidated-damages chain, which arrives with the interim payment certificate"),
};

const pct = (v: string | null) => (v == null ? "none recorded" : `${v}%`);

/// BD-613-12 ruling: the In Delay reading is tagged ASSUMED wherever shown, as it rests on this reading no source states.
export const DELAY_BASIS = "Planned progress between the approved programme's points is read on a straight line.";

/// The In Delay reading in words, with what it was judged on, and whether it rests on the straight-line assumption
/// (tagged ASSUMED only then).
export function delayWords(r: DelayReading): { title: Words; detail: Words; tone: "err" | "ok" | "warn" | "neutral"; assumed: boolean } {
  return { ...delayText(r), assumed: restsOnStraightLine(r) };
}

function delayText(r: DelayReading): { title: Words; detail: Words; tone: "err" | "ok" | "warn" | "neutral" } {
  switch (r.state) {
    case "IN_DELAY":
      return r.why === "LAPSED"
        ? { tone: "err", title: w("In Delay"), detail: w(`The date for completion, ${formatDate(r.dateForCompletion)}, has passed with the work incomplete (latest progress ${pct(r.actualPct)}).`) }
        : { tone: "err", title: w("In Delay"), detail: w(`On ${formatDate(r.day)} actual progress was ${r.actualPct}% against ${r.plannedPct}% planned: below ${r.policyPct}% of the plan.`) };
    case "ON_TRACK":
      return { tone: "ok", title: w("Not in delay"), detail: w(`On ${formatDate(r.day)} actual progress was ${r.actualPct}% against ${r.plannedPct}% planned: not below ${r.policyPct}% of the plan.`) };
    case "NOT_SET":
      return { tone: "warn", title: w("Not judged: the percentage is not set"), detail: w("The share of planned progress below which a contract is In Delay is not set under Configuration › Post-award. It is never assumed.") };
    case "NOT_JUDGED": {
      const why: Record<typeof r.why, Words> = {
        NOT_POSSESSED: w("Possession of site is not recorded."),
        NO_PROGRAMME: w("No work programme is approved."),
        NO_PROGRESS: w("No progress is recorded."),
        BEFORE_PROGRAMME: w("The latest progress is before the approved programme's first point."),
      };
      return { tone: "neutral", title: w("Not judged"), detail: why[r.why] };
    }
  }
}

const day = (v: unknown) => (typeof v === "string" ? formatDate(v) : "that day");

/// Every supervision refusal, in both languages.
export function supervisionFaultWords(f: Finding): Words {
  const d = f.data ?? {};
  switch (f.code) {
    // ------------------------------------------------ the S.O.
    case "SO_UNRESOLVED":
      return w(`No superintending-officer rule on the approval matrix${d.matrix ? ` (${String(d.matrix)})` : ""} gives this contract an S.O. at its value and method, or the rules that match disagree. Record the rule on the approval matrix; the S.O. is never keyed.`);
    // ------------------------------------------------ the S.O. moved with a corrected Contract Date (6.13A residual)
    case "SO_MOVE_NO_MATRIX":
      return w(
        `No approval matrix was in force on ${day(d.day)}, so the S.O. (${String(d.office ?? "the office")}) that took effect on the Contract Date cannot be resolved again from the corrected date. The Contract Date is not corrected. Issue a matrix in force that day under Configuration › Approval matrix first.`,
      );
    case "SO_MOVE_UNRESOLVED":
      return w(
        `On ${day(d.day)} the approval matrix${d.matrix ? ` (${String(d.matrix)})` : ""} gives this contract no single S.O. at the value its S.O. (${String(d.office ?? "the office")}) was resolved at: no superintending-officer rule matches, or the rules that match disagree. The Contract Date is not corrected, because the S.O. would not hold from it. Record the rule on that matrix first.`,
      );
    case "SO_MOVE_OTHER_OFFICE":
      return w(
        `On ${day(d.day)} the approval matrix${d.matrix ? ` (${String(d.matrix)})` : ""} gives this contract another S.O., ${String(d.other ?? "another office")}, not ${String(d.office ?? "the office")}, which was resolved from the Contract Date. A date correction does not change who supervises, so the Contract Date is not corrected.`,
      );
    case "NOT_EXECUTED":
      return w("The contract is not executed yet: its S.O. is resolved at the employer's signature.");
    case "ALREADY_RESOLVED":
      return w("This contract's S.O. is already resolved.");
    case "NO_SO":
      return w("No S.O. is resolved for this contract yet. Resolve it on the Team tab first.");
    case "NOT_SO":
      return w(`Only the S.O. (${String(d.office ?? "the office")}) is recorded for this, or someone acting in that office.`);
    case "NOT_PRINCIPAL":
      return w(`This is the S.O.'s or the Principal Representative's: the person named is neither (the S.O. is ${String(d.office ?? "the office")}).`);
    case "NOT_IN_SCOPE":
      return w(`The person named is the S.O.'s representative, but "${ACT_WORDS[d.act as SupervisionAct]?.en ?? "this act"}" is outside their delegation's scope. The S.O. records it, or a delegation that covers it.`);
    case "RECORDER_OUT_OF_SCOPE":
      return w(
        d.kind === "SO"
          ? `You act as the S.O.'s representative, and this is the S.O.'s own act (${String(d.office ?? "the office")}), so you cannot record it, not even for the S.O. The S.O. records it.`
          : d.kind === "PRINCIPAL"
            ? `You act as a representative of the S.O., and this is the S.O.'s or the Principal Representative's act, so you cannot record it, not even for the S.O. The S.O. or a Principal Representative records it.`
            : `You act as the S.O.'s representative, and "${ACT_WORDS[d.act as SupervisionAct]?.en ?? "this act"}" is outside your delegation's scope, so you cannot record it, not even for the S.O. The S.O. records it, or a representative whose delegation covers it.`,
      );
    case "NOT_AUTHORISED":
      return w(`The person named is neither the S.O. (${String(d.office ?? "the office")}) nor a representative whose delegation is in force today.`);
    // ------------------------------------------------ delegation
    case "GRANTOR_NOT_SO":
      return w(`Only the S.O. (${String(d.office ?? "the office")}) delegates: the person named as delegating does not hold the office today.`);
    case "SUB_DELEGATION":
      return w("A representative never delegates: the S.O.'s authority is not delegated twice.");
    case "DELEGATE_IS_GRANTOR":
      return w("The S.O. does not delegate to themselves.");
    case "RECORDER_IS_DELEGATE":
      return w("You cannot record the S.O.'s delegation to yourself on their behalf. Another officer records it, or the S.O. signs in and delegates.");
    case "DELEGATE_INACTIVE":
      return w("Choose a delegate on record and active.");
    case "ALREADY_DELEGATED":
      return w("That person already has a delegation on this contract that is not revoked.");
    case "COMPETENCY_NOT_CONFIRMED":
      return w("Record the S.O.'s satisfaction that the delegate has the ability and experience needed, and on what it rests.");
    case "SCOPE_EMPTY":
      return w("Choose what the delegation covers.");
    case "VARIANT_NOT_SET":
      return w(`Which delegation letters ${d.type ? String(d.type) : "this contract type"} takes is not set. Set its delegation letter variant under Configuration › Reference data.`);
    case "FORMS_NOT_SET":
      return w(`The forms of the delegation letter and its notification for ${VARIANT_WORDS[d.variant as DelegationVariant]?.en.toLowerCase() ?? "this variant"} are not set. Set them under Configuration › Post-award.`);
    case "ALREADY_REVOKED":
      return w("The delegation is already revoked.");
    case "BEFORE_RECORDED":
      return w(`Not before the delegation was made (${day(d.day)}).`);
    // ------------------------------------------------ possession
    case "NOT_STAMPED":
      return w("Possession is recorded once the contract is fully executed: record its stamping first (Formation › Signing).");
    case "ALREADY_POSSESSED":
      return w("Possession of site is recorded once.");
    case "NO_BASELINE_VERSION":
      return w("The baseline has no version: possession writes a new one, so confirm the baseline first.");
    case "BEFORE_CONTRACT_DATE":
      return w(`Not before the Contract Date (${day(d.day)}).`);
    case "BEFORE_LATEST_ACT":
      return w(`The representative was recorded for an act or signed on ${day(d.day)}: the delegation can be revoked from the day after, not earlier.`);
    case "BEFORE_SO":
      return w(`Nobody supervises the site before ${day(d.day)}, the day this contract's S.O. takes effect: possession is not recorded before it.`);
    case "START_RULE_NOT_SET":
      return w(`Whether ${d.type ? String(d.type) : "this contract type"} needs its securities before work starts is not set. Set its start-of-work behaviour under Configuration › Reference data.`);
    case "SECURITIES_NOT_MET":
      return w(`This contract type starts only with its securities verified: ${d.item === "BOND" ? "the performance bond" : "the required insurance"} is ${d.state === "NOT_SET" ? "not decided" : "not met"} (see Securities).`);
    // ------------------------------------------------ programme
    case "OPEN_REVISION":
      return w(`Revision ${String(d.revision ?? "")} is still waiting for its decision: decide it first.`);
    case "DECIDED":
      return w("That revision is already decided.");
    case "ALREADY_SCRUTINISED":
      return w("Its scrutiny is already recorded.");
    case "ANSWER_REQUIRED":
      return w("Say whether it reflects a reasonable and realistic sequence with reasonable commencement and completion dates.");
    case "NOTE_REQUIRED":
      return w("Say what is wrong with it.");
    case "BEFORE_SUBMITTED":
      return w(`Not before it was submitted (${day(d.day)}).`);
    case "NOT_SCRUTINISED":
      return w("A programme is approved only after its scrutiny is recorded.");
    case "FOUND_UNREASONABLE":
      return w("Its scrutiny found it not reasonable: return it for revision instead.");
    case "NO_POINTS":
      return w("Give its planned progress (at least one day and percentage): it is the baseline progress is measured against.");
    case "BEFORE_SCRUTINY":
      return w(`Not before its scrutiny (${day(d.day)}).`);
    case "POINT_NOT_A_PERCENT":
      return w(`Line ${String(d.line ?? "")}: the planned percentage must be from 0 to 100, to at most four places.`);
    case "POINT_DAYS_NOT_ASCENDING":
      return w(`Line ${String(d.line ?? "")}: each day must come after the one before.`);
    case "POINT_PCT_FALLS":
      return w(`Line ${String(d.line ?? "")}: planned progress is cumulative and never falls.`);
    case "POINT_BEFORE_POSSESSION":
      return w(`Line ${String(d.line ?? "")}: not before possession of site (${day(d.day)}).`);
    // ------------------------------------------------ diary, progress, records
    case "NOT_POSSESSED":
      return w("Possession of site is not recorded yet: the site's records start from it (Site tab).");
    case "BEFORE_POSSESSION":
      return w(`Not before possession of site (${day(d.day)}).`);
    case "ALREADY_ENTERED":
      return w(`The diary already has an entry for ${day(d.day)}: one a day.`);
    case "ENTRY_REQUIRED":
      return w("Write the day's entry.");
    case "BACKDATED_NO_EXCEPTION":
      return w(`An entry for ${day(d.day)}, an earlier day, needs a recorded exception: say why it was not written on the day.`);
    case "ALREADY_ATTESTED":
      return w("Already attested.");
    case "AGENT_NAME_REQUIRED":
      return w("Give the contractor's agent's name, as signed.");
    case "BEFORE_DAY":
      return w(`Not before the day the entry is for (${day(d.day)}).`);
    case "DISAGREEMENT_REQUIRED":
      return w("Say what the two disagree on.");
    case "ALREADY_DISPUTED":
      return w("A disagreement is already recorded on this entry and escalated to the S.O.");
    case "COVERS_ORDER":
      return w("The covered days run from the first to the last.");
    case "BEFORE_COVER":
      return w(`The visit is on or after the last day it covers (${day(d.day)}).`);
    case "NO_ENTRIES":
      return w("No diary entry falls in those days.");
    case "NOT_A_PERCENT":
      return w("Give a percentage from 0 to 100, to at most four places.");
    case "ALREADY_RECORDED":
      return w(`Progress is already recorded for ${day(d.day)}.`);
    case "FALLS":
      return w("Actual progress is cumulative: it is not below an earlier day's, nor above a later day's.");
    case "NOT_IN_DELAY":
      return w("A special meeting follows an In Delay classification, and the contract is not In Delay on that day.");
    case "MINUTES_REQUIRED":
      return w("Record the minutes.");
    case "NO_ATTENDEES":
      return w("Name who attended.");
    case "POLICY_NOT_ON_CONTRACT":
      return w("Choose a policy lodged on this contract.");
    case "AMOUNT_NOT_POSITIVE":
      return w("Give the premium paid, above nothing.");
    case "EXTENDED_NOT_LATER":
      return w(`The extended cover runs past the policy's present end (${day(d.day)}).`);
    case "NO_BRANCH":
      return w("Choose at least one action.");
    case "NO_LIVE_VERSION":
      return w(`Nothing to hand over: no ${RECORDS_SET_WORDS[d.set as SiteRecordsSet]?.en.toLowerCase() ?? "record"} is attached to the contract.`);
    case "TO_REQUIRED":
      return w("Say who it is handed to (the Implementing Department).");
    case "RECEIVER_REQUIRED":
      return w("Name who received it.");
    case "NAME_REQUIRED":
      return w("Give the party's name.");
    case "PARTY_BEFORE_EXECUTION":
      return w("Parties paid through the certificates are recorded once the contract is executed.");
    case "SUM_NEGATIVE":
      return w("A sum is never below nothing.");
    case "DUPLICATE_NAME":
      return w("That party is already recorded on this contract.");
    case "RETIRED":
      return w("That party is already retired.");
    // ------------------------------------------------ shared
    case "FUTURE_DATE":
      return w(`Not in the future (${day(d.day)}).`);
    case "REASON_REQUIRED":
      return w("Give the reason.");
    default:
      return w("Refused.");
  }
}

export const supervisionFaultText = (f: Finding) => supervisionFaultWords(f).en;
export const supervisionRefusal = (lead: string, fs: readonly Finding[]) => `${lead} ${fs.map(supervisionFaultText).join(" ")}`.trim();
