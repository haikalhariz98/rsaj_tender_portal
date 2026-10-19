/**
 * The opening roll, and what My Bids says of a supplier's own bid from the opening's start (ADR 0036 D10, H2, rulings 20s, 25; build plan §1.3). Pure.
 *
 * `startOpening` freezes the roll: every standing submission's sequence, receipt digest and late flag, and a digest of the roll itself. From then on My Bids shows each
 * supplier the receipt digest that was listed or opened, in full, and asks it to compare that with the receipt it printed or saved when it submitted: a server
 * sentence comparing two server rows would prove nothing (S11). The words come from one function; no component restates them. They give no verdict and send no
 * notice, and never say "verified", "signed" or "proof" (20j, 20s). Ruling 25's "Opened; the result follows the evaluation" stays.
 */

import { createHash } from "node:crypto";

import { w, type Words } from "@/lib/contract/labels";

import type { OnlineBidStatus } from "./types";

export const ROLL_DIGEST_VERSION = "perolehan-roll-v1";
const STANDING: readonly OnlineBidStatus[] = ["SUBMITTED", "OPENED"];

// src/lib/bids/online/roll.ts (H2)
export function receiptRoll(rows: { sequence: number; receiptDigest: string; late: boolean; status: OnlineBidStatus }[]): { v: 1; entries: { sequence: number; receiptDigest: string; late: boolean }[]; rollDigest: string } {
  const entries = rows
    .filter((r) => STANDING.includes(r.status))
    .sort((a, b) => a.sequence - b.sequence)
    .map((r) => ({ sequence: r.sequence, receiptDigest: r.receiptDigest, late: r.late }));
  const rollDigest = createHash("sha256")
    .update(JSON.stringify([ROLL_DIGEST_VERSION, ...entries.map((e) => [e.sequence, e.receiptDigest, e.late])]), "utf8")
    .digest("hex");
  return { v: 1, entries, rollDigest };
}

/// 20s: from the opening's start, when the roll is frozen. Never a verdict, never "verified", "signed" or "proof".
export type MyBidOpeningState = "LISTED_NOT_OPENED" | "OPENED" | "LATE_IN_ROLL" | "NOT_IN_ROLL" | "REPLACED_OR_WITHDRAWN";

/**
 * Where the supplier's own submission stands from the opening's start; null before it. A replaced or withdrawn one was never to be opened. An opened one is opened,
 * at the main opening or at a supplementary one. Otherwise the roll decides: absent from it, late in it, or listed in it. Listed and not opened covers the time
 * between the start and the unseal, and also a listed bid still not opened after the unseal: its words ask the supplier to contact the organisation in that case.
 */
export function myBidOpeningState(i: { status: OnlineBidStatus; openingStarted: boolean; unsealed: boolean; rollEntry: { late: boolean } | null; opened: boolean }): MyBidOpeningState | null { // null: before the start
  if (!i.openingStarted) return null;
  if (i.status === "REPLACED" || i.status === "WITHDRAWN") return "REPLACED_OR_WITHDRAWN";
  if (i.opened || i.status === "OPENED") return "OPENED";
  if (i.rollEntry === null) return "NOT_IN_ROLL";
  if (i.rollEntry.late) return "LATE_IN_ROLL";
  return "LISTED_NOT_OPENED";
}

/// The words carry the digest itself (the listed or opened one), in full, and ask the supplier to compare it with the receipt it kept.
/// NOT_IN_ROLL names the organisation from configuration and asks the supplier to contact it now, quoting its receipt. OPENED keeps
/// ruling 25's "Opened; the result follows the evaluation".
/// Ruling 20ab: in English and Malay, the Malay saying no more than the English; the organisation is named in both, and the digest is never translated.
/// Audit 8: NOT_IN_ROLL speaks of this submission only. The supplier may have other receipts that are in the list.
export function myBidOpenedWords(i: { state: MyBidOpeningState; digest: string | null; organisationName: string }): { headline: Words; detail: Words; digest: string | null } {
  const name = i.organisationName.trim();
  const org = w(name || "the procurement office");
  const shown = i.digest ? w(`Its receipt digest is ${i.digest}.`) : w("No receipt digest is recorded for it.");
  // NOT_IN_ROLL: the digest is the one recorded when the supplier submitted it (the opening's list holds none for it), which is what it needs to complain with (S11).
  const notListed = i.digest
    ? w(`The receipt digest recorded when you submitted it is ${i.digest}. The opening's list holds none for it.`)
    : w("The opening's list holds no digest for it.");
  const compare = w("Compare it with the receipt you printed or saved when you submitted.");
  const out = (headline: Words, detail: Words) => ({ headline, detail, digest: i.digest });
  switch (i.state) {
    case "LISTED_NOT_OPENED":
      return out(
        w("Listed at the opening, not opened yet"),
        w(
          `Your bid is in the list frozen when the opening started. ${shown.en} ${compare.en} If the bids have been unsealed and yours is still not shown as opened, contact ${org.en} now, quoting your receipt.`,
        ),
      );
    case "OPENED":
      return out(
        w("Opened; the result follows the evaluation"),
        w(
          `Your bid was opened. ${shown.en} ${compare.en} Nothing of what was read, nor how it compares, is shown here.`,
        ),
      );
    case "LATE_IN_ROLL":
      return out(
        w("Received after the closing, so not opened at the main opening"),
        w(
          `Your bid was received after the closing. It is kept, sealed, and goes to the committee, which decides whether to admit it; if it is admitted, it is opened at a further opening. ${shown.en} ${compare.en}`,
        ),
      );
    case "NOT_IN_ROLL":
      return out(
        w("This submission is not in the opening's list"),
        w(
          `This submission is not in the list frozen when the opening started. Contact ${org.en} now, quoting the receipt you kept. ${notListed.en}`,
        ),
      );
    case "REPLACED_OR_WITHDRAWN":
      return out(
        w("Not opened, as expected"),
        w(
          `This submission was replaced or withdrawn before the closing, so it was not opened, as expected. ${shown.en}`,
        ),
      );
  }
}
