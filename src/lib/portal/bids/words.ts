/**
 * My Bids' findings in plain words, English and Malay (AGENTS.md rule 5: no code reaches a screen). A finding names what the supplier can do about it where it can do something.
 */

import { formatDate } from "@/lib/format";

import { REPRESENTATIVE_MAX } from "./signup";
import { COLLECTOR_MAX } from "./checks";
import { FAILED_TRIES_WORDS } from "./limits";
import type { BidFault, BidFinding } from "./types";

export interface Words {
  en: string;
}
const w = (en: string): Words => ({ en });
type Data = Record<string, string | number | null>;

const OWN: Readonly<Record<BidFault, (d: Data) => Words>> = {
  NOT_FOUND: () => w("That exercise is not one you can open."),
  NOT_PUBLISHED: () => w("This exercise has not been published yet."),
  EXERCISE_CANCELLED: () => w("This exercise was cancelled."),
  WINDOW_CLOSED: () => w("The closing has passed, so this can no longer be done."),
  WINDOW_NOT_DATED: () => w("The dates of this exercise are not complete, so nothing can be done on it yet. Tell the procurement office."),
  NOT_INVITED: () => w("This exercise invites named suppliers only, and your company is not on its list."),
  REPRESENTATIVE_REQUIRED: () => w("Give the name of the person you will send."),
  REPRESENTATIVE_TOO_LONG: () => w(`The name is longer than ${REPRESENTATIVE_MAX} characters.`),
  EVENT_NOT_FOUND: () => w("That briefing or site visit is not on this exercise."),
  EVENT_CANCELLED: () => w("This was cancelled."),
  EVENT_HELD: () => w("This has already been held."),
  EVENT_STARTED: () => w("This has already begun."),
  EVENT_NOT_DATED: () => w("This has no start time yet, so nobody can sign up for it."),
  ALREADY_SIGNED_UP: () => w("Your company is already signed up for this."),
  NOT_SIGNED_UP: () => w("Your company is not signed up for this."),
  ADDENDUM_NOT_FOUND: () => w("That addendum is not on this exercise."),
  ADDENDUM_NOT_ISSUED: () => w("That addendum has not been issued."),
  NOT_A_PURCHASER: () => w("Addenda are sent to the companies that bought the documents. Your company has not bought them, so you can read this addendum but not acknowledge it."),
  ALREADY_ACKNOWLEDGED: (d) => w(`You acknowledged this addendum${d.on ? ` on ${formatDate(String(d.on))}` : ""}.`),
  COLLECTOR_REQUIRED: () => w("Give the name of the person who will collect the documents."),
  COLLECTOR_TOO_LONG: () => w(`The name is longer than ${COLLECTOR_MAX} characters.`),
  REQUEST_STANDS: () => w("You have already asked for the documents. The office is waiting to sell them to you."),
  NO_REQUEST: () => w("You have no request for the documents to withdraw."),
  ALREADY_BOUGHT: () => w("The documents have already been sold to your company."),
  // SR-10: buying the documents online and paying for them.
  SOLD_ONLINE: () => w("The documents of this exercise are bought online, not asked for. Open the documents tab and press Buy documents."),
  NOT_SOLD_ONLINE: () => w("The documents of this exercise are not sold online."),
  RELEASE_NOT_ONLINE: () => w("The organisation has not set that documents are released online, so they cannot be bought here. Ask the procurement office."),
  FEE_NOT_SET: () => w("The fee for the documents is not set, so they cannot be bought yet. Tell the procurement office."),
  PURCHASE_STANDS: () => w("You have already started buying these documents. Open your purchase to pay for it."),
  NO_PURCHASE: () => w("You have no purchase of these documents to pay for."),
  ALREADY_PAID: () => w("This purchase is already paid."),
  PAYMENT_UNAVAILABLE: (d) => w(String(d.words ?? "Documents cannot be paid for online here.")),
  METHOD_NOT_OFFERED: () => w("Choose one of the payment methods offered."),
  NOT_ON_SALE: () => w("The documents are not on sale now, so they cannot be paid for."),
  TOO_MANY_FAILED_TRIES: () => w(FAILED_TRIES_WORDS),
  PAYMENT_BARRED: (d) => w(String(d.words ?? "The supplier register does not allow the documents to be sold to your company.")),
  // Decisions log, 2026-10-09, ruling on 1875(3): the supplier's standing bars this act, in its own words (src/lib/portal/standing-gate.ts).
  SUPPLIER_STANDING_BARS: (d) => w(String(d.en ?? "")),
  REQUEST_REFUSED: () => w("The documents cannot be sold to your company at the moment. The reasons are listed above."),
};

export function bidFaultText(f: Pick<BidFinding, "code" | "data">): Words {
  return OWN[f.code]((f.data ?? {}) as Data);
}
export const hasBidFaultText = (code: string): boolean => code in OWN;

export interface FaultView {
  field: string | null;
  level: BidFinding["level"];
  message: string;
}

export const bidFaultViews = (fs: readonly BidFinding[]): FaultView[] =>
  fs.map((f) => {
    const t = bidFaultText(f);
    return { field: null, level: f.level, message: t.en };
  });
