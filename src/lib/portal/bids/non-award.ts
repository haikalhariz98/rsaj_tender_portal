/**
 * The notice of non-award to an unsuccessful tenderer (FR-AWD-010, policy D7, Phase 4d). Pure.
 *
 * Nothing in the corpus tells an unsuccessful tenderer anything: no regret letter, no reasons, no debrief. Notifying is a deliberate policy change that must be signed off, including whether a debrief
 * creates a challenge exposure, so the organisation's decision is a setting that ships unset (`AwardPolicy.nonAwardNotices`). While it is not set, or is "no", nothing is issued and the screen says which.
 * A debrief that carries the reason for non-award is a second decision (`debriefIncludesReason`), also unset: unset means the notice states the outcome and no reason. The tenderer's own composite score is NOT
 * part of a notice: evaluation scores are confidential (SULIT), and whether a tenderer may be given its own is an open question for the product owner, so nothing here reads one.
 *
 * An unsuccessful tenderer is a party named on an opened bid (an alternative is the same tenderer's) when the award went to another party. An award whose awardee is not a party of the exercise cannot say who the others
 * are, and issues nothing. The notice is issued by an officer from the award, once per tenderer, after the award was issued; its text is frozen then. It is shown in the portal and is not sent (INT-09).
 */

import type { Finding } from "@/lib/window/types";

export type NonAwardFault = "D7_NOT_SET" | "D7_OFF" | "AWARD_NOT_ISSUED" | "AWARDEE_NOT_NAMED" | "NOT_UNSUCCESSFUL" | "ALREADY_ISSUED" | "REASON_REQUIRED" | "REASON_TOO_LONG";
export type NonAwardFinding = Finding<NonAwardFault>;

export const REASON_MAX = 2000;

export interface NonAwardPolicy {
  nonAwardNotices: boolean | null;
  debriefIncludesReason: boolean | null;
}

/// How the organisation's decision reads: not made, made against, made for.
export type NonAwardSetting = "NOT_SET" | "OFF" | "ON";
export const nonAwardSetting = (p: NonAwardPolicy): NonAwardSetting => (p.nonAwardNotices == null ? "NOT_SET" : p.nonAwardNotices ? "ON" : "OFF");

/// Whether a notice carries a reason: only where the organisation decided it does. Unset carries none.
export const carriesReason = (p: NonAwardPolicy): boolean => p.debriefIncludesReason === true;

/// Award statuses from which the award stands as issued.
export const awardStands = (status: string): boolean => status === "ISSUED" || status === "ACCEPTED";

/// A notice of non-award stands only while the award it was issued under does. An award that was cancelled and made again leaves the first award's notices on record (the table is append-only), read as superseded.
export const noticeStands = (awardStatus: string): boolean => awardStands(awardStatus);

/// What a supplier is told of a notice issued under an award that no longer stands: it is not repeated, because it no longer applies.
export const SUPERSEDED_NOTICE_WORDS = "A notice of the outcome was issued to your company under an award that was later cancelled. It no longer applies.";

/// The parties named on an opened bid, other than the awardee. An award whose awardee is not a party names none.
export function unsuccessfulPartyIds(bids: readonly { partyId: string }[], awardeePartyId: string | null): string[] {
  if (!awardeePartyId) return [];
  return [...new Set(bids.map((b) => b.partyId))].filter((id) => id !== awardeePartyId);
}

export interface IssueInput {
  policy: NonAwardPolicy;
  award: { status: string; awardeePartyId: string | null };
  partyId: string;
  unsuccessful: readonly string[];
  alreadyIssued: boolean;
  reason: string;
}

export function issueFaults(i: IssueInput): NonAwardFinding[] {
  const out: NonAwardFinding[] = [];
  const setting = nonAwardSetting(i.policy);
  if (setting === "NOT_SET") out.push({ code: "D7_NOT_SET", level: "block" });
  if (setting === "OFF") out.push({ code: "D7_OFF", level: "block" });
  if (!awardStands(i.award.status)) out.push({ code: "AWARD_NOT_ISSUED", level: "block" });
  else if (!i.award.awardeePartyId) out.push({ code: "AWARDEE_NOT_NAMED", level: "block" });
  else if (!i.unsuccessful.includes(i.partyId)) out.push({ code: "NOT_UNSUCCESSFUL", level: "block" });
  // `alreadyIssued` is of THIS award: a notice under an award that was cancelled does not stop one under the award that replaced it.
  if (i.alreadyIssued) out.push({ code: "ALREADY_ISSUED", level: "block" });
  if (carriesReason(i.policy)) {
    const reason = i.reason.trim();
    if (!reason) out.push({ code: "REASON_REQUIRED", level: "block" });
    else if (reason.length > REASON_MAX) out.push({ code: "REASON_TOO_LONG", level: "block" });
  }
  return out;
}

/// The reason as it is frozen on the notice: the officer's words where the debrief carries one, otherwise nothing, whatever was typed.
export const reasonToFreeze = (p: NonAwardPolicy, typed: string): string => (carriesReason(p) ? typed.trim() : "");

/// The outcome in the product's own words, frozen at issue. It names the exercise and says the award went elsewhere. It does not name the awardee (the award is published under Results) and states no figure.
export function outcomeText(i: { reference: string; title: string }): string {
  return `Your bid for ${i.reference}, ${i.title}, was not successful. The award has been made to another tenderer.`;
}

/// The notice as a supplier reads it: the outcome, then the reason where the notice carries one.
export const noticeBody = (outcome: string, reason: string): string => (reason.trim() ? `${outcome}\n\nReason given: ${reason.trim()}` : outcome);

/// What the notice was issued under, kept with it.
export function policySnapshot(p: NonAwardPolicy, provenance: string | null): { nonAwardNotices: boolean | null; debriefIncludesReason: boolean | null; provenance: string | null } {
  return { nonAwardNotices: p.nonAwardNotices, debriefIncludesReason: p.debriefIncludesReason, provenance };
}

const TEXT: Record<NonAwardFault, (d: Record<string, string | number | null>) => string> = {
  D7_NOT_SET: () => "Nothing is issued: the organisation has not decided whether unsuccessful tenderers are sent a notice of the outcome (policy D7 is not set). Set it under Configuration, Awards.",
  D7_OFF: () => "Nothing is issued: the organisation has decided not to send unsuccessful tenderers a notice of the outcome (policy D7).",
  AWARD_NOT_ISSUED: () => "The award has not been issued, so nobody is yet an unsuccessful tenderer.",
  AWARDEE_NOT_NAMED: () => "The award does not name which tenderer of this exercise it went to, so the unsuccessful tenderers cannot be told apart. Link the award to its bidder first.",
  NOT_UNSUCCESSFUL: () => "That tenderer is not one whose bid was opened and did not win.",
  ALREADY_ISSUED: () => "A notice has already been issued to that tenderer.",
  REASON_REQUIRED: () => "State the reason for non-award: the organisation's debrief carries one.",
  REASON_TOO_LONG: (d) => `The reason is longer than ${d.max ?? REASON_MAX} characters.`,
};

export const nonAwardFaultText = (f: NonAwardFinding): string => TEXT[f.code]({ max: REASON_MAX, ...(f.data ?? {}) });
export const hasNonAwardFaultText = (code: string): boolean => code in TEXT;

/// The organisation's decision, in a sentence for the screens that show the setting.
export function nonAwardSettingWords(p: NonAwardPolicy): string {
  switch (nonAwardSetting(p)) {
    case "NOT_SET":
      return "Not decided (policy D7). Nothing is issued, and the portal shows tenderers no notice.";
    case "OFF":
      return "Decided against: unsuccessful tenderers are not sent a notice of the outcome (policy D7).";
    case "ON":
      return carriesReason(p)
        ? "Decided for: each unsuccessful tenderer is sent a notice of the outcome with the reason you state. The notice is shown in the portal and is not sent."
        : p.debriefIncludesReason === false
          ? "Decided for: each unsuccessful tenderer is sent a notice of the outcome, with no reason. The notice is shown in the portal and is not sent."
          : "Decided for: each unsuccessful tenderer is sent a notice of the outcome. Whether it carries a reason is not decided, so it carries none. The notice is shown in the portal and is not sent.";
  }
}
