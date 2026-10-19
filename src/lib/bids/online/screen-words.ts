/**
 * Every word on the supplier's screens for online bids (SR-13, ADR 0036 D5 to D8, D13; rulings 20ab, 20j, 20s; build plan step 11). One place: no component writes a sentence of its
 * own. All of it is the portal's `Words`, English and Malay, the Malay saying no more than the English (20ab), reviewed on the customer's side before LIVE (NFR-LNG-001). No
 * value calls a receipt or a bid "signed", "proof" or "verified", in either language (20j, 20s): `words.test.ts` scans this module's values and its string literals.
 * The sealing's honest limits (D13) are said in plain words, once, here.
 */

import { w, type Words } from "@/lib/contract/labels";

export const SCREEN_WORDS = {
  // ---- the exercise's tab and the submit page
  tab: w("Your bid"),
  submitTitle: w("Submit your bid"),
  submitSubtitle: w(
    "Upload each part, state your price and completion period, and enter your password. Your files are sealed as they arrive and stay sealed until the opening.",
  ),
  backToExercise: w("Back to the exercise"),
  openSubmitPage: w("Submit or replace a bid"),
  closes: w("Closes"),
  notSet: w("Not set"),
  sendingClosed: w(
    "Sending is closed: the person who runs the portal has not set its form key. Nothing can be sent until they do.",
  ),
  pastClosingTitle: w("The closing time has passed"),
  closedTitle: w("Bids cannot be submitted now"),
  paperOnlyTitle: w("Bids are handed in on paper"),

  // ---- what sealing does, and does not (D13)
  limitsTitle: w("How your bid is protected"),
  limits: w(
    "Each file is sealed as it arrives and is kept only in sealed form. It can be opened only by all the opening officers named for this exercise, together, at the opening. The portal reads your files and your password at the moment you send them, so the portal itself has to be trusted: sealing protects what is stored, not a portal that has been compromised. The closing time is kept by the portal's clock, not by the sealing.",
  ),

  // ---- a key changed under a waiting draft (step 8's review)
  discardedTitle: w("Files you had uploaded can no longer be used"),
  discardedOne: w(
    "The procurement office changed this exercise's sealing key after you uploaded a file that you had not yet submitted. A file is sealed to the key that was live when it arrived, so it cannot be used with the new key. Upload it again before you submit.",
  ),
  discardedSealedTo: w("Sealed to the key with fingerprint"),
  discardedNow: w("The key now live has fingerprint"),
  discardedParts: w("Files discarded"),

  // ---- the key's fingerprint and its history (the opportunity page)
  keyTitle: w("The sealing key for this exercise"),
  keySubtitle: w(
    "Your bid is sealed to this key. The fingerprint is printed on every receipt, so compare it with the one you are shown here.",
  ),
  keyLive: w("Fingerprint now"),
  keyNone: w("No sealing key is published for this exercise yet."),
  keyHistory: w("Changes of the key"),
  keyNoChanges: w("The key has not been changed since it was published."),
  keyWhen: w("When"),
  keyFrom: w("From fingerprint"),
  keyTo: w("To fingerprint"),

  // ---- the parts
  partsTitle: w("Parts of your bid"),
  partsSubtitle: w(
    "Each part takes one file. The type is read from the file itself, not from its name.",
  ),
  partRequired: w("Required"),
  partOptional: w("Optional"),
  partAccepts: w("Accepts"),
  partLargest: w("Largest file"),
  partNoTypes: w("The file types for this part are not set yet."),
  partNoSize: w("The largest file for this part is not set yet."),
  partNone: w("This exercise has no part for a bidder to return."),
  partNotUploaded: w("No file uploaded"),
  partUploaded: w("Uploaded"),
  partChoose: w("Choose a file"),
  partChooseAnother: w("Choose another file"),
  partRemove: w("Remove"),
  partHashing: w("Reading the file in your browser…"),
  partSending: w("Sending and sealing…"),
  partRemoved: w("The file was removed."),
  partFileName: w("File"),
  partDraftNote: w(
    "A file you uploaded earlier. Its name is kept sealed, so only the time is shown here.",
  ),

  // ---- what is being submitted
  kindTitle: w("What you are submitting"),
  kindBid: w("A bid"),
  kindAlternative: w("An alternative bid"),
  kindReplace: w("A replacement for a submission of mine"),
  kindReplacing: w("Replace which submission"),
  kindParent: w("The bid this alternative goes with"),
  kindNoParent: w("Not tied to a bid"),
  replaceNote: w(
    "A replacement takes only the files you upload for it, so upload every part again. The submission it replaces is not opened.",
  ),
  alternativesNotConsideredTitle: w("This exercise does not permit alternative bids"),
  alternativesNotConsidered: w(
    "An alternative is still taken and recorded, but it will be marked as not considered. Think before you submit one.",
  ),
  alternativesNotStated: w("Whether alternative bids are permitted is not stated for this exercise."),

  // ---- declared fields
  declareTitle: w("What you declare"),
  declareSubtitle: w(
    "These two figures are sealed with your files and are read at the opening.",
  ),
  price: w("Price"),
  priceHint: w("The figure only, with up to two decimal places and no separators."),
  period: w("Completion period"),
  periodHint: w("A whole number from 1."),
  unit: w("Counted in"),
  unitDays: w("Days"),
  unitWeeks: w("Weeks"),
  unitMonths: w("Months"),

  // ---- the act
  passwordTitle: w("Your password"),
  password: w("Password"),
  passwordHint: w("Entered again for this act. Nothing is submitted without it."),
  submitButton: w("Submit bid"),
  replaceButton: w("Submit replacement"),
  submitting: w("Submitting…"),
  stampNote: w(
    "The time stamped when the portal accepts your submission decides whether it is late, not the time of an upload.",
  ),
  warningsTitle: w("Please note"),
  notReached: w(
    "That did not reach the portal, so nothing is known to have been done. Check your connection, look at Your bid for a new receipt, and try again only if there is none.",
  ),
  signedOut: w("You are no longer logged in. Log in again, then try again."),
  secondTab: w("The page is out of date. Reload it and try again."),

  // ---- the receipt
  receiptTitle: w("Your receipt"),
  receiptSubtitle: w("Print it or save it, and keep it until the opening."),
  receiptNumber: w("Your submission number"),
  receiptStamp: w("Stamped by the portal"),
  receiptOnTime: w("Received in time"),
  receiptLate: w("Received after the closing"),
  receiptLateNote: w(
    "A late submission is kept, sealed, and goes to the committee, which decides whether to admit it.",
  ),
  receiptKey: w("Sealing key fingerprint"),
  receiptDigest: w("Receipt digest"),
  receiptAlternativeNot: w("Marked as not considered"),
  receiptPrint: w("Print the receipt"),
  receiptExercise: w("Exercise"),
  receiptSupplier: w("Company"),
  receiptKind: w("Kind"),
  receiptAgain: w("Back to your bid"),

  // ---- the Your bid tab
  listTitle: w("Your submissions"),
  listSubtitle: w(
    "Each submission has its own number, counted from your first. Only the standing ones are opened.",
  ),
  listEmptyTitle: w("You have not submitted a bid"),
  listEmptyBody: w("When you submit one, its receipt is kept here."),
  submission: w("Submission"),
  colNumber: w("No."),
  colKind: w("Kind"),
  colStamp: w("Stamped"),
  colStatus: w("Status"),
  colDigest: w("Receipt digest"),
  colOpening: w("At the opening"),
  statusSubmitted: w("Standing"),
  statusReplaced: w("Replaced"),
  statusWithdrawn: w("Withdrawn"),
  statusOpened: w("Opened"),
  late: w("Late"),
  inTime: w("In time"),
  tiedTo: w("Goes with submission"),
  showReceipt: w("Show the receipt"),
  hideReceipt: w("Hide the receipt"),
  notConsidered: w("Not considered"),
  rollMissing: w(
    "The opening has started, but the list of bids it froze is not recorded here yet, so nothing is said of this submission. Check again later.",
  ),

  // ---- withdrawing
  withdraw: w("Withdraw"),
  withdrawTitle: w("Withdraw this submission"),
  withdrawBody: w(
    "A withdrawn submission is not opened. This cannot be undone, but you may submit again before the closing.",
  ),
  withdrawAlternatives: w("Alternatives that go with it"),
  withdrawAlternativesNote: w(
    "Tick the ones to withdraw as well. An alternative you leave unticked stays, and is no longer tied to this bid.",
  ),
  withdrawButton: w("Withdraw submission"),
  withdrawing: w("Withdrawing…"),
  withdrawDone: w("The submission was withdrawn."),
  withdrawLinksCleared: w("Alternatives left standing were untied from it."),
  cancel: w("Cancel"),
  close: w("Close"),
  closedForWithdraw: w("Withdrawing is open until the closing time."),

  // ---- demonstration
  demonstrationNote: w(
    "Bids made here are for trying the system out. They are not tenders and will not be awarded.",
  ),
} as const satisfies Record<string, Words>;

export type ScreenWord = keyof typeof SCREEN_WORDS;

/** A bid's status, in words. */
export const BID_STATUS_WORDS: Readonly<Record<"SUBMITTED" | "REPLACED" | "WITHDRAWN" | "OPENED", Words>> = {
  SUBMITTED: SCREEN_WORDS.statusSubmitted,
  REPLACED: SCREEN_WORDS.statusReplaced,
  WITHDRAWN: SCREEN_WORDS.statusWithdrawn,
  OPENED: SCREEN_WORDS.statusOpened,
};

export const BID_KIND_WORDS: Readonly<Record<"BID" | "ALTERNATIVE", Words>> = { BID: SCREEN_WORDS.kindBid, ALTERNATIVE: SCREEN_WORDS.kindAlternative };

export const UNIT_WORDS: Readonly<Record<"DAYS" | "WEEKS" | "MONTHS", Words>> = { DAYS: SCREEN_WORDS.unitDays, WEEKS: SCREEN_WORDS.unitWeeks, MONTHS: SCREEN_WORDS.unitMonths };

/// A file format, as a supplier reads it. Media types are configuration keys and never reach a screen (AGENTS.md rule 5).
const TYPE_WORDS: Readonly<Record<string, Words>> = {
  "application/pdf": w("PDF"),
  "image/png": w("PNG image"),
  "image/jpeg": w("JPEG image"),
  "image/tiff": w("TIFF image"),
  "text/csv": w("CSV file"),
};
const UNKNOWN_TYPE = w("a type the portal does not recognise");

/// The accepted types of a part, listed. Empty when none is set: the screen then says the types are not set, never an empty list.
export function typesWords(types: readonly string[]): Words {
  const words = types.map((t) => TYPE_WORDS[t] ?? UNKNOWN_TYPE);
  return w(words.map((x) => x.en).join(", "));
}
