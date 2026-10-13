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

export type RatedAction = "document-download" | "payment-attempt";

export const RATE_LIMITS: Readonly<Record<RatedAction, { limit: number; windowSeconds: number }>> = {
  "document-download": { limit: 60, windowSeconds: 60 },
  "payment-attempt": { limit: 10, windowSeconds: 60 },
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

export const RATE_LIMITED_WORDS: Readonly<Record<RatedAction, string>> = {
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
