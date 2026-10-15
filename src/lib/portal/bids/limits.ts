/**
 * The bounds on what a supplier can make the system write (SR-10 review SEC-2). Pure.
 *
 * `PaymentAttempt` and `PurchaseDownload` are append-only: a row, once written, is never removed. So what can write them is bounded where it is asked, not afterwards. These numbers are
 * PRODUCT BEHAVIOUR, not customer policy: they exist to keep an append-only table from being filled by one signed-in account (or one stuck page), and no governing document sets them.
 * They are constants here on purpose, in one place, and were chosen as follows (logged in docs/notes/design/0003-sourcing-requirements-v2.md, section 6):
 *  - a person pays a handful of times and downloads a few dozen files: 10 tries to pay and 60 downloads a minute are far above any person and far below a script;
 *  - 5 failed tries on one purchase is enough to find the method that works. After that the office records the receipt instead (`recordPurchaseReceipt` already supports it);
 *  - a repeat of one download within 10 minutes is the same download for the log: the file was already recorded as taken.
 * If a customer ever needs these to differ, that is a decision to propose, not to infer.
 */

export type RatedAction = "document-download" | "payment-attempt" | "bid-part-upload" | "bid-submit" | "bid-withdraw";

export const RATE_LIMITS: Readonly<Record<RatedAction, { limit: number; windowSeconds: number }>> = {
  "document-download": { limit: 60, windowSeconds: 60 },
  "payment-attempt": { limit: 10, windowSeconds: 60 },
  // Wave 3b step 9 (20e, 20w): a pack returns perhaps ten to twenty parts and a supplier may upload one again; 30 a minute is far above a person and far below a script.
  "bid-part-upload": { limit: 30, windowSeconds: 60 },
  // Wave 3b step 10 (20e, 20w): a supplier submits a bid and a few alternatives, and replaces each a few times before the closing, and each try asks the password again. 10 a minute is far above a
  // person and far below a script. A refused try counts, so a script cannot probe the password or the doors faster than this.
  "bid-submit": { limit: 10, windowSeconds: 60 },
  "bid-withdraw": { limit: 10, windowSeconds: 60 },
};

/// The start of the fixed window a moment falls in: counting is by fixed window, so a counter row is one per account, action and window.
export function windowStartOf(now: Date, windowSeconds: number): Date {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

export type RateVerdict = { limited: false } | { limited: true; retryAfterSeconds: number };

/// Whether the count so far, this one included, is over the limit; if so, how many seconds until the window ends.
export function rateVerdict(action: RatedAction, count: number, now: Date): RateVerdict {
  const { limit, windowSeconds } = RATE_LIMITS[action];
  if (count <= limit) return { limited: false };
  const end = windowStartOf(now, windowSeconds).getTime() + windowSeconds * 1000;
  return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil((end - now.getTime()) / 1000)) };
}

/// A counter row older than this is of no use to the throttle and is removed by the next count.
export const RATE_ROW_KEEP_SECONDS = 24 * 60 * 60;

/// The bid actions' rate words are bilingual (`PART_ROUTE_WORDS`, `ACT_ROUTE_WORDS` in `lib/bids/online/words.ts`); only the actions without a Malay screen are here.
export const RATE_LIMITED_WORDS: Readonly<Record<Exclude<RatedAction, "bid-part-upload" | "bid-submit" | "bid-withdraw">, string>> = {
  "document-download": "You have asked for a great many files in the last minute, so this one was not sent. Nothing was logged. Wait a minute and try again.",
  "payment-attempt": "You have tried to pay too many times in the last minute. Nothing was recorded. Wait a minute and try again.",
};

/// Failed tries to pay on one purchase, after which no further try is taken.
export const MAX_FAILED_PAYMENT_TRIES = 5;

export const FAILED_TRIES_WORDS = `This purchase has had ${MAX_FAILED_PAYMENT_TRIES} failed tries at paying, so no more are taken here. Ask the procurement office to record your payment, and it will release the documents.`;

export const failedTriesExhausted = (failedTries: number): boolean => failedTries >= MAX_FAILED_PAYMENT_TRIES;

/// A repeat of the same download by the same account within this many minutes is not logged again.
export const REPEAT_DOWNLOAD_MINUTES = 10;

export const isRepeatDownload = (last: Date | null, now: Date): boolean => last != null && now.getTime() - last.getTime() < REPEAT_DOWNLOAD_MINUTES * 60_000 && now.getTime() >= last.getTime();

// ------------------------------------------------------------------ wave 3b: online sealed bids (SR-13, ADR 0036, ruling 20e)

/**
 * How far an online submission's stamp may lie behind the database clock when its envelope is inserted (ADR 0036 D5, H2, threat S24). PRODUCT BEHAVIOUR, not customer
 * policy (20e). The submit takes its stamp from the database clock to the second, then checks the supplier's password (a hash that may queue behind others: up to the
 * hash pool's limit), then takes the exercise's locks; the envelope's trigger refuses a stamp more than this many seconds old, or in the future. 30 seconds covers a
 * loaded hash queue and a lock wait with room to spare, and bounds what an application-role writer could back-date (S24) to half a minute. An online opening cannot
 * start until this long after the closing, so no in-time act is still committing when the roll is frozen.
 * Written as the literal 30 into migration 20261103110000 (the stamp and the withdrawal triggers); `triggers.db.test.ts` pins the two equal.
 */
export const MAX_STAMP_SKEW_SECONDS = 30;

/**
 * Caps per supplier per exercise (20e, threat S17, S19): never a pool shared between suppliers, so one bidder cannot use up another's room. PRODUCT BEHAVIOUR, not
 * customer policy. A cap never blocks a withdrawal and never removes a standing bid; at the cap the words say that the last submission stands.
 *  - Submissions (bids, alternatives and replacements together): a supplier hands in a bid and perhaps a few alternatives, and may replace each a few times before the
 *    closing. 20 is far above that, and keeps the append-only register from being filled by one account.
 *  - Draft files held at once: a pack returns perhaps ten to twenty parts, and a supplier may upload a part again before submitting. 40 drafts held at once covers a
 *    full pack twice over; a discarded draft frees its place.
 */
export const MAX_SUBMISSIONS_PER_SUPPLIER_PER_EXERCISE = 20;
export const MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE = 40;

/// The submit's JSON body, in bytes (plan section 1.5: at most 16 KB). A submission names an exercise, at most 40 file ids, a declaration and a password, which is under 4 KB; 16 KB leaves room and
/// still bounds what is read before the stamp. PRODUCT BEHAVIOUR (20e).
export const SUBMIT_BODY_LIMIT = 16 * 1024;

// src/lib/portal/bids/limits.ts (20w): only the first rate refusal per account per window writes a SealedAccessEvent
/// The count is this request's place in the window, itself included (`rateVerdict`): the first refusal is the one just over the limit. Every later refusal in the same
/// window is refused without a row, so one signed-in account cannot fill the sealed access log (S19); the throttle's own rows are not a record and say nothing.
export function rateRefusalLogged(countInWindow: number, limit: number): boolean {   // true only when countInWindow === limit + 1
  return countInWindow === limit + 1;
}

// ------------------------------------------------------------------ wave 3b step 9: the upload's body (20e)

/**
 * How long one part's body may take to arrive, and the slowest it may arrive at (threat S17, S19). PRODUCT BEHAVIOUR, not customer policy (20e): an upload holds a slot of the
 * deployment's bid-upload limit and the supplier's one place, so a body that trickles in would keep every other upload waiting. Five minutes is far longer than any file the
 * deployment's ceiling allows takes on a working connection, and 16 KB a second (after a 10 second grace for the connection to start) is far below any connection a bid can
 * be made on and far above a deliberate trickle. A body that is over either is cut off (408) and nothing is kept.
 */
export const BID_BODY_DEADLINE_SECONDS = 300;
export const BID_BODY_MIN_BYTES_PER_SECOND = 16 * 1024;
export const BID_BODY_GRACE_SECONDS = 10;
