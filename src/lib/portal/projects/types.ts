import type { Finding } from "@/lib/window/types";

/**
 * What the supplier's My Projects workspace (Phase 4e) is made of: the tabs, the kinds of submission a contractor sends, the findings its acts return, and the refusal a
 * store throws. No rule is here (they are in `visibility.ts`, `submission.ts`, `diary.ts`, `certificates.ts` and `announcements.ts`). Nothing names a supplier: the supplier is
 * the signed-in session's, and the stores read only the contracts whose award names it.
 */

/// Phase 2 close-out stage B: "defects", shown once the practical completion certificate is issued.
export const PROJECT_TABS = ["overview", "programme", "diary", "payments", "certificates", "submissions", "defects"] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];
export const isProjectTab = (s: string | undefined): s is ProjectTab => (PROJECT_TABS as readonly string[]).includes(s ?? "");

/// The kinds of submission (the schema's enum, mirrored so the rules stay free of the client; `projects.test.ts` holds the two equal).
export const SUBMISSION_KINDS = ["WORK_PROGRAMME", "INTERIM_CLAIM", "MATERIALS_ON_SITE", "DELAY_NOTICE", "DEFECTS_RECTIFIED", "STATUTORY_DECLARATION", "SUPPLY_CLAIM"] as const;
export type SubmissionKind = (typeof SUBMISSION_KINDS)[number];
export const isSubmissionKind = (s: unknown): s is SubmissionKind => typeof s === "string" && (SUBMISSION_KINDS as readonly string[]).includes(s);

export const SUBMISSION_OUTCOMES = ["TAKEN_UP", "RETURNED"] as const;
export type SubmissionOutcome = (typeof SUBMISSION_OUTCOMES)[number];

export type ProjectFault =
  // Whether the supplier may open the contract at all, and whether it is in a state to act on.
  | "NOT_FOUND"
  | "CONTRACT_NOT_ACTIVE"
  | "DAY_NOT_KNOWN"
  // A submission.
  | "TITLE_REQUIRED"
  | "TITLE_TOO_LONG"
  | "BODY_REQUIRED"
  | "BODY_TOO_LONG"
  | "AMOUNT_REQUIRED"
  | "AMOUNT_FORMAT"
  | "AMOUNT_NOT_ON_KIND"
  | "DAY_REQUIRED"
  | "DAY_FORMAT"
  | "DAY_IN_FUTURE"
  | "DAY_NOT_ON_KIND"
  | "LINES_REQUIRED"
  | "LINES_NOT_ON_KIND"
  | "LINE_INCOMPLETE"
  | "LINE_VALUE_FORMAT"
  | "TOO_MANY_LINES"
  | "PASSWORD_REQUIRED"
  | "TOO_MANY_SUBMISSIONS"
  // Who may bind the contractor (4e review fix): the organisation has not decided whether a contractor signs from its portal account, or has decided it signs on paper only.
  | "PORTAL_SIGNING_NOT_SET"
  | "PORTAL_SIGNING_OFF"
  // Who in the company may sign (ruling on 1928(3)): this contact is not marked by an officer as authorised to sign for the contractor.
  | "SIGNER_NOT_AUTHORISED_NOT_SET"
  | "SIGNER_NOT_AUTHORISED"
  // The supplier's standing bars the act (ruling on 1875(3)); the words are in the finding's data.
  | "SUPPLIER_STANDING_BARS"
  // The officer's answer.
  | "ALREADY_ANSWERED"
  | "NOTE_REQUIRED"
  | "NOTE_TOO_LONG"
  // The diary.
  | "ENTRY_NOT_FOUND"
  | "ALREADY_ATTESTED"
  | "ALREADY_DISPUTED"
  | "DISAGREEMENT_REQUIRED"
  | "DISAGREEMENT_TOO_LONG"
  | "ENTRY_IN_FUTURE"
  // A certificate's contractor block.
  | "CERTIFICATE_NOT_FOUND"
  | "NOT_SIGNING"
  | "NO_CONTRACTOR_BLOCK"
  | "BLOCK_NOT_NEXT"
  | "BLOCK_SIGNED"
  | "BLOCK_IS_LAST"
  | "REFUSAL_NOT_ALLOWED"
  | "REFUSAL_NOTE_REQUIRED"
  | "REFUSAL_NOTE_TOO_LONG"
  // Phase 2 close-out stage B: a defect line marked rectified.
  | "DEFECT_NOT_FOUND"
  | "DEFECT_NOT_OPEN"
  | "EVIDENCE_NOT_YOURS";

export type ProjectFinding = Finding<ProjectFault>;

/// Raised from inside an act's transaction so that nothing is written. `status` is what a handler answers with: 404 for something that is not the supplier's to see, 409 for a change that came first,
/// 429 for one sent past the bound on how many an account sends in a window.
export class ProjectRefused extends Error {
  constructor(
    readonly faults: readonly ProjectFinding[],
    readonly status: 404 | 409 | 422 | 429 = 422,
  ) {
    super(faults.map((f) => f.code).join(", "));
    this.name = "ProjectRefused";
  }
}

export const TITLE_MAX = 200;
export const BODY_MAX = 8000;
export const NOTE_MAX = 2000;
export const DISAGREEMENT_MAX = 4000;
export const LINES_MAX = 60;
