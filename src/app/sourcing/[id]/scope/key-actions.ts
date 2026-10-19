"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { attributionRefusalState, beginAct } from "@/app/_auth/act";
import { requireStaff, staffForAct, toAuditActor } from "@/app/_auth/actor";
import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { actFieldNames } from "@/lib/auth/act-field-names";
import { loadSecurityPolicy } from "@/lib/auth/policy-store";
import type { Reader } from "@/lib/auth/sulit-store";
import type { AuditActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { sealingPepper } from "@/lib/integration/sealing-deployment";
import { passphraseFaults, PASSPHRASE_WORDS } from "@/lib/sealing/ceremony";
import { makeOfficerKey } from "@/lib/sealing/ceremony-seal";
import { pepperForWrapFault, PEPPER_WRAP_WORDS, REKEY_WORDS, rekeyRefusals, SHARE_WORDS, shareFaults } from "@/lib/sealing/share";
import { loadCeremony, logCeremonyEvent, logCeremonyRefusal, makeKeyIfComplete, rekeyKey, retireExerciseKey, retireOfficerKey, sealedSqlState } from "@/lib/sealing/store";
import { logAdministratorRefusal, logSealedGranted, logSealedRefusal, officerActRate, unlockOwnKey, unlockRefusalWords } from "@/lib/sealing/unlock-store";
import { exerciseIsHidden } from "@/app/_auth/sulit";
import { zero } from "@/lib/sealing/types";
import { loadPendingSubstitution } from "@/lib/sealing/substitution-store";
import { withLockedExerciseScope, type LockedExercise } from "@/lib/scope/lock";
import { transactionTimedOut } from "@/lib/scope/tx-timeout";

/**
 * The key ceremony's two acts (ADR 0036 D3, D4, D11; build plan step 8): a named opening officer sets their own share, and a named officer changes the key of a published
 * exercise before any bid exists. Both ask the sign-in password again (the act's slot is signature-class; `beginAct` is the only place that password is checked) and the
 * share also takes the officer's unseal passphrase, which is never the sign-in password, never stored, and never written to an audit row, a log or a message.
 *
 * The slow work (the passphrase's key derivation) runs before the transaction, so no row stays locked while it runs. The transaction then locks the exercise, re-reads the
 * ceremony's rows, re-runs the pure rule on them and writes the rows and their audit entries together.
 */

const GONE: FormState = { ok: false, message: "This exercise could not be found." };
const MAX_PASSPHRASE_CHARACTERS = 1024;
const exerciseIdOf = (data: FormData) => String(data.get("exerciseId") ?? "");
const text = (data: FormData, name: string) => (typeof data.get(name) === "string" ? (data.get(name) as string) : "");

async function audit(tx: Tx, actor: AuditActor, orgId: string, entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE" | "DELETE", changes: ReturnType<typeof diffFields>, reason = "") {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { actor, organisationId: orgId, entity, entityId, entityLabel, reason }, action, changes);
}

/// What the database refused at a write or the commit, said in words. Anything else is a defect and is thrown.
function refusedByDatabase(e: unknown): FormState | null {
  const code = sealedSqlState(e);
  if (code === "PA017") return { ok: false, message: "Not saved: closing has passed, or the exercise is not online. Reload." };
  if (code === "PA019") return { ok: false, message: `Nothing was saved: ${PEPPER_WRAP_WORDS.PEPPER_NOT_SET}` };
  if (code === "PA014") return { ok: false, message: "Nothing was saved: a sealed record never changes once written. Reload and try again." };
  return null;
}

async function inExercise(scope: Reader, exerciseId: string, fn: (tx: Tx, l: LockedExercise) => Promise<FormState>): Promise<FormState> {
  let result: FormState | null;
  try {
    result = await withLockedExerciseScope(scope, exerciseId, fn);
  } catch (e) {
    if (e instanceof RolledBack) return e.state;
    const attribution = attributionRefusalState(e);
    if (attribution) return attribution;
    if (transactionTimedOut(e)) return { ok: false, message: "That took too long and nothing was saved. Try again." };
    const refused = refusedByDatabase(e);
    if (refused) return refused;
    throw e;
  }
  if (result?.ok) {
    revalidatePath(`/sourcing/${exerciseId}`);
    revalidatePath("/sourcing");
  }
  return result ?? GONE;
}

/// Thrown after rows are written to roll the whole act back with the words the officer should read (a returned state would commit what was written).
class RolledBack extends Error {
  constructor(readonly state: FormState) {
    super(state.message ?? "Rolled back");
  }
}

const labelOf = (l: LockedExercise, what: string) => `${l.ex.reference} · ${what}`;

/**
 * A named opening officer sets their own share: their passphrase wraps a key pair made for this exercise. When the last named officer has set theirs, the exercise key is
 * made, split across them and sealed (no passphrase is needed for that, only the officers' public keys). An officer who sets a share again replaces their own, and the
 * exercise key is made again; after publication that is a recorded key change and is allowed only while no bid exists and before the closing.
 */
export async function setOfficerShare(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("UNSEAL");
  if (!guard.ok) {
    const who = await requireStaff();
    await logCeremonyRefusal(db, { organisationId: who.organisationId, exerciseId: exerciseIdOf(data), kind: "SHARE_SET", staffPersonId: who.personId, reasonCode: "ADMINISTRATOR" });
    return guard.state;
  }
  const actor = guard.actor;
  const exerciseId = exerciseIdOf(data);
  const passphrase = text(data, "passphrase");
  const repeat = text(data, "repeat");
  const signInPassword = text(data, actFieldNames("personId").password);

  const row = await db.exerciseOpeningOfficer.findFirst({ where: { exerciseId, organisationId: actor.organisationId, personId: actor.personId, endedAt: null }, select: { id: true } });
  const refuse = (kind: "SHARE_SET" | "KEY_RETIRED", reasonCode: string) => logCeremonyRefusal(db, { organisationId: actor.organisationId, exerciseId, kind, staffPersonId: actor.personId, reasonCode });
  if (!row) {
    await refuse("SHARE_SET", "NOT_NAMED_OFFICER");
    return { ok: false, message: SHARE_WORDS.NOT_NAMED_OFFICER };
  }

  if (passphrase.length > MAX_PASSPHRASE_CHARACTERS) return { ok: false, errors: { passphrase: "That passphrase is too long." } };
  const policy = await loadSecurityPolicy(db, actor.organisationId);
  const found = passphraseFaults(passphrase, repeat, policy?.sealingPassphraseMinLength ?? null, signInPassword !== "" && passphrase.normalize("NFC") === signInPassword.normalize("NFC"));
  if (found.length) {
    const errors: Record<string, string> = {};
    for (const f of found) errors[f === "NOT_REPEATED" ? "repeat" : "passphrase"] = PASSPHRASE_WORDS[f];
    return { ok: false, errors };
  }

  const sealing = await db.bidSealingPolicy.findUnique({ where: { organisationId: actor.organisationId }, select: { onlineSubmission: true } });
  const reading = sealingPepper();
  const pepperFault = pepperForWrapFault(sealing?.onlineSubmission ?? null, reading.status);
  if (pepperFault) return { ok: false, message: PEPPER_WRAP_WORDS[pepperFault] };
  const pepper = reading.status === "SET" ? reading.pepper : null;

  // The sign-in password, asked again (a wrong one counts towards the lockout and is written on its own).
  const begun = await beginAct(actor, data, "OfficerExerciseKey.person", { personField: "personId", onBehalf: false });
  if (!begun.ok) return begun.state;
  const act = begun.act;

  const officerKeyId = randomUUID();
  const wrapped = await makeOfficerKey({ organisationId: actor.organisationId, exerciseId, officerKeyId, rosterRowId: row.id, passphrase, pepper });

  const refusal = { code: null as string | null };
  const out = await inExercise(actor, exerciseId, async (tx, l) => {
    const now = new Date();
    const facts = await loadCeremony(tx, l.org.id, exerciseId);
    const mine = facts.roster.find((r) => r.id === row.id);
    const own = facts.officerKeys.find((k) => k.openingOfficerId === row.id) ?? null;
    // Step 17 (D11): after publication a newly named officer sets their share only as the incoming officer of a substitution that is waiting for them.
    const waiting = facts.published ? (await loadPendingSubstitution(tx, l.org.id, exerciseId)).pending : null;
    const incomingOfSubstitution = waiting?.state === "PENDING" && waiting.incoming.rosterRowId === row.id;
    const refused = shareFaults({ channel: l.ex.submissionChannel, status: l.ex.status, namedOfficer: !!mine && mine.personId === actor.personId, now, closing: l.ex.closingAt, published: facts.published, hasLiveShare: facts.shareHolderRowIds.includes(row.id), submissions: facts.submissions, substitutionIncoming: incomingOfSubstitution });
    if (refused.length) {
      refusal.code = refused[0];
      return { ok: false, message: `Nothing was saved: ${refused.map((f) => SHARE_WORDS[f]).join(" ")}` };
    }

    const reason = own ? "The officer set a new passphrase" : "";
    if (own) await retireOfficerKey(tx, l.org.id, own.id, reason, now);
    await tx.officerExerciseKey.create({
      data: {
        id: officerKeyId,
        organisationId: l.org.id,
        exerciseId,
        openingOfficerId: row.id,
        personId: actor.personId,
        publicKey: wrapped.publicKey as Uint8Array<ArrayBuffer>,
        wrappedPrivateKey: wrapped.wrappedPrivateKey as Uint8Array<ArrayBuffer>,
        kdfLog2N: wrapped.kdfLog2N,
        kdfR: wrapped.kdfR,
        kdfP: wrapped.kdfP,
        kdfSalt: wrapped.kdfSalt as Uint8Array<ArrayBuffer>,
        pepperId: wrapped.pepperId,
        createdAt: now,
      },
    });
    await logCeremonyEvent(tx, { organisationId: l.org.id, exerciseId, kind: "SHARE_SET", staffPersonId: actor.personId, recordId: officerKeyId, at: now });

    if (incomingOfSubstitution && waiting?.state === "PENDING") {
      // Not a re-key: the key and every bid sealed to it stay as they are. The departing officer now releases their share to this key.
      await audit(tx, toAuditActor(actor), l.org.id, "OfficerExerciseKey", officerKeyId, labelOf(l, `Share · ${mine!.name}`), "CREATE", diffFields(null, { officer: mine!.name, seat: mine!.seatLabel, replacedEarlierShare: own ? "yes" : "no", wrappedWithPepper: wrapped.pepperId ? "yes" : "no", forSubstitutionOf: waiting.departing.name }), reason);
      await act.write(tx, officerKeyId, { document: { entity: "ExerciseOpeningOfficer", id: row.id }, roleCode: mine!.seatLabel });
      return { ok: true, message: `Share set. ${waiting.departing.name} must release theirs before opening can start.` };
    }

    let madeFingerprint: string | null = null;
    if (facts.published) {
      // A published exercise: a new share is a recorded key change (the old key is retired with its shares shredded, the drafts under it discarded, the new key made).
      const changed = await rekeyKey(tx, { organisationId: l.org.id, exerciseId, reason: "An opening officer set a new passphrase", now, byPersonId: actor.personId, viaOfficerKeyId: officerKeyId });
      if (!changed) throw new RolledBack({ ok: false, message: `Nothing was saved: ${REKEY_WORDS.KEY_STALE}` });
      madeFingerprint = changed.made.fingerprint;
      await audit(tx, toAuditActor(actor), l.org.id, "SourcingExercise", exerciseId, labelOf(l, "Key change"), "UPDATE", diffFields({ keyFingerprint: changed.from.fingerprint, draftsDiscarded: null }, { keyFingerprint: changed.made.fingerprint, draftsDiscarded: changed.discarded }), "An opening officer set a new passphrase");
    } else {
      if (facts.liveKey) {
        await retireExerciseKey(tx, l.org.id, facts.liveKey.id, "An opening officer set a new passphrase", now);
        await logCeremonyEvent(tx, { organisationId: l.org.id, exerciseId, kind: "KEY_RETIRED", staffPersonId: actor.personId, recordId: facts.liveKey.id, reasonCode: "SHARE_REPLACED", at: now });
      }
      const made = await makeKeyIfComplete(tx, l.org.id, exerciseId, now);
      if (made) {
        madeFingerprint = made.fingerprint;
        await logCeremonyEvent(tx, { organisationId: l.org.id, exerciseId, kind: "KEY_CREATED", staffPersonId: actor.personId, recordId: made.keyId, at: now });
        await audit(tx, toAuditActor(actor), l.org.id, "ExerciseSealingKey", made.keyId, labelOf(l, "Exercise key"), "CREATE", diffFields(null, { keyFingerprint: made.fingerprint, officersHoldingShares: made.officerCount }));
      }
    }
    await audit(
      tx,
      toAuditActor(actor),
      l.org.id,
      "OfficerExerciseKey",
      officerKeyId,
      labelOf(l, `Share · ${mine!.name}`),
      "CREATE",
      diffFields(null, { officer: mine!.name, seat: mine!.seatLabel, replacedEarlierShare: own ? "yes" : "no", wrappedWithPepper: wrapped.pepperId ? "yes" : "no", keyMadeNow: madeFingerprint ? "yes" : "no" }),
      reason,
    );
    await act.write(tx, officerKeyId, { document: { entity: "ExerciseOpeningOfficer", id: row.id }, roleCode: mine!.seatLabel });

    if (madeFingerprint) return { ok: true, message: "Share set. The key is made." };
    const after = await loadCeremony(tx, l.org.id, exerciseId);
    const n = after.state.missing.length;
    return { ok: true, message: `Share set. ${n === 0 ? "Name at least two opening officers." : n === 1 ? "One officer still to set theirs." : `${n} officers still to set theirs.`}` };
  });
  if (refusal.code) await refuse("SHARE_SET", refusal.code);
  return out;
}

/**
 * Change the key of a published exercise (rulings 20g, 20p), by a named opening officer, with a reason: allowed only before the closing and while no bid exists. One
 * transaction retires the key and shreds its shares, discards the drafts under it, makes the new key across the officers' current keys, writes the append-only change and
 * freezes the new fingerprint. A company estimate lodged under the old key must be lodged again: step 16's lodgement reader must judge a lodgement's key against the live key.
 */
export async function rekeyExercise(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("UNSEAL");
  if (!guard.ok) {
    const who = await requireStaff();
    await logCeremonyRefusal(db, { organisationId: who.organisationId, exerciseId: exerciseIdOf(data), kind: "KEY_RETIRED", staffPersonId: who.personId, reasonCode: "ADMINISTRATOR" });
    return guard.state;
  }
  const actor = guard.actor;
  const exerciseId = exerciseIdOf(data);
  const reason = text(data, "reason").trim();
  if (reason.length > 1000) return { ok: false, errors: { reason: "Keep the reason to 1000 characters." } };
  if (reason === "") return { ok: false, errors: { reason: REKEY_WORDS.REASON_REQUIRED } };

  const begun = await beginAct(actor, data, "PublishedKeyChange.by", { personField: "personId", onBehalf: false });
  if (!begun.ok) return begun.state;
  const act = begun.act;

  const refusal = { code: null as string | null };
  const out = await inExercise(actor, exerciseId, async (tx, l) => {
    const now = new Date();
    const facts = await loadCeremony(tx, l.org.id, exerciseId);
    const mine = facts.roster.find((r) => r.personId === actor.personId) ?? null;
    const refused = rekeyRefusals({ channel: l.ex.submissionChannel, status: l.ex.status, published: facts.published, namedOfficer: !!mine, reason, hasLiveKey: !!facts.liveKey, officers: facts.roster.length, stale: facts.state.stale, submissions: facts.submissions, now, closing: l.ex.closingAt });
    if (refused.length) {
      refusal.code = refused[0];
      return { ok: false, message: `Nothing was saved: ${refused.map((f) => REKEY_WORDS[f]).join(" ")}` };
    }
    const changed = await rekeyKey(tx, { organisationId: l.org.id, exerciseId, reason, now, byPersonId: actor.personId });
    if (!changed || !changed.changeId) throw new RolledBack({ ok: false, message: `Nothing was saved: ${REKEY_WORDS.KEY_STALE}` });
    await audit(tx, toAuditActor(actor), l.org.id, "ExerciseSealingKey", changed.made.keyId, labelOf(l, "Exercise key"), "CREATE", diffFields(null, { keyFingerprint: changed.made.fingerprint, officersHoldingShares: changed.made.officerCount, replacesFingerprint: changed.from.fingerprint, draftsDiscarded: changed.discarded }), reason);
    await audit(tx, toAuditActor(actor), l.org.id, "SourcingExercise", exerciseId, labelOf(l, "Key change"), "UPDATE", diffFields({ publishedKeyFingerprint: changed.from.fingerprint }, { publishedKeyFingerprint: changed.made.fingerprint }), reason);
    await act.write(tx, changed.changeId, { document: { entity: "SourcingExercise", id: exerciseId }, roleCode: mine!.seatLabel });
    return { ok: true, message: `Key changed. ${changed.discarded === 0 ? "No supplier uploads discarded." : `${changed.discarded} supplier upload${changed.discarded === 1 ? "" : "s"} discarded.`} Lodge the company estimate again.` };
  });
  if (refusal.code) await logCeremonyRefusal(db, { organisationId: actor.organisationId, exerciseId, kind: "KEY_RETIRED", staffPersonId: actor.personId, reasonCode: refusal.code });
  return out;
}

/**
 * "Check I can still unlock" (ADR 0036 D4, build plan step 13): a named officer tests their passphrase against their own wrapped key before the opening, without releasing a share. The
 * sign-in password is asked again (step-up). A wrong passphrase is counted on the key's own lockout and never on the sign-in's; a pepper this copy does not hold is its own refusal and is
 * not counted (20v). Every attempt, granted or refused, is written as an `UNLOCK_CHECK` access event, after the session was checked. Nothing is changed but that counter.
 */
export async function checkUnlock(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("UNSEAL");
  if (!guard.ok) {
    const who = await requireStaff();
    await logAdministratorRefusal({ organisationId: who.organisationId, accountId: who.accountId, exerciseId: exerciseIdOf(data), kind: "UNLOCK_CHECK", staffPersonId: who.personId });
    return guard.state;
  }
  const actor = guard.actor;
  const exerciseId = exerciseIdOf(data);
  // 20bb: the account's rate is counted before anything is looked up or tried.
  const limited = await officerActRate({ organisationId: actor.organisationId, accountId: actor.accountId, exerciseId, kind: "UNLOCK_CHECK", staffPersonId: actor.personId });
  if (limited) return { ok: false, message: limited };
  const passphrase = text(data, "passphrase");
  if (passphrase.length === 0) return { ok: false, errors: { passphrase: "Enter your unseal passphrase." } };
  if (passphrase.length > MAX_PASSPHRASE_CHARACTERS) return { ok: false, errors: { passphrase: "That passphrase is too long." } };
  // The sign-in password, asked as every act asks it. Nothing is signed: the attribution is never written, only the password checked.
  const begun = await beginAct(actor, data, "OfficerExerciseKey.person", { personField: "personId", onBehalf: false, document: { entity: "SourcingExercise", id: exerciseId } });
  if (!begun.ok) {
    await logSealedRefusal({ organisationId: actor.organisationId, exerciseId, kind: "UNLOCK_CHECK", staffPersonId: actor.personId, reasonCode: "STEP_UP_REFUSED" });
    return begun.state;
  }
  // A restricted exercise the officer may not see reads as one that is not there, before any passphrase is derived or counted (FR-MTD-007).
  if (await exerciseIsHidden(actor, exerciseId)) return { ok: false, message: "That exercise was not found." };
  const unlocked = await unlockOwnKey({ organisationId: actor.organisationId, exerciseId, personId: actor.personId, passphrase, kind: "UNLOCK_CHECK", now: new Date() });
  if (!unlocked.ok) return { ok: false, message: unlockRefusalWords(unlocked) };
  zero(unlocked.privateKey);
  await logSealedGranted({ organisationId: actor.organisationId, exerciseId, kind: "UNLOCK_CHECK", staffPersonId: actor.personId, recordId: unlocked.officerKeyId, at: new Date() });
  return { ok: true, message: "Passphrase unlocks your key. Nothing opened." };
}
