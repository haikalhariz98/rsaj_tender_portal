"use server";

import { revalidatePath } from "next/cache";

import { attributionRefusalState, beginAct } from "@/app/_auth/act";
import { requireStaff, staffForAct, toAuditActor } from "@/app/_auth/actor";
import { exerciseIsHidden } from "@/app/_auth/sulit";
import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import type { Reader } from "@/lib/auth/sulit-store";
import type { AuditActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { rosterChange } from "@/lib/opening/roster";
import { withLockedExerciseScope, type LockedExercise } from "@/lib/scope/lock";
import { transactionTimedOut } from "@/lib/scope/tx-timeout";
import { logCeremonyEvent, logCeremonyRefusal, sealedSqlState } from "@/lib/sealing/store";
import { AMBIGUOUS_SUBSTITUTION_WORDS, SUBSTITUTION_WORDS, substitutionFaults } from "@/lib/sealing/substitution";
import { loadPendingSubstitution, transferShare } from "@/lib/sealing/substitution-store";
import { logAdministratorRefusal, logSealedRefusal, officerActRate, unlockOwnKey, unlockRefusalWords } from "@/lib/sealing/unlock-store";
import { zero } from "@/lib/sealing/types";

/**
 * The second half of a substitution after publication (ADR 0036 D11, ruling 11; build plan step 17). An authority has named the incoming officer in the departing officer's place
 * (`substituteOpeningOfficer`) and the incoming officer has set their own share (`setOfficerShare`). Here the departing officer, who is no longer named and holds the key until this act, releases
 * their share to the incoming officer, with the sign-in password asked again and their own unseal passphrase. Nobody else can: the share is opened only with the departing officer's private key.
 *
 * The slow work (the passphrase's key derivation) runs before the transaction. The transaction then locks the exercise, re-reads what is waiting, re-runs the pure rule and writes the release,
 * the incoming officer's share, the shred of the departing share, the retirement of the departing officer's key and their audit entries together, or none of them. Administrator accounts are refused
 * and the refusal logged (S19, 20w). The account's rate is counted first (20bb).
 */

const GONE: FormState = { ok: false, message: "This exercise could not be found." };
const MAX_PASSPHRASE_CHARACTERS = 1024;
const exerciseIdOf = (data: FormData) => String(data.get("exerciseId") ?? "");
const text = (data: FormData, name: string) => (typeof data.get(name) === "string" ? (data.get(name) as string) : "");

async function audit(tx: Tx, actor: AuditActor, orgId: string, entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE", changes: ReturnType<typeof diffFields>, reason = "") {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { actor, organisationId: orgId, entity, entityId, entityLabel, reason }, action, changes);
}

/// What the database refused, in words. PA026 is a substitution the trigger would not license (the closing has passed, or the keys are not the exercise's).
function refusedByDatabase(e: unknown): FormState | null {
  const code = sealedSqlState(e);
  if (code === "PA026") return { ok: false, message: `Nothing was saved. ${SUBSTITUTION_WORDS.AFTER_CLOSING_RETENDER}` };
  if (code === "PA014") return { ok: false, message: "Nothing was saved: a sealed record never changes once written. Reload and try again." };
  return null;
}

async function inExercise(scope: Reader, exerciseId: string, fn: (tx: Tx, l: LockedExercise) => Promise<FormState>): Promise<FormState> {
  let result: FormState | null;
  try {
    result = await withLockedExerciseScope(scope, exerciseId, fn);
  } catch (e) {
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

/// The departing officer releases their share to the incoming officer. Allowed only to them, before the closing, once the incoming officer has set their own share.
export async function releaseShareForSubstitution(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("UNSEAL");
  const exerciseId = exerciseIdOf(data);
  if (!guard.ok) {
    const who = await requireStaff();
    await logAdministratorRefusal({ organisationId: who.organisationId, accountId: who.accountId, exerciseId, kind: "SUBSTITUTION_RELEASE", staffPersonId: who.personId });
    return guard.state;
  }
  const actor = guard.actor;
  // 20bb: the account's rate is counted before anything is looked up or tried.
  const limited = await officerActRate({ organisationId: actor.organisationId, accountId: actor.accountId, exerciseId, kind: "SUBSTITUTION_RELEASE", staffPersonId: actor.personId });
  if (limited) return { ok: false, message: limited };
  // A restricted exercise the officer may not see reads as one that is not there, before anything about it is looked up (FR-MTD-007).
  if (await exerciseIsHidden(actor, exerciseId)) return { ok: false, message: "That exercise was not found." };
  const refuse = async (reasonCode: string, message: string): Promise<FormState> => {
    await logCeremonyRefusal(db, { organisationId: actor.organisationId, exerciseId, kind: "SUBSTITUTION_RELEASE", staffPersonId: actor.personId, reasonCode });
    return { ok: false, message };
  };
  const passphrase = text(data, "passphrase");
  if (passphrase.length === 0) return { ok: false, errors: { passphrase: "Enter your unseal passphrase." } };
  if (passphrase.length > MAX_PASSPHRASE_CHARACTERS) return { ok: false, errors: { passphrase: "That passphrase is too long." } };

  // What is waiting, read before the password is asked: a release nobody is waiting for, or one that is not this person's to make, never reaches the passphrase.
  const waiting = await db.sourcingExercise.findFirst({ where: { id: exerciseId, organisationId: actor.organisationId }, select: { id: true } });
  if (!waiting) return GONE;
  const { pending } = await loadPendingSubstitution(db, actor.organisationId, exerciseId);
  if (pending.state === "AMBIGUOUS") return refuse("AMBIGUOUS", AMBIGUOUS_SUBSTITUTION_WORDS);
  if (pending.state === "NONE") return refuse("NOTHING_WAITING", "No substitution is waiting.");
  if (pending.departing.personId !== actor.personId) return refuse("DEPARTING_MUST_RELEASE", SUBSTITUTION_WORDS.DEPARTING_MUST_RELEASE);
  if (!pending.incoming.hasKey) return refuse("INCOMING_KEY_NOT_SET", SUBSTITUTION_WORDS.INCOMING_KEY_NOT_SET);

  // The sign-in password, asked again (a wrong one counts towards the lockout and is written on its own).
  const begun = await beginAct(actor, data, "ShareRelease.releasedBy", { personField: "personId", onBehalf: false, document: { entity: "SourcingExercise", id: exerciseId } });
  if (!begun.ok) {
    await logSealedRefusal({ organisationId: actor.organisationId, exerciseId, kind: "SUBSTITUTION_RELEASE", staffPersonId: actor.personId, reasonCode: "STEP_UP_REFUSED" });
    return begun.state;
  }
  const act = begun.act;
  // The slow part, outside the transaction: the officer's own key, unlocked with their own passphrase (a wrong one is counted on the key's own lockout).
  const unlocked = await unlockOwnKey({ organisationId: actor.organisationId, exerciseId, personId: actor.personId, passphrase, kind: "SUBSTITUTION_RELEASE", now: new Date(), rosterRowId: pending.departing.rosterRowId });
  if (!unlocked.ok) return { ok: false, message: unlockRefusalWords(unlocked) };

  let refusedCode: string | null = null;
  try {
    const out = await inExercise(actor, exerciseId, async (tx, l) => {
      const now = new Date();
      const again = await loadPendingSubstitution(tx, l.org.id, exerciseId);
      const p = again.pending;
      if (p.state !== "PENDING" || again.keyId === null || p.departing.officerKeyId !== unlocked.officerKeyId || p.departing.personId !== actor.personId) {
        refusedCode = "CHANGED";
        return { ok: false, message: "Not saved: the substitution changed. Reload." };
      }
      const openingStarted = (await tx.opening.count({ where: { exerciseId } })) > 0;
      const change = rosterChange({ status: l.ex.status, closing: l.ex.closingAt, now, openingStarted });
      const faults = substitutionFaults({ change: change.change, incomingHasKey: p.incoming.hasKey, departingIsActor: true, keyLive: true });
      if (faults.length) {
        refusedCode = faults[0];
        return { ok: false, message: `Nothing was saved: ${faults.map((f) => SUBSTITUTION_WORDS[f]).join(" ")}` };
      }
      const roster = await tx.exerciseOpeningOfficer.findFirstOrThrow({ where: { id: p.departing.rosterRowId, organisationId: l.org.id }, select: { seatLabelSnapshot: true } });
      const moved = await transferShare(tx, { organisationId: l.org.id, exerciseId, keyId: again.keyId, departing: p.departing, incoming: p.incoming, privateKey: unlocked.privateKey, byPersonId: actor.personId, now });
      const label = (what: string) => `${l.ex.reference} · ${what}`;
      const who = toAuditActor(actor);
      await audit(tx, who, l.org.id, "ShareRelease", moved.releaseId, label(`Share released · ${p.departing.name} to ${p.incoming.name}`), "CREATE", diffFields(null, { from: p.departing.name, to: p.incoming.name, purpose: "Substitution", sharesMoved: 1 }));
      await audit(tx, who, l.org.id, "ExerciseKeyShare", moved.oldShareId, label(`Share · ${p.departing.name}`), "UPDATE", diffFields({ share: `Held by ${p.departing.name}` }, { share: `Released to ${p.incoming.name}, live copy destroyed (a backup taken before now still holds it)` }));
      await audit(tx, who, l.org.id, "OfficerExerciseKey", moved.departingOfficerKeyId, label(`Key · ${p.departing.name}`), "UPDATE", diffFields({ key: "In force" }, { key: "Retired: the officer released their share" }));
      await audit(tx, who, l.org.id, "SourcingExercise", exerciseId, label("Exercise key"), "UPDATE", diffFields({ keyHeldBy: p.departing.name }, { keyHeldBy: p.incoming.name }), "A substitution was completed");
      await logCeremonyEvent(tx, { organisationId: l.org.id, exerciseId, kind: "SUBSTITUTION_RELEASE", staffPersonId: actor.personId, recordId: moved.releaseId, at: now });
      await act.write(tx, moved.releaseId, { document: { entity: "ExerciseOpeningOfficer", id: p.departing.rosterRowId }, roleCode: roster.seatLabelSnapshot });
      return { ok: true, message: `Share released to ${p.incoming.name}. Your live copy is destroyed. A backup taken before now still holds it.` };
    });
    if (!out.ok && refusedCode) await logCeremonyRefusal(db, { organisationId: actor.organisationId, exerciseId, kind: "SUBSTITUTION_RELEASE", staffPersonId: actor.personId, reasonCode: refusedCode });
    return out;
  } finally {
    zero(unlocked.privateKey);
  }
}
