/**
 * What the supplier is told when an online submission, a withdrawal or a part's upload is refused, or warned (ADR 0036 D5 to D8, rulings 20b, 20e, 20h, 20m). One
 * place: no component restates them. Every refusal says which rule refused it, in words, never a code.
 */

import { MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE, MAX_SUBMISSIONS_PER_SUPPLIER_PER_EXERCISE } from "@/lib/portal/bids/limits";

import type { PartUploadFault, SubmissionWarning, SubmitFault, WithdrawFault } from "./types";

export const SUBMIT_FAULT_WORDS: Readonly<Record<SubmitFault, string>> = {
  CHANNEL_NOT_ONLINE: "Bids on this exercise are handed in on paper, not through the portal.",
  ONLINE_NOT_SET: "Online submission of bids is not set for the organisation, so bids are not taken through the portal.",
  ONLINE_NOT_ALLOWED: "This copy of the system does not take online bids at the moment. Contact the procurement office.",
  NOT_PUBLISHED: "The exercise is not open for bids.",
  CANCELLED: "The exercise was cancelled, so no bid is taken.",
  KEY_NOT_LIVE: "The exercise's sealing key is not ready, so no bid can be sealed yet. Contact the procurement office.",
  NO_LIVE_SALE: "Your company holds no purchase of the tender documents that stands, so it cannot submit a bid.",
  NOT_ON_INVITEE_LIST: "This exercise invites named suppliers only, and your company is not on its list.",
  LIVE_BID_HELD: "Your company already has a bid standing on this exercise. To change it, replace it; a second bid is not taken.",
  REPLACE_AFTER_CLOSING: "The closing has passed, so a bid can no longer be replaced.",
  NOTHING_TO_REPLACE: "The submission named is not one of your company's bids that still stands.",
  ALTERNATIVES_NOT_STATED: "Whether alternative bids are permitted is not stated for this exercise, so no alternative is taken. Contact the procurement office.",
  PARENT_NOT_YOUR_LIVE_BID: "An alternative may name one of your company's own bids that still stands, and only an alternative names one.",
  LATE_CLOSED: "The opening has started, so no further bid is taken: a late bid is taken only until the opening starts.",
  PRICE_INVALID: "Write the price as an amount in ringgit and sen, above zero, with at most two decimal places and no commas.",
  PERIOD_INVALID: "Write the completion period as a whole number, at least 1.",
  UNIT_NOT_SET: "Choose the unit of the completion period.",
  FILE_NOT_YOURS: "A file named is not one your company uploaded on this exercise.",
  FILE_NOT_DRAFT: "A file named has already been submitted or discarded. Each file belongs to one submission: upload it again.",
  PART_UNKNOWN: "A file was uploaded for a part the bidder does not return on this exercise.",
  NO_FILES: "Upload at least one part before submitting.",
  TOO_MANY_SUBMISSIONS: `Your company has made ${MAX_SUBMISSIONS_PER_SUPPLIER_PER_EXERCISE} submissions on this exercise, the most taken. Nothing new was submitted, and your last submission stands as it is.`,
};

export const WITHDRAW_FAULT_WORDS: Readonly<Record<WithdrawFault, string>> = {
  NOT_YOURS: "That bid is not one of your company's.",
  NOT_LIVE: "That bid no longer stands: it was replaced, withdrawn or opened.",
  AFTER_CLOSING: "The closing has passed, so a bid can no longer be withdrawn.",
  CANCELLED: "The exercise was cancelled.",
  ALTERNATIVE_NOT_LINKED: "Only your own alternatives linked to this bid can be withdrawn with it.",
};

export const PART_UPLOAD_FAULT_WORDS: Readonly<Record<PartUploadFault, string>> = {
  CHANNEL_NOT_ONLINE: "Bids on this exercise are handed in on paper, not through the portal.",
  ONLINE_NOT_ALLOWED: "This copy of the system does not take online bids at the moment. Contact the procurement office.",
  NOT_PUBLISHED: "The exercise is not open for bids.",
  KEY_NOT_LIVE: "The exercise's sealing key is not ready, so no file can be sealed yet. Contact the procurement office.",
  FINGERPRINT_MISMATCH: "The exercise's sealing key is not the one published, so nothing was uploaded. Contact the procurement office.",
  NO_LIVE_SALE: "Your company holds no purchase of the tender documents that stands, so it cannot upload a bid.",
  NOT_ON_INVITEE_LIST: "This exercise invites named suppliers only, and your company is not on its list.",
  LATE_CLOSED: "The opening has started, so no further file is taken.",
  PART_UNKNOWN: "That part is not one of this exercise's parts.",
  PART_NOT_RETURNED: "That part is not one a bidder returns.",
  TYPES_NOT_SET: "The file types for that part are not set yet. Contact the procurement office.",
  TYPE_NOT_ACCEPTED: "That kind of file is not accepted for this part. The type is read from the file itself, not from its name.",
  OFFICE_REFUSED: "That Office file holds macros, embedded objects or a link to a template outside it, is protected by a password, or cannot be read with certainty, so it is not accepted.",
  SIZE_NOT_SET: "The largest file for that part is not set yet. Contact the procurement office.",
  TOO_LARGE: "The file is larger than this part allows.",
  EMPTY: "The file is empty.",
  BODY_TOO_SLOW: "The file arrived too slowly and was not taken. Try again on a steadier connection.",
  HASH_MISMATCH: "The file the server received is not the file your browser read, so it was not taken. Try again.",
  THREAT: "The file was found to hold a threat, so it was not taken.",
  SCAN_ERROR: "The file could not be scanned for malware, so it was not taken. Try again later.",
  TOO_MANY_DRAFT_FILES: `Your company holds ${MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE} uploaded parts not yet submitted on this exercise, the most held at once. Discard one, or submit, before uploading another.`,
};

export function submissionWarningWords(w: SubmissionWarning): string {
  switch (w.code) {
    case "MANDATORY_PART_MISSING":
      return `No file was uploaded for ${w.label ?? "a mandatory part"}. The bid is taken without it, and the opening will record it as missing.`;
    case "ALTERNATIVE_NOT_CONSIDERED":
      return "This exercise does not permit alternative bids. An alternative is taken and recorded, but it will be marked not considered.";
    case "REPLACE_REUPLOADS_ALL":
      return "A replacement takes only the files uploaded for it: upload every part again. The bid it replaces is not opened.";
  }
}

/// The upload's BUSY answer (20e): the deployment's limit on uploads at once, or one upload of the company's own still in flight.
export const UPLOAD_BUSY_WORDS = "The portal is busy with other uploads. Try again in a moment. Only the time your bid is submitted decides whether it is late, not the time of an upload.";
