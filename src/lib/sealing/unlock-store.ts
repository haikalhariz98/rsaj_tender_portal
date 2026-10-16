/**
 * An officer unlocks their own key for an exercise (ADR 0036 D4, rulings 20v, 20n; wave 3b step 13). The one place the passphrase is tried, for `checkUnlock` and for the unseal's authorisation, so
 * the order is written once:
 *
 *   1. the named officer's live key for the exercise (nobody's but the signed-in person's);
 *   2. the pepper: a wrap made under a pepper this copy does not hold is refused as PEPPER_NOT_HELD before any unwrap, and is never counted (20v);
 *   3. the lockout gate on the key's own counter, from the sign-in lockout settings (unset refuses), judged and the attempt reserved in one locked transaction, so parallel requests cannot all pass
 *      the same unlocked counter;
 *   4. the unwrap, outside any transaction (the derivation is slow and runs in the KDF queue). The attempt was already counted at 3, in a transaction of its own (a refusal inside the act's
 *      transaction would roll the count back with it); a right passphrase clears the count.
 *
 * Every refusal is written as a REFUSED `SealedAccessEvent` (outside the act's transaction), after the session was checked by the caller. The passphrase, the derived key and the private key are
 * never logged, audited or returned in a message; the private key is returned to the caller, which zeroes it.
 */

import { officerKeyAad } from "./ceremony-seal";
import { PEPPER_NOT_HELD_WORDS, pepperFault, unwrapKey } from "./kdf";
import { afterWrongPassphrase, NOT_YOUR_KEY_WORDS, PASSPHRASE_GATE_WORDS, passphraseGate, WRONG_PASSPHRASE_WORDS, type PassphraseGate } from "./passphrase";
import { SealError, type Bytes } from "./types";
import { wrappedKeyOf } from "./unseal-seal";
import { afterSuccess } from "@/lib/auth/lockout";
import { loadSecurityPolicy } from "@/lib/auth/policy-store";
import { db } from "@/lib/db";
import { RATE_LIMITS, rateRefusalLogged } from "@/lib/portal/bids/limits";
import { countAndJudgeCounted } from "@/lib/portal/bids/rate-store";
import { sealingPepper } from "@/lib/integration/sealing-deployment";

export type UnlockRefusal = "NOT_NAMED_OFFICER" | "NO_KEY" | "PEPPER_NOT_HELD" | "PEPPER_INVALID" | PassphraseGate | "WRONG_PASSPHRASE" | "KEY_UNREADABLE";

export type Unlocked = { ok: true; officerKeyId: string; rosterRowId: string; publicKey: Bytes; privateKey: Bytes } | { ok: false; reason: UnlockRefusal; nowLocked?: boolean };

export async function logSealedRefusal(i: { organisationId: string; exerciseId: string; kind: "AUTHORISE" | "UNLOCK_CHECK" | "DOWNLOAD" | "FINALISE" | "ESTIMATE_LODGED"; staffPersonId: string; reasonCode: string; recordId?: string | null }): Promise<void> {
  const ex = await db.sourcingExercise.findFirst({ where: { id: i.exerciseId, organisationId: i.organisationId }, select: { id: true } });
  if (!ex) return;
  await db.sealedAccessEvent.create({ data: { organisationId: i.organisationId, exerciseId: ex.id, kind: i.kind, outcome: "REFUSED", reasonCode: i.reasonCode, staffPersonId: i.staffPersonId, recordId: recordIdOrNull(i.recordId), at: new Date() } });
}

/// The shape of a record id the sealed doors accept. Anything else is not an id of ours and is logged as none, so a client cannot size the row.
export const SEALED_RECORD_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const recordIdOrNull = (v: string | null | undefined): string | null => (v != null && SEALED_RECORD_ID.test(v) ? v : null);

/// An administrator account refused at a sealed door (S19, 20w): the first refusal for the account in each hour is written, the rest are counted and not written, so a script cannot fill the log.
export async function logAdministratorRefusal(i: { organisationId: string; accountId: string; exerciseId: string; kind: "AUTHORISE" | "UNLOCK_CHECK" | "FINALISE" | "ESTIMATE_LODGED"; staffPersonId: string; recordId?: string | null }): Promise<void> {
  const seen = await countAndJudgeCounted(db, { organisationId: i.organisationId, accountId: i.accountId, action: "officer-sealed-refusal" }, new Date());
  if (seen.count !== 1) return;
  await logSealedRefusal({ organisationId: i.organisationId, exerciseId: i.exerciseId, kind: i.kind, staffPersonId: i.staffPersonId, reasonCode: "ADMINISTRATOR", recordId: recordIdOrNull(i.recordId) });
}

/// A refused lodgement of the company estimate on an ONLINE exercise, an administrator's included (S19, 20w, 20bb). Only an ONLINE exercise has a sealed door: a paper exercise's estimate goes into a
/// box, and nothing is written for it. Written after the session was checked, outside the refused transaction, and only the first in each hour for the account, so a script cannot fill the log.
export async function logEstimateRefusal(i: { organisationId: string; accountId: string; exerciseId: string; staffPersonId: string; reasonCode: string }): Promise<void> {
  const ex = await db.sourcingExercise.findFirst({ where: { id: i.exerciseId, organisationId: i.organisationId }, select: { submissionChannel: true } });
  if (ex?.submissionChannel !== "ONLINE") return;
  const seen = await countAndJudgeCounted(db, { organisationId: i.organisationId, accountId: i.accountId, action: "officer-sealed-refusal" }, new Date());
  if (seen.count !== 1) return;
  await logSealedRefusal({ organisationId: i.organisationId, exerciseId: i.exerciseId, kind: "ESTIMATE_LODGED", staffPersonId: i.staffPersonId, reasonCode: i.reasonCode });
}

export async function logSealedGranted(i: { organisationId: string; exerciseId: string; kind: "UNLOCK_CHECK" | "DOWNLOAD" | "FINALISE"; staffPersonId: string; recordId: string; at: Date }): Promise<void> {
  await db.sealedAccessEvent.create({ data: { organisationId: i.organisationId, exerciseId: i.exerciseId, kind: i.kind, outcome: "GRANTED", staffPersonId: i.staffPersonId, recordId: i.recordId, at: i.at } });
}

type Reservation = { ok: true; before: { failedAttempts: number; lockedUntil: Date | null }; after: { failedAttempts: number; lockedUntil: Date | null }; nowLocked: boolean } | { ok: false; gate: PassphraseGate };

/// Reserves one attempt on the key before the passphrase is derived (review: parallel guesses must not all pass the gate against the same counter). Under a row lock the gate is judged on the
/// counter as it stands and, if the passphrase may be tried, the attempt is counted at once, as if it were wrong; a right passphrase clears the count afterwards. Requests in flight therefore each
/// see the others' reservations, so no more derivations than `maxFailedAttempts` can be started in a window, however many arrive together.
async function reserveAttempt(organisationId: string, officerKeyId: string, now: Date): Promise<Reservation> {
  const policy = await loadSecurityPolicy(db, organisationId);
  const limits = { maxFailedAttempts: policy?.maxFailedAttempts ?? null, lockoutMinutes: policy?.lockoutMinutes ?? null };
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "OfficerExerciseKey" WHERE id = ${officerKeyId} FOR UPDATE`;
    const k = await tx.officerExerciseKey.findFirst({ where: { id: officerKeyId, organisationId }, select: { failedAttempts: true, lockedUntil: true } });
    if (!k) return { ok: false as const, gate: "LOCKED" as const };
    const gate = passphraseGate(k, limits, now);
    if (gate) return { ok: false as const, gate };
    const next = afterWrongPassphrase(k, limits, now);
    await tx.officerExerciseKey.update({ where: { id: officerKeyId }, data: { failedAttempts: next.failedAttempts, lockedUntil: next.lockedUntil } });
    return { ok: true as const, before: k, after: next, nowLocked: next.lockedUntil !== null && next.lockedUntil.getTime() > now.getTime() };
  });
}

/// Gives a reserved attempt back when the derivation failed for a reason that is not a wrong passphrase (an unreadable key): one fewer, and the lock this reservation set lifted if it no longer applies.
async function refundAttempt(organisationId: string, officerKeyId: string, r: Extract<Reservation, { ok: true }>): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "OfficerExerciseKey" WHERE id = ${officerKeyId} FOR UPDATE`;
    const k = await tx.officerExerciseKey.findFirst({ where: { id: officerKeyId, organisationId }, select: { failedAttempts: true, lockedUntil: true } });
    if (!k) return;
    const failedAttempts = Math.max(0, k.failedAttempts - 1);
    const liftLock = r.nowLocked && k.lockedUntil !== null && r.after.lockedUntil !== null && k.lockedUntil.getTime() === r.after.lockedUntil.getTime();
    await tx.officerExerciseKey.update({ where: { id: officerKeyId }, data: { failedAttempts, lockedUntil: liftLock ? r.before.lockedUntil : k.lockedUntil } });
  });
}

export async function unlockOwnKey(i: { organisationId: string; exerciseId: string; personId: string; passphrase: string; kind: "AUTHORISE" | "UNLOCK_CHECK" | "DOWNLOAD" | "FINALISE"; now: Date; recordId?: string | null }): Promise<Unlocked> {
  const refuse = async (reason: UnlockRefusal, extra: { nowLocked?: boolean } = {}): Promise<Unlocked> => {
    await logSealedRefusal({ organisationId: i.organisationId, exerciseId: i.exerciseId, kind: i.kind, staffPersonId: i.personId, reasonCode: reason, recordId: i.recordId });
    return { ok: false, reason, ...extra };
  };
  const row = await db.exerciseOpeningOfficer.findFirst({ where: { exerciseId: i.exerciseId, organisationId: i.organisationId, personId: i.personId, endedAt: null }, select: { id: true } });
  if (!row) return refuse("NOT_NAMED_OFFICER");
  const key = await db.officerExerciseKey.findFirst({ where: { exerciseId: i.exerciseId, organisationId: i.organisationId, openingOfficerId: row.id, retiredAt: null } });
  if (!key) return refuse("NO_KEY");

  const wrapped = wrappedKeyOf(key);
  const reading = sealingPepper();
  if (reading.status === "INVALID") return refuse("PEPPER_INVALID");
  const held = reading.status === "SET" ? reading.pepper : null;
  // 20v: before any unwrap, and never counted.
  if (pepperFault(wrapped, held) === "PEPPER_NOT_HELD") return refuse("PEPPER_NOT_HELD");

  const reserved = await reserveAttempt(i.organisationId, key.id, i.now);
  if (!reserved.ok) return refuse(reserved.gate);

  let privateKey: Bytes | null;
  try {
    privateKey = await unwrapKey(wrapped, i.passphrase, wrapped.pepperId === null ? null : held, officerKeyAad({ organisationId: i.organisationId, exerciseId: i.exerciseId, officerKeyId: key.id, rosterRowId: row.id }));
  } catch (e) {
    if (e instanceof SealError) {
      await refundAttempt(i.organisationId, key.id, reserved);
      return refuse("KEY_UNREADABLE");
    }
    // Not a verdict on the passphrase: give the attempt back, then fail as before.
    await refundAttempt(i.organisationId, key.id, reserved);
    throw e;
  }
  // A wrong passphrase is already counted by the reservation.
  if (!privateKey) return refuse("WRONG_PASSPHRASE", { nowLocked: reserved.nowLocked });
  const clear = afterSuccess();
  await db.officerExerciseKey.update({ where: { id: key.id }, data: { failedAttempts: clear.failedAttempts, lockedUntil: clear.lockedUntil } });
  return { ok: true, officerKeyId: key.id, rosterRowId: row.id, publicKey: new Uint8Array(key.publicKey), privateKey };
}

/// The words for each refusal, for the officer. A wrong passphrase says it was counted, and whether the key is now locked.
export function unlockRefusalWords(r: Exclude<Unlocked, { ok: true }>): string {
  switch (r.reason) {
    case "NOT_NAMED_OFFICER":
      return "Only an opening officer named on this exercise unlocks its bids.";
    case "NO_KEY":
      return "You have not set your share for this exercise, so there is no key of yours to unlock.";
    case "PEPPER_NOT_HELD":
      return PEPPER_NOT_HELD_WORDS;
    case "PEPPER_INVALID":
      return "The deployment's sealing pepper is configured wrongly, so no key can be unlocked. Whoever runs the system must correct it first.";
    case "LOCKED":
    case "LOCKOUT_NOT_SET":
      return PASSPHRASE_GATE_WORDS[r.reason];
    case "WRONG_PASSPHRASE":
      return r.nowLocked ? `${WRONG_PASSPHRASE_WORDS} Your key is now locked for a while.` : WRONG_PASSPHRASE_WORDS;
    case "KEY_UNREADABLE":
      return NOT_YOUR_KEY_WORDS;
  }
}


/**
 * The per-account rate on the officer's passphrase acts (20bb): the unseal authorisation, the passphrase check, signing the online finalise and finalising it. Counted FIRST, before anything is looked up
 * or tried, so a flood of refusals writes at most one row a window and password or passphrase guessing is bounded. A refused try counts. Only the first refusal in a window is written (20w), as a
 * REFUSED row with the reason RATE_LIMITED, after the session was checked by the caller. Returns the words to show, or null when the act may go on.
 */
export async function officerActRate(i: { organisationId: string; accountId: string; exerciseId: string; kind: "AUTHORISE" | "UNLOCK_CHECK" | "FINALISE"; staffPersonId: string; recordId?: string | null; now?: Date }): Promise<string | null> {
  const now = i.now ?? new Date();
  const rate = await countAndJudgeCounted(db, { organisationId: i.organisationId, accountId: i.accountId, action: "officer-passphrase-act" }, now);
  if (!rate.limited) return null;
  if (rateRefusalLogged(rate.count, RATE_LIMITS["officer-passphrase-act"].limit)) {
    await logSealedRefusal({ organisationId: i.organisationId, exerciseId: i.exerciseId, kind: i.kind, staffPersonId: i.staffPersonId, reasonCode: "RATE_LIMITED", recordId: i.recordId });
  }
  return OFFICER_ACT_RATE_WORDS(rate.retryAfterSeconds);
}

export const OFFICER_ACT_RATE_WORDS = (retryAfterSeconds: number): string =>
  `You have tried too many times in the last minute, so this was not tried. Nothing was recorded. Wait ${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"} and try again. The first refused try in each minute is logged.`;
