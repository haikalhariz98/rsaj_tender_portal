/**
 * How committee codes read on a screen.
 *
 * Statuses, blockers, faults and kinds are configuration keys; none of them may
 * reach a screen as written. One place, so a blocker reads the same on the sitting,
 * the matter and the route's error.
 */

import type { AttendanceFault } from "./sitting";
import type { MatterBlocker, OutcomeFault, VoteFault } from "./matter";
import type { TablingFault } from "./tabling";
import type { TransitionFault } from "./meeting";
import { SIGNATORY_DOMAIN } from "@/lib/award/types";
import { LATE_DOMAIN } from "@/lib/bids/late";
import { WINDOW_CHANGE_DOMAIN } from "@/lib/method/types";
import { SCOPE_DOMAIN } from "@/lib/scope/scope-matter";
import { EVALUATION_STAGE_DOMAIN, NEGOTIATION_DOMAIN } from "@/lib/evaluation/types";
import { SPECIAL_PERMISSION_DOMAIN, SUPPLIER_BLACKLIST_DOMAIN, SUPPLIER_REGISTRATION_DOMAIN } from "@/lib/suppliers/types";
import { VARIATION_DOMAINS } from "@/lib/variation/domains";
import { CONTRACT_MATTER_DOMAINS } from "@/lib/matter/matter";

export const MEETING_STATUS_LABEL = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  MINUTED: "Minuted",
  CANCELLED: "Cancelled",
} as const;

export const MEETING_STATUS_TONE = {
  SCHEDULED: "info",
  IN_PROGRESS: "brand",
  MINUTED: "ok",
  CANCELLED: "neutral",
} as const;

export const OUTCOME_LABEL = {
  PENDING: "Pending",
  CARRIED: "Carried",
  NOT_CARRIED: "Not carried",
  DEFERRED: "Deferred",
} as const;

export const OUTCOME_TONE = {
  PENDING: "warn",
  CARRIED: "ok",
  NOT_CARRIED: "err",
  DEFERRED: "neutral",
} as const;

export const VOTING_RULE_LABEL = {
  SIMPLE_MAJORITY: "Simple majority of votes cast",
  UNANIMOUS: "Unanimous",
} as const;

export const NOT_APPROVED_KIND_LABEL = {
  LOOP: "Returns the matter",
  TERMINAL: "Ends the matter",
} as const;

/// The closed set of record kinds a matter can concern (ruling 5.3).
export const MATTER_KIND_LABEL = {
  REQUISITION: "Requisition",
  EXERCISE: "Sourcing exercise",
  LATE_TENDER: "Late tender admission",
  CONTRACT: "Contract",
  VARIATION: "Variation",
  SCOPE: "Scope (bill of quantities)",
  /// 6.8 (FR-EVL-005): a two-stage tender's first-stage decision on one bidder.
  EVALUATION_STAGE: "Two-stage tender, first stage",
  /// 6.15 (OD-2 A): a supplier matter, approved on its own route. Never tabled at a sitting.
  SUPPLIER: "Supplier matter",
  /// 6.14 (ADR 0022): a certificate's own route, named by ApprovalInstance.certificateId. Never tabled at a sitting
  /// until a module gives a committee matter a typed certificate key.
  CERTIFICATE: "Certificate",
} as const;

export type MatterKind = keyof typeof MATTER_KIND_LABEL;
export const MATTER_KINDS = Object.keys(MATTER_KIND_LABEL) as MatterKind[];

/// Kinds tabled only from their own record. A SCOPE matter names the bill version it tables by a
/// typed key, so it is tabled from the exercise's Scope section, which knows the version (6.2
/// OD-9). A LATE_TENDER matter names its envelope by a typed key, so it is tabled from the Bids
/// received tab (6.6 code review CR-1): tabled from a sitting it would name no envelope, its
/// decision would never count and the late-admission gate would hold the award for ever.
/// 6.8 (FR-EVL-005): an EVALUATION_STAGE matter names its bidder by a typed key, so it is tabled from
/// the exercise's Evaluation tab, which knows the bidder; from a sitting its decision would unlock nothing.
/// 6.13 Part A step 4 (FR-VAR-009, 010; FR-PAD-004): a VARIATION matter names its variation by a typed key, so it is
/// tabled from the variation, which knows the approval the committee decides on (its route's step, or the funder's
/// consent); from a sitting it would name no variation and its decision could discharge nothing.
/// 6.13 Part B run 1a (ADR 0029 §3, BD-613-73): a CONTRACT matter names its contract matter by a typed key, so it is
/// tabled from the matter (its route's committee step, through tablingOf); from a sitting it would name no matter and
/// its decision could discharge nothing.
export const RECORD_TABLED_MATTER_KINDS: readonly MatterKind[] = ["SCOPE", "LATE_TENDER", "EVALUATION_STAGE", "VARIATION", "CONTRACT"];

/// 6.15: kinds no sitting tables at all. A supplier matter is decided on its own route, which takes no committee step.
/// 6.14: a certificate matter names no certificate on a committee decision (no typed key yet), so a sitting tabling
/// one would decide nothing any certificate reads.
export const NEVER_TABLED_MATTER_KINDS: readonly MatterKind[] = ["SUPPLIER", "CERTIFICATE"];

/// Kinds tabled from the sitting's own drawer: every kind but those tabled from their record, and those never tabled.
export const SITTING_TABLED_MATTER_KINDS = MATTER_KINDS.filter((k) => !RECORD_TABLED_MATTER_KINDS.includes(k) && !NEVER_TABLED_MATTER_KINDS.includes(k));

/// Matter domains tabled only from their own record, for the same reasons.
/// 6.13 Part B run 1b C8b (BD-613-117): every contract-matter domain, tabled from its matter (tablingOf, CONTRACT keys).
export const RECORD_TABLED_DOMAINS: readonly string[] = [SCOPE_DOMAIN, LATE_DOMAIN, EVALUATION_STAGE_DOMAIN, ...VARIATION_DOMAINS, ...CONTRACT_MATTER_DOMAINS];
export const RECORD_TABLED_DOMAIN_TEXT = "Scope approval is tabled from the exercise, under Scope and estimate, Scope, which names the bill version the committee decides on.";
export const LATE_TABLED_TEXT = "Late tender admission is tabled from the exercise, in the Received section of Bids and opening, which names the envelope the committee decides on.";
export const VARIATION_TABLED_TEXT = "A variation's matter is tabled from the variation, on its contract's Variations tab, which names the variation and the approval the committee decides on.";
/// 6.13 Part B run 1a: where a contract matter is tabled, in English and Malay (the sitting's refusal shows the English).
export const CONTRACT_TABLED_WORDS = {
  en: "A contract matter (an extension of time, a period extension, a waiver of damages, a termination, a nomination, a nominated-sum increase or a loss-and-expense claim) is tabled from the matter itself, on its contract, which names the matter and the step the committee decides on.",
  ms: "Perkara kontrak (lanjutan masa, lanjutan tempoh, pengecualian ganti rugi, penamatan, penamaan, pertambahan jumlah dinamakan atau tuntutan kerugian dan perbelanjaan) dibentangkan daripada perkara itu sendiri, pada kontraknya, yang menamakan perkara dan langkah yang diputuskan oleh jawatankuasa.",
} as const;
export const STAGE_ONE_TABLED_TEXT = "A two-stage tender's first-stage decision is tabled from the exercise, in the Stages section of Evaluation, which names the bidder the committee decides on.";

/// Matter domains no sitting decides at all (6.6 review S-9): a committee decision on either would
/// be read by nothing. A change to the invitation window is approved on its route, where a committee
/// step is refused (window/change.ts HAS_COMMITTEE_STEP); the award's signatory is the office the
/// approval matrix names (award/signatory.ts).
/// 6.8 adds the negotiation (FR-EVL-016): approved on its own route, which takes no committee step.
/// 6.15 adds the supplier's registration (OD-2 A): approved on its own route, which takes no committee step;
/// and (a2) its blacklisting (OD-8 A) and a special permission (FR-ADV-017), likewise.
export const NEVER_TABLED_DOMAINS: readonly string[] = [WINDOW_CHANGE_DOMAIN, SIGNATORY_DOMAIN, NEGOTIATION_DOMAIN, SUPPLIER_REGISTRATION_DOMAIN, SUPPLIER_BLACKLIST_DOMAIN, SPECIAL_PERMISSION_DOMAIN];
export const WINDOW_CHANGE_NOT_TABLED_TEXT = "A change to the invitation window is approved on its own route, from the exercise's Invitation tab; that route takes no committee step, so no sitting decides it.";
export const SIGNATORY_NOT_TABLED_TEXT = "The award's signatory is the office the approval matrix names for the award, shown on the award; no sitting decides it.";
export const NEGOTIATION_NOT_TABLED_TEXT = "A negotiation is approved on its own route, from the exercise's Evaluation tab, in Meetings and letters; that route takes no committee step, so no sitting decides it.";
export const SUPPLIER_NOT_TABLED_TEXT = "A supplier matter is approved on its own route, from the supplier's record under Suppliers; that route takes no committee step, so no sitting decides it.";
export const CERTIFICATE_NOT_TABLED_TEXT = "A certificate is approved on its own route, opened by the module that raises it; a committee decision cannot yet name a certificate, so no sitting tables one.";

export const sittingTablesDomain = (domain: string) => !RECORD_TABLED_DOMAINS.includes(domain) && !NEVER_TABLED_DOMAINS.includes(domain);

/// Where a domain or a kind a sitting does not table is dealt with, said when a sitting is asked to table it.
export function recordTabledText(domainOrKind: string): string | null {
  if (domainOrKind === SCOPE_DOMAIN || domainOrKind === "SCOPE") return RECORD_TABLED_DOMAIN_TEXT;
  if (domainOrKind === LATE_DOMAIN || domainOrKind === "LATE_TENDER") return LATE_TABLED_TEXT;
  if (domainOrKind === WINDOW_CHANGE_DOMAIN) return WINDOW_CHANGE_NOT_TABLED_TEXT;
  if (domainOrKind === SIGNATORY_DOMAIN) return SIGNATORY_NOT_TABLED_TEXT;
  if (domainOrKind === EVALUATION_STAGE_DOMAIN || domainOrKind === "EVALUATION_STAGE") return STAGE_ONE_TABLED_TEXT;
  if (VARIATION_DOMAINS.includes(domainOrKind) || domainOrKind === "VARIATION") return VARIATION_TABLED_TEXT;
  if (domainOrKind === NEGOTIATION_DOMAIN) return NEGOTIATION_NOT_TABLED_TEXT;
  if (domainOrKind === SUPPLIER_REGISTRATION_DOMAIN || domainOrKind === SUPPLIER_BLACKLIST_DOMAIN || domainOrKind === SPECIAL_PERMISSION_DOMAIN || domainOrKind === "SUPPLIER") return SUPPLIER_NOT_TABLED_TEXT;
  if (domainOrKind === "CERTIFICATE") return CERTIFICATE_NOT_TABLED_TEXT;
  if (CONTRACT_MATTER_DOMAINS.includes(domainOrKind) || domainOrKind === "CONTRACT") return CONTRACT_TABLED_WORDS.en;
  return null;
}

export const POSITION_LABEL = {
  CHAIRMAN: "Chairman",
  DEPUTY_CHAIRMAN: "Deputy Chairman",
  MEMBER: "Member",
  SECRETARY: "Secretary",
} as const;

/// A vote, in English, with the Malay term the member signs on the sheet.
export const VOTE_LABEL = {
  SETUJU: { en: "Agree", ms: "Setuju" },
  TIDAK_SETUJU: { en: "Disagree", ms: "Tidak setuju" },
} as const;

export const CHOICE_LABEL: Record<string, string> = {
  SETUJU: "Agree (Setuju)",
  TIDAK_SETUJU: "Disagree (Tidak setuju)",
  ABSTAIN: "Abstain",
};

/// What a committee does when it sits, as a noun, matching the act labels
/// ("Recommendation" beside "Mandatory recommendation").
export const COMMITTEE_ACTION_LABEL: Record<string, string> = {
  APPROVES: "Approval",
  RECOMMENDS: "Recommendation",
  CONSENTS: "Consent",
  DECIDES: "Decision",
};

/// Tabled and pending counts, worded one way on every screen.
export function matterCount(tabled: number, pending: number): string {
  return tabled === 0 ? "None tabled" : `${tabled} tabled · ${pending} pending`;
}

export const BLOCKER_LABEL: Record<MatterBlocker, string> = {
  SITTING_NOT_STARTED: "Sitting not started",
  NOT_TABLED: "Not tabled",
  DEPENDENCY_PENDING: "Waits on another matter",
  QUORUM_UNCONFIGURED: "Quorum not set",
  QUORUM_NOT_MET: "Not quorate",
  VOTING_RULE_UNCONFIGURED: "Voting rule not set",
  ALTERNATE_FOR_RECUSED_UNCONFIGURED: "Alternates for recused members not set",
  INELIGIBLE_VOTE: "Vote from someone not entitled",
  VOTES_OUTSTANDING: "Votes outstanding",
  MANDATORY_ACT_NOT_FULL_BODY: "Full body required",
};

export const ATTENDANCE_FAULT_MESSAGE: Record<AttendanceFault, string> = {
  NOT_A_MEMBER: "does not hold a seat on this committee on the sitting date.",
  STAND_IN_FOR_CHAIR: "cannot stand in for the chair. Nobody substitutes for the chairman.",
  STAND_IN_WHILE_HOLDER_PRESENT: "is standing in for a seat whose holder is present.",
  ALTERNATE_NOT_FOR_THAT_SEAT: "is not an alternate for that seat.",
  SEAT_COVERED_TWICE: "is standing in for a seat another alternate already covers.",
  OFFICE_CONTESTED:
    "holds an office that has more than one holder on the sitting date. Fix the role assignments under Configuration, Users & roles, Roles; the system will not pick one.",
};

/// Where contested office assignments are fixed.
export const ROLE_ASSIGNMENTS_HREF = "/configuration/users?tab=roles";

/**
 * An attendance fault as a sentence about one person. A contested office names the
 * office and its competing holders, so the fix is findable.
 */
export function attendanceFaultText(
  name: string,
  fault: AttendanceFault,
  contested?: { office: string | null; holders: string[] },
): string {
  if (fault === "OFFICE_CONTESTED" && contested) {
    return `${name} holds the office of ${contested.office ?? "an office"}, which ${contested.holders.join(" and ")} both hold on the sitting date. Fix the conflicting role assignment under Configuration, Users & roles, Roles; the system will not pick one.`;
  }
  return `${name} ${ATTENDANCE_FAULT_MESSAGE[fault]}`;
}

/// The notification event a matter not carried will raise once delivery exists. A
/// NotificationRule may be configured for it now; nothing is sent (FR-CTE-009).
export const NOT_CARRIED_EVENT_KEY = "committee_matter_not_carried";

export const OUTCOME_FAULT_MESSAGE: Record<OutcomeFault, string> = {
  MATTER_NOT_READY: "The matter cannot be decided yet. Clear what blocks it first.",
  OUTCOME_CONTRADICTS_VOTES: "That outcome does not follow from the votes recorded.",
  NO_OUTCOMES_CONFIGURED:
    "No not-approved outcome is configured for this committee, so a matter voted down cannot be recorded. Configure one under Configuration, Committees, Not-approved outcomes.",
  OUTCOME_REQUIRED: "Choose what happens to the matter next.",
  OUTCOME_NOT_OFFERED: "That outcome is retired or not offered to this committee.",
  NOTE_REQUIRED: "Say why, in a note.",
};

export const VOTE_FAULT_MESSAGE: Record<VoteFault, string> = {
  INVALID_CHOICE: "The vote must be Setuju or Tidak Setuju.",
  INVALID_DATE: "The date on the voting sheet must be a date (YYYY-MM-DD).",
  ABSTAIN_REFUSED:
    "Abstention is not recorded. A member who cannot take part declares a recusal instead.",
  DATE_IN_FUTURE: "The date on the voting sheet cannot be after today.",
  DATE_BEFORE_SITTING: "The date on the voting sheet cannot be before the sitting.",
  MEETING_NOT_STARTED: "The sitting has not started. Start it before recording votes.",
  MEETING_CLOSED: "The sitting is closed. Votes can no longer change.",
  MATTER_NOT_TABLED: "The matter has not been tabled.",
  MATTER_DECIDED: "The matter has already been decided.",
  MATTER_WITHDRAWN: "The matter was withdrawn from the agenda: nothing is recorded on it.",
  TIME_ZONE_UNSET:
    "The organisation's time zone is not set, so the date on a voting sheet cannot be judged. Set it under Configuration, Organisation.",
  NOT_A_PRESENT_VOTER: "That person is not recorded as a present voting member of this sitting.",
  RECUSED: "That member has declared a recusal on this matter.",
};

export const TABLING_FAULT_MESSAGE: Record<TablingFault, string> = {
  SECRETARIAT_NOT_SET:
    "No Secretariat office is set for this committee, so nobody may table a matter. Set one in the committee's configuration.",
  NOT_TABLED: "Choose who tabled the matter.",
  NOT_SECRETARIAT_HOLDER: "That person does not hold the Secretariat office on the tabling date.",
  TIME_ZONE_UNSET:
    "The organisation's time zone is not set, so the tabling day cannot be judged. Set it under Configuration, Organisation.",
};

export const TRANSITION_FAULT_MESSAGE: Record<TransitionFault, string> = {
  NOT_ALLOWED: "A sitting cannot move to that status from where it is.",
  MINUTES_REQUIRED: "Upload the minutes before the sitting is minuted.",
  MATTERS_PENDING: "Every matter must be decided or deferred before the sitting is minuted.",
  REASON_REQUIRED: "Say why the sitting is cancelled.",
  MATTERS_DECIDED: "A sitting that has decided a matter cannot be cancelled.",
  NOT_YET_DUE: "A sitting cannot start before the day it is dated.",
  TIME_ZONE_UNSET:
    "The organisation's time zone is not set, so whether the sitting's day has come cannot be judged. Set it under Configuration, Organisation.",
  REGISTER_FAULTS: "The register has faults. Correct the attendance before the sitting is minuted.",
  DECISION_NO_LONGER_HOLDS:
    "A decided matter no longer follows from the register and the votes. Correct it before the sitting is minuted.",
};

/**
 * Why a matter cannot be decided, in a few words, for beside a disabled control.
 * The first blocker only: it is the one to clear next.
 */
export function blockerShort(a: {
  blockers: readonly MatterBlocker[];
  quorum: { shortfall: number | null };
  tally: { notVoted: number; cast: number };
}): string | null {
  const b = a.blockers[0];
  if (!b) return null;
  switch (b) {
    case "SITTING_NOT_STARTED":
      return "The sitting has not started";
    case "QUORUM_NOT_MET": {
      const n = a.quorum.shortfall ?? 0;
      return `Needs ${n} more voting ${n === 1 ? "member" : "members"} present`;
    }
    case "VOTES_OUTSTANDING":
      return a.tally.cast === 0
        ? "No votes recorded yet"
        : `${a.tally.notVoted} ${a.tally.notVoted === 1 ? "vote" : "votes"} outstanding`;
    case "QUORUM_UNCONFIGURED":
      return "The committee's quorum is not set";
    case "VOTING_RULE_UNCONFIGURED":
      return "The committee's voting rule is not set";
    case "ALTERNATE_FOR_RECUSED_UNCONFIGURED":
      return "Whether an alternate may vote for a recused member is not set";
    case "NOT_TABLED":
      return "Not tabled";
    case "DEPENDENCY_PENDING":
      return "Waits on another matter";
    case "INELIGIBLE_VOTE":
      return "A vote on record does not count";
    case "MANDATORY_ACT_NOT_FULL_BODY":
      return "The full voting body must be present";
  }
}

/// Where the committee's own configuration makes a matter undecidable, one sentence
/// for the matter rather than a list of tags.
export function configurationGapLine(blockers: readonly MatterBlocker[]): string | null {
  const q = blockers.includes("QUORUM_UNCONFIGURED");
  const r = blockers.includes("VOTING_RULE_UNCONFIGURED");
  if (q && r) return "Can't be decided until the committee's quorum and voting rule are set.";
  if (q) return "Can't be decided until the committee's quorum is set.";
  if (r) return "Can't be decided until the committee's voting rule is set.";
  return null;
}

/// Where the organisation's time zone is set.
export const ORGANISATION_HREF = "/configuration/organisation";

/// Why a matter cannot be withdrawn from the agenda (6.10 follow-up).
export const WITHDRAW_FAULT_MESSAGE: Record<import("./matter").WithdrawFault, string> = {
  ALREADY_WITHDRAWN: "This matter is already withdrawn.",
  SITTING_STARTED: "The sitting has opened. A matter is withdrawn only before it opens; now it is deferred, with a note.",
  MATTER_DECIDED: "The matter has been decided, so it stays on the agenda.",
  MATTER_CITED: "A record cites this matter, so it stays on the agenda. Defer it at the sitting instead, with a note.",
  HAS_DEPENDENTS: "Another matter on the agenda waits on this one, so it stays. Withdraw that matter first, or defer this one at the sitting.",
  REASON_REQUIRED: "Say why it is withdrawn.",
};

// ------------------------------------------------------------ signed minutes (FR-CTE-004)

export type SignedMinutesState = "ATTACHED" | "OUTSTANDING" | "AFTER_MINUTING" | "CANCELLED";

/**
 * Where a sitting's signed minutes stand. They are attached once it is minuted (signing
 * follows minuting, so minuting does not wait on them); a minuted sitting without a live
 * signed copy shows it outstanding.
 */
export function signedMinutesState(status: string, liveSignedCopies: number): SignedMinutesState {
  if (status === "CANCELLED") return "CANCELLED";
  if (status !== "MINUTED") return "AFTER_MINUTING";
  return liveSignedCopies > 0 ? "ATTACHED" : "OUTSTANDING";
}

export const SIGNED_MINUTES_LABEL: Record<SignedMinutesState, string> = {
  ATTACHED: "Signed copy attached",
  OUTSTANDING: "Signed copy outstanding",
  AFTER_MINUTING: "Attached once the sitting is minuted",
  CANCELLED: "None: the sitting was cancelled",
};

export const SIGNED_MINUTES_TONE: Record<SignedMinutesState, "ok" | "warn" | "neutral"> = {
  ATTACHED: "ok",
  OUTSTANDING: "warn",
  AFTER_MINUTING: "neutral",
  CANCELLED: "neutral",
};

/// The gate card's line on a cited decision's sitting (FR-REQ-012).
export const GATE_MINUTES_NOTE: Record<SignedMinutesState, string> = {
  ATTACHED: "minutes recorded as text, signed copy attached",
  OUTSTANDING: "minutes recorded as text, signed copy outstanding",
  AFTER_MINUTING: "minutes recorded as text, signed copy attached once minuted",
  CANCELLED: "the sitting was cancelled",
};

/// The minutes card of a minuted sitting: frozen, but the signed copy is attached after minuting (FR-CTE-004).
export const MINUTED_CARD_NOTE = "Minuted. The sitting is frozen. The signed copy can still be attached.";

export const MINUTES_EDITOR_DESCRIPTION = "The minutes as text. The signed copy is attached to the sitting once it is minuted.";

// ------------------------------------------------------- waiting to be tabled (founder, 2026-10-05)

/// What an item waiting to be tabled is: the record kind its route approves, in English and Malay.
export const WAITING_KIND_WORDS = {
  REQUISITION: { en: "Requisition", ms: "Permohonan perolehan" },
  NAME: { en: "Name approval", ms: "Kelulusan nama" },
  APPOINTMENT: { en: "Appointment", ms: "Pelantikan" },
  VARIATION: { en: "Variation", ms: "Perubahan kerja" },
  CONTRACT: { en: "Contract matter", ms: "Perkara kontrak" },
} as const;
export type WaitingKind = keyof typeof WAITING_KIND_WORDS;

/// The sittings page's list, and the schedule drawer's proposal, in English and Malay. Screens show the English.
export const WAITING_WORDS = {
  title: { en: "Waiting to be tabled", ms: "Menunggu untuk dibentangkan" },
  subtitle: {
    en: "Approval routes whose current step is a committee's, with no matter tabled for it yet. Longest waiting first. Scheduling a sitting of the committee offers them.",
    ms: "Laluan kelulusan yang langkah semasanya milik jawatankuasa dan belum ada perkara dibentangkan untuknya. Paling lama menunggu dahulu. Menjadualkan sidang jawatankuasa itu akan mencadangkannya.",
  },
  emptyTitle: { en: "Nothing is waiting to be tabled", ms: "Tiada yang menunggu untuk dibentangkan" },
  emptyBody: {
    en: "A route appears here when it reaches a committee's step and no matter is tabled for it.",
    ms: "Laluan dipaparkan di sini apabila sampai ke langkah jawatankuasa dan belum ada perkara dibentangkan untuknya.",
  },
  search: { en: "Search waiting items", ms: "Cari item yang menunggu" },
  record: { en: "Record", ms: "Rekod" },
  kind: { en: "Kind", ms: "Jenis" },
  amount: { en: "Amount", ms: "Amaun" },
  act: { en: "Act needed", ms: "Tindakan diperlukan" },
  committee: { en: "Committee", ms: "Jawatankuasa" },
  waiting: { en: "Waiting", ms: "Menunggu" },
  days: { en: (n: number) => (n === 1 ? "1 day" : `${n} days`), ms: (n: number) => `${n} hari` },
  daysUnset: { en: "Not counted", ms: "Tidak dikira" },
  daysUnsetWhy: {
    en: "Days are counted on the organisation's day, and its time zone is not set.",
    ms: "Hari dikira mengikut hari organisasi, dan zon waktunya belum ditetapkan.",
  },
  since: { en: (day: string) => `since ${day}`, ms: (day: string) => `sejak ${day}` },
  how: { en: "How it is tabled", ms: "Cara dibentangkan" },
  tabledAtSitting: { en: "Offered when a sitting is scheduled", ms: "Dicadangkan apabila sidang dijadualkan" },
  tabledFromRecord: { en: "Tabled from its record", ms: "Dibentangkan daripada rekodnya" },
  open: { en: "Open the record", ms: "Buka rekod" },
} as const;

/// The schedule drawer (founder, 2026-10-05): the sitting's own number, and the waiting items it tables.
export const SCHEDULE_WORDS = {
  description: {
    en: "A sitting of one committee, on one date. What is waiting for the committee is tabled onto it as it is scheduled; anything else is tabled afterwards.",
    ms: "Sidang satu jawatankuasa, pada satu tarikh. Apa yang menunggu jawatankuasa itu dibentangkan ke dalamnya semasa dijadualkan; selebihnya dibentangkan kemudian.",
  },
  sittingNumber: { en: "Sitting number", ms: "Nombor sidang" },
  sittingNumberHint: {
    en: "Leave empty to draw the next number from the sittings series.",
    ms: "Biarkan kosong untuk mengambil nombor seterusnya daripada siri sidang.",
  },
  sittingNumberTyped: {
    en: "No numbering series for sittings is configured, so type the sitting's own number. This is not a record's reference.",
    ms: "Tiada siri penomboran untuk sidang dikonfigurasi, jadi taip nombor sidang ini sendiri. Ini bukan rujukan sesuatu rekod.",
  },
  sittingNumberRequired: {
    en: "No numbering series for sittings is configured, so type the sitting number.",
    ms: "Tiada siri penomboran untuk sidang dikonfigurasi, jadi taip nombor sidang.",
  },
  sittingNumberNoZone: {
    en: "The sittings series numbers by the organisation's day, and its time zone is not set. Set it under Configuration, Organisation, or type the sitting number.",
    ms: "Siri sidang bernombor mengikut hari organisasi, dan zon waktunya belum ditetapkan. Tetapkannya di bawah Konfigurasi, Organisasi, atau taip nombor sidang.",
  },
  sittingNumberSeriesInvalid: {
    en: "The sittings numbering series is not valid. Correct it under Configuration, Numbering, or type the sitting number.",
    ms: "Siri penomboran sidang tidak sah. Betulkannya di bawah Konfigurasi, Penomboran, atau taip nombor sidang.",
  },
  sittingNumberClash: {
    en: "This committee already has a sitting with that number.",
    ms: "Jawatankuasa ini sudah mempunyai sidang dengan nombor itu.",
  },
  items: { en: "Table at this sitting", ms: "Bentangkan dalam sidang ini" },
  itemsHint: {
    en: "Each is tabled with its record's own reference, subject, amount and act. Untick any that should wait for a later sitting.",
    ms: "Setiap satu dibentangkan dengan rujukan, perkara, amaun dan tindakan rekodnya sendiri. Nyahtanda mana-mana yang perlu menunggu sidang kemudian.",
  },
  itemsWaiting: { en: "Choose the committee to see what is waiting for it.", ms: "Pilih jawatankuasa untuk melihat apa yang menunggunya." },
  itemsNone: { en: "Nothing is waiting for this committee.", ms: "Tiada yang menunggu jawatankuasa ini." },
  tabledBy: { en: "Tabled by", ms: "Dibentangkan oleh" },
  tabledByHint: {
    en: "A holder of the committee's Secretariat office today, recorded on their behalf. Needed only where something is ticked.",
    ms: "Pemegang jawatan Urus Setia jawatankuasa hari ini, direkodkan bagi pihaknya. Diperlukan hanya jika ada yang ditanda.",
  },
  tabledByNone: { en: "Nobody holds the Secretariat office today", ms: "Tiada sesiapa memegang jawatan Urus Setia hari ini" },
  fromRecordNote: {
    en: "A variation or a contract matter waiting for this committee is tabled from its own record, which names the approval it decides on.",
    ms: "Perubahan kerja atau perkara kontrak yang menunggu jawatankuasa ini dibentangkan daripada rekodnya sendiri, yang menamakan kelulusan yang diputuskan.",
  },
  noLongerWaiting: {
    en: "Nothing was saved: one of the ticked items is no longer waiting for this committee. Reopen the drawer to see what is waiting now.",
    ms: "Tiada yang disimpan: salah satu item yang ditanda tidak lagi menunggu jawatankuasa ini. Buka semula laci untuk melihat apa yang menunggu sekarang.",
  },
  itemRefused: {
    en: (what: string, why: string) => `Nothing was saved: ${what} could not be tabled. ${why}`,
    ms: (what: string, why: string) => `Tiada yang disimpan: ${what} tidak dapat dibentangkan. ${why}`,
  },
} as const;

/// The outcome flowing back to the record (founder, 2026-10-05): the History's words, and the sitting's note.
export const AUTO_LINK_WORDS = {
  /// The value of the cited step's `linkedHow` field in its History.
  linked: {
    en: "Automatically, when the sitting recorded the committee's outcome",
    ms: "Secara automatik, apabila sidang merekodkan keputusan jawatankuasa",
  },
  /// The value of the matter's `linkedToApproval` field where the link was refused.
  notLinked: { en: "Not linked automatically", ms: "Tidak dipautkan secara automatik" },
  noteTitle: { en: "Not linked to the approval automatically", ms: "Tidak dipautkan kepada kelulusan secara automatik" },
  note: {
    en: (why: string) => `${why} The outcome is recorded. Cite the decision from the record once it can be.`,
    ms: (why: string) => `${why} Keputusan telah direkodkan. Rujuk keputusan ini daripada rekod apabila boleh.`,
  },
  noStep: {
    en: "The record's approval has no step waiting for this committee.",
    ms: "Kelulusan rekod ini tiada langkah yang menunggu jawatankuasa ini.",
  },
  linkedNote: { en: "Linked to the record's approval when the outcome was recorded.", ms: "Dipautkan kepada kelulusan rekod apabila keputusan direkodkan." },
} as const;
