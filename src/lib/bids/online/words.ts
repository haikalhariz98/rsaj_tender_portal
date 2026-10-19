/**
 * What the supplier is told when an online submission, a withdrawal or a part's upload is refused, or warned (ADR 0036 D5 to D8, rulings 20b, 20e, 20h, 20m). One
 * place: no component restates them. Every refusal says which rule refused it, in words, never a code.
 *
 * In English and Malay, through the portal's one `Words` shape (ruling 20ab, NFR-LNG-001; log 1936: no second pattern). The Malay says no more than the English:
 * the same facts and the same limits. Where the portal already words a refusal (`portal/bids/words.ts`), its Malay is reused. A bid is "bida", as the portal
 * calls it (Bida Saya).
 */

import { w, type Words } from "@/lib/contract/labels";
import { MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE, MAX_SUBMISSIONS_PER_SUPPLIER_PER_EXERCISE } from "@/lib/portal/bids/limits";

import type { PartUploadFault, SubmissionWarning, SubmitFault, WithdrawFault } from "./types";

const PAPER_ONLY = w("Bids on this exercise are handed in on paper, not through the portal.");
const NOT_ALLOWED = w(
  "This copy of the system does not take online bids at the moment. Contact the procurement office.",
);
const NOT_PUBLISHED = w("The exercise is not open for bids.");
// The portal's own words for the invitee check (`portal/bids/words.ts`, NOT_INVITED), so the purchase and the door say the same (20m).
const NOT_INVITED = w("This exercise invites named suppliers only, and your company is not on its list.");

const STAMP_STALE = w(
  "Your submission waited too long behind other work on this exercise, so it was not taken and nothing was recorded. Submit again: the time stamped when you submit again decides whether it is late.",
);
const NOT_TAKEN = w("Your submission was not taken and nothing was recorded. Try again.");

export const SUBMIT_FAULT_WORDS: Readonly<Record<SubmitFault, Words>> = {
  CHANNEL_NOT_ONLINE: PAPER_ONLY,
  ONLINE_NOT_SET: w(
    "Online submission of bids is not set for the organisation, so bids are not taken through the portal.",
  ),
  ONLINE_NOT_ALLOWED: NOT_ALLOWED,
  NOT_PUBLISHED,
  CANCELLED: w("The exercise was cancelled, so no bid is taken."),
  KEY_NOT_LIVE: w(
    "The exercise's sealing key is not ready, so no bid can be sealed yet. Contact the procurement office.",
  ),
  NO_LIVE_SALE: w(
    "Your company holds no purchase of the tender documents that stands, so it cannot submit a bid.",
  ),
  NOT_ON_INVITEE_LIST: NOT_INVITED,
  LIVE_BID_HELD: w(
    "Your company already has a bid standing on this exercise, so a second bid is not taken. Up to the closing, replace it to change it.",
  ),
  REPLACE_AFTER_CLOSING: w("The closing has passed, so a bid can no longer be replaced."),
  NOTHING_TO_REPLACE: w("The submission named is not one of your company's bids that still stands."),
  REPLACE_KIND_CHANGED: w(
    "A bid is replaced by a bid, and an alternative by an alternative. To add an alternative, submit it as an alternative.",
  ),
  ALTERNATIVES_NOT_STATED: w(
    "Whether alternative bids are permitted is not stated for this exercise, so no alternative is taken. Contact the procurement office.",
  ),
  PARENT_NOT_YOUR_LIVE_BID: w(
    "An alternative may name one of your company's own bids that still stands, and only an alternative names one.",
  ),
  PARENT_NOT_A_BID: w(
    "The submission named is an alternative. An alternative goes with a bid, not with another alternative.",
  ),
  LATE_CLOSED: w(
    "The opening has started, so no further bid is taken: a late bid is taken only until the opening starts.",
  ),
  PRICE_INVALID: w(
    "Write the price as an amount in ringgit and sen, above zero, with at most two decimal places and no commas.",
  ),
  PERIOD_INVALID: w("Write the completion period as a whole number, at least 1."),
  UNIT_NOT_SET: w("Choose the unit of the completion period."),
  FILE_NOT_YOURS: w("A file named is not one your company uploaded on this exercise."),
  FILE_NOT_DRAFT: w(
    "A file named has already been submitted or discarded. Each file belongs to one submission: upload it again.",
  ),
  PART_UNKNOWN: w(
    "A file was uploaded for a part the bidder does not return on this exercise.",
  ),
  DUPLICATE_PART: w(
    "Two files were named for one part. Each part takes one file: remove one of them, then submit again. Nothing was submitted.",
  ),
  NO_FILES: w("Upload at least one part before submitting."),
  TOO_MANY_SUBMISSIONS: w(
    `Your company has made ${MAX_SUBMISSIONS_PER_SUPPLIER_PER_EXERCISE} submissions on this exercise, the most taken. Nothing new was submitted, and your last submission stands as it is.`,
  ),
  STAMP_STALE,
  NOT_TAKEN,
};

export const WITHDRAW_FAULT_WORDS: Readonly<Record<WithdrawFault, Words>> = {
  NOT_YOURS: w("That bid is not one of your company's."),
  NOT_LIVE: w("That bid no longer stands: it was replaced, withdrawn or opened."),
  AFTER_CLOSING: w("The closing has passed, so a bid can no longer be withdrawn."),
  CANCELLED: w("The exercise was cancelled."),
  ALTERNATIVE_NOT_LINKED: w(
    "Only your own alternatives linked to this bid can be withdrawn with it.",
  ),
  STAMP_STALE: w(
    "Your withdrawal waited too long behind other work on this exercise, so it was not taken and nothing was recorded. Withdraw again: the time stamped when you withdraw again decides whether it is in time.",
  ),
  NOT_TAKEN: w("Your withdrawal was not taken and nothing was recorded. Try again."),
};

export const PART_UPLOAD_FAULT_WORDS: Readonly<Record<PartUploadFault, Words>> = {
  CHANNEL_NOT_ONLINE: PAPER_ONLY,
  ONLINE_NOT_ALLOWED: NOT_ALLOWED,
  NOT_PUBLISHED,
  KEY_NOT_LIVE: w(
    "The exercise's sealing key is not ready, so no file can be sealed yet. Contact the procurement office.",
  ),
  FINGERPRINT_MISMATCH: w(
    "The exercise's sealing key is not the one published, so nothing was uploaded. Contact the procurement office.",
  ),
  NO_LIVE_SALE: w(
    "Your company holds no purchase of the tender documents that stands, so it cannot upload a bid.",
  ),
  NOT_ON_INVITEE_LIST: NOT_INVITED,
  LATE_CLOSED: w("The opening has started, so no further file is taken."),
  PART_UNKNOWN: w("That part is not one of this exercise's parts."),
  PART_NOT_RETURNED: w("That part is not one a bidder returns."),
  TYPES_NOT_SET: w("The file types for that part are not set yet. Contact the procurement office."),
  TYPE_NOT_ACCEPTED: w(
    "That kind of file is not accepted for this part. The type is read from the file itself, not from its name.",
  ),
  OFFICE_REFUSED: w(
    "That Office file holds macros, embedded objects or a link to a template outside it, is protected by a password, or cannot be read with certainty, so it is not accepted.",
  ),
  SIZE_NOT_SET: w("The largest file for that part is not set yet. Contact the procurement office."),
  TOO_LARGE: w("The file is larger than this part allows."),
  EMPTY: w("The file is empty."),
  BODY_TOO_SLOW: w("The file arrived too slowly and was not taken. Try again on a steadier connection."),
  HASH_MISMATCH: w(
    "The file the server received is not the file your browser read, so it was not taken. Try again.",
  ),
  THREAT: w("The file was found to hold a threat, so it was not taken."),
  SCAN_ERROR: w("The file could not be scanned for malware, so it was not taken. Try again later."),
  TOO_MANY_DRAFT_FILES: w(
    `Your company holds ${MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE} uploaded parts not yet submitted on this exercise, the most held at once. Discard one, or submit, before uploading another.`,
  ),
};

export function submissionWarningWords(warning: SubmissionWarning): Words {
  switch (warning.code) {
    case "MANDATORY_PART_MISSING":
      return w(
        `No file was uploaded for ${warning.label ?? "a mandatory part"}. The bid is taken without it, and the opening will record it as missing.`,
      );
    case "ALTERNATIVE_NOT_CONSIDERED":
      return w(
        "This exercise does not permit alternative bids. An alternative is taken and recorded, but it will be marked not considered.",
      );
    case "REPLACE_REUPLOADS_ALL":
      return w(
        "A replacement takes only the files uploaded for it: upload every part again. The bid it replaces is not opened.",
      );
  }
}

/// The upload's BUSY answer (20e): the deployment's limit on uploads at once, or one upload of the company's own still in flight.
export const UPLOAD_BUSY_WORDS: Words = w(
  "The portal is busy with other uploads. Try again in a moment. Only the time your bid is submitted decides whether it is late, not the time of an upload.",
);

/// The answers of the part upload and discard routes that are not a rule's refusal (step 9): the rate limit, a request the portal could not read, nothing found. Rate
/// refusals say that only the submission's stamp decides lateness (20e).
export type PartRouteNotice = "RATE_LIMITED" | "NO_LENGTH" | "UNREADABLE" | "FIELDS_DISAGREE" | "NOT_FOUND" | "STORE_CLOSED" | "NOT_TAKEN" | "FILE_NOT_DRAFT";
export const PART_ROUTE_WORDS: Readonly<Record<PartRouteNotice, Words>> = {
  RATE_LIMITED: w(
    "You have uploaded a great many files in the last minute, so this one was not taken. Wait a minute and try again. Only the time your bid is submitted decides whether it is late, not the time of an upload.",
  ),
  NO_LENGTH: w("The upload did not say how large it is, so it was not read."),
  UNREADABLE: w("That upload could not be read. Nothing was taken. Try again."),
  FIELDS_DISAGREE: w("The page did not say clearly which exercise and which part the file is for, so it was not taken. Reload the page and try again."),
  NOT_FOUND: w("That is not something you can open."),
  STORE_CLOSED: w("Uploads are closed: the portal's file store is not set up. Contact the procurement office."),
  NOT_TAKEN: w("The file was not taken. Nothing was recorded. Try again."),
  FILE_NOT_DRAFT: w("That file is no longer waiting to be submitted, so it cannot be discarded."),
};

/// The answers of the submit and withdraw routes that are not a rule's refusal (step 10): the rate limit, a request the portal could not read, nothing found, and the password asked
/// again. The password's answers say nothing of the account beyond what the portal's sign-in already says. Rate refusals say that only the stamp decides lateness (20e).
export type ActRouteNotice =
  | "SUBMIT_RATE_LIMITED" | "WITHDRAW_RATE_LIMITED" | "UNREADABLE" | "NOT_FOUND"
  | "WRONG_PASSWORD" | "LOCKED" | "THROTTLED" | "ACT_CLOSED";
export const ACT_ROUTE_WORDS: Readonly<Record<ActRouteNotice, Words>> = {
  SUBMIT_RATE_LIMITED: w(
    "You have tried to submit a great many times in the last minute, so this one was not taken. Wait a minute and try again. The time stamped when your submission is accepted decides whether it is late.",
  ),
  WITHDRAW_RATE_LIMITED: w(
    "You have tried to withdraw a great many times in the last minute, so this one was not taken. Wait a minute and try again. The time stamped when your withdrawal is accepted decides whether it is in time.",
  ),
  UNREADABLE: w("That request could not be read. Nothing was done. Reload the page and try again."),
  NOT_FOUND: w("That is not something you can open."),
  WRONG_PASSWORD: w("That password is not right. Nothing was done."),
  LOCKED: w("This account is locked after too many wrong passwords. Try again later."),
  THROTTLED: w("Too many attempts just now. Wait a few minutes and try again."),
  ACT_CLOSED: w(
    "This cannot be done at the moment: the procurement office has not finished setting up supplier sign-in. Tell the procurement office.",
  ),
};
