/**
 * An officer unlocks their own key for an exercise (ADR 0036 D4, rulings 20v, 20n; wave 3b step 13). The one place the passphrase is tried, for `checkUnlock` and for the unseal's authorisation, so
 * the order is written once:
 *
 *   1. the named officer's live key for the exercise (nobody's but the signed-in person's);
 *   2. the pepper: a wrap made under a pepper this copy does not hold is refused as PEPPER_NOT_HELD before any unwrap, and is never counted (20v);
 *   3. the lockout gate on the key's own counter, from the sign-in lockout settings (unset refuses);
 *   4. the unwrap, outside any transaction (the derivation is slow and runs in the KDF queue). A wrong passphrase is counted in a small transaction of its own, because a refusal inside the
 *      act's transaction would roll the count back with it.
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
import { sealingPepper } from "@/lib/integration/sealing-deployment";

export type UnlockRefusal = "NOT_NAMED_OFFICER" | "NO_KEY" | "PEPPER_NOT_HELD" | "PEPPER_INVALID" | PassphraseGate | "WRONG_PASSPHRASE" | "KEY_UNREADABLE";

export type Unlocked = { ok: true; officerKeyId: string; rosterRowId: string; publicKey: Bytes; privateKey: Bytes } | { ok: false; reason: UnlockRefusal; nowLocked?: boolean };

export async function logSealedRefusal(i: { organisationId: string; exerciseId: string; kind: "AUTHORISE" | "UNLOCK_CHECK" | "DOWNLOAD" | "FINALISE"; staffPersonId: string; reasonCode: string; recordId?: string | null }): Promise<void> {
  const ex = await db.sourcingExercise.findFirst({ where: { id: i.exerciseId, organisationId: i.organisationId }, select: { id: true } });
  if (!ex) return;
  await db.sealedAccessEvent.create({ data: { organisationId: i.organisationId, exerciseId: ex.id, kind: i.kind, outcome: "REFUSED", reasonCode: i.reasonCode, staffPersonId: i.staffPersonId, recordId: i.recordId ?? null, at: new Date() } });
}

export async function logSealedGranted(i: { organisationId: string; exerciseId: string; kind: "UNLOCK_CHECK" | "DOWNLOAD"; staffPersonId: string; recordId: string; at: Date }): Promise<void> {
  await db.sealedAccessEvent.create({ data: { organisationId: i.organisationId, exerciseId: i.exerciseId, kind: i.kind, outcome: "GRANTED", staffPersonId: i.staffPersonId, recordId: i.recordId, at: i.at } });
}

/// Counts one wrong passphrase on the key, under a row lock so two wrong entries at once both count. Returns whether the key is now locked.
async function countWrong(organisationId: string, officerKeyId: string, now: Date): Promise<boolean> {
  const policy = await loadSecurityPolicy(db, organisationId);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "OfficerExerciseKey" WHERE id = ${officerKeyId} FOR UPDATE`;
    const k = await tx.officerExerciseKey.findFirst({ where: { id: officerKeyId, organisationId }, select: { failedAttempts: true, lockedUntil: true } });
    if (!k || !policy) return false;
    const next = afterWrongPassphrase(k, policy, now);
    await tx.officerExerciseKey.update({ where: { id: officerKeyId }, data: { failedAttempts: next.failedAttempts, lockedUntil: next.lockedUntil } });
    return next.lockedUntil !== null && next.lockedUntil.getTime() > now.getTime();
  });
}

export async function unlockOwnKey(i: { organisationId: string; exerciseId: string; personId: string; passphrase: string; kind: "AUTHORISE" | "UNLOCK_CHECK"; now: Date; recordId?: string | null }): Promise<Unlocked> {
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

  const policy = await loadSecurityPolicy(db, i.organisationId);
  const gate = passphraseGate({ failedAttempts: key.failedAttempts, lockedUntil: key.lockedUntil }, { maxFailedAttempts: policy?.maxFailedAttempts ?? null, lockoutMinutes: policy?.lockoutMinutes ?? null }, i.now);
  if (gate) return refuse(gate);

  let privateKey: Bytes | null;
  try {
    privateKey = await unwrapKey(wrapped, i.passphrase, wrapped.pepperId === null ? null : held, officerKeyAad({ organisationId: i.organisationId, exerciseId: i.exerciseId, officerKeyId: key.id, rosterRowId: row.id }));
  } catch (e) {
    if (e instanceof SealError) return refuse("KEY_UNREADABLE");
    throw e;
  }
  if (!privateKey) {
    const nowLocked = await countWrong(i.organisationId, key.id, i.now);
    return refuse("WRONG_PASSPHRASE", { nowLocked });
  }
  if (key.failedAttempts > 0 || key.lockedUntil !== null) {
    const clear = afterSuccess();
    await db.officerExerciseKey.update({ where: { id: key.id }, data: { failedAttempts: clear.failedAttempts, lockedUntil: clear.lockedUntil } });
  }
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

