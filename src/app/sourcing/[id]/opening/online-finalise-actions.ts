"use server";

import { revalidatePath } from "next/cache";

import { exerciseIsHidden } from "@/app/_auth/sulit";
import { requireStaff, staffForAct, toAuditActor } from "@/app/_auth/actor";
import { beginAct } from "@/app/_auth/act";
import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { dayIn, dayToDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { loadStorePolicy } from "@/lib/documents/service";
import { signatureFields, OPENING_ENTITY } from "@/lib/opening/audit-view";
import { markFaults } from "@/lib/opening/finalise";
import { doorReason, materialFinding, onlineFinaliseDoorFaults } from "@/lib/opening/online-finalise";
import { gatherFinaliseMaterial, zeroMaterial, type FinaliseMaterial } from "@/lib/opening/online-finalise-store";
import { moveReleasedFiles } from "@/lib/sealing/online-file-mover";
import { findOpening } from "@/lib/opening/sealed-file-store";
import { panelOf, stateOf } from "@/lib/opening/repo";
import { blocking, type Finding } from "@/lib/opening/types";
import { loadUnsealKeys } from "@/lib/opening/unseal-store";
import { zero } from "@/lib/sealing/types";
import { logAdministratorRefusal, logSealedGranted, logSealedRefusal, officerActRate, recordIdOrNull, unlockOwnKey, unlockRefusalWords } from "@/lib/sealing/unlock-store";

import { audit, exerciseIdOf } from "../window/shared";
import { finaliseInTransaction, openingLabel, openingOf } from "./finalise-transaction";
import { GONE_OPENING, inOpening, refuse, stampNow } from "./in-opening";
import { ONLINE_FINALISE_NEEDS_PASSPHRASE, ONLINE_PASSPHRASE_TOO_LONG, ONLINE_SIGNED } from "./online-words";

/**
 * The online finalise (ADR 0036 D10, rulings 20, 20t; build plan step 15). Two acts:
 *
 * `signOnlineFinalise`: each named opening officer signs, in their own sign-in, with the sign-in password asked again. Never recorded for another, never from paper.
 *
 * `finaliseOnline`: any ONE named officer, with the sign-in password and their own unseal passphrase, once every named officer has signed. The order of what is asked: the session and the
 * rate, the password, the exercise visible, the doors (named officer, opening unsealed and not finalised, the class a filed bid takes), the passphrase, and then, outside the transaction, every
 * opened file is decrypted once through the officer's grants to verify its tags (a corrupt blob blocks here, in words, before anything is written). Then one transaction, in the order the
 * triggers need: the faults, the declared figures written, the context read again, the estimate, the snapshots from the prices just written, `finalisedAt`, and each file's data key released.
 * After the commit the mover files the files in the document store. Every refusal after the session is a REFUSED access event, written outside the transaction.
 */

const MAX_PASSPHRASE_CHARACTERS = 1024;
const text = (data: FormData, name: string) => (typeof data.get(name) === "string" ? (data.get(name) as string) : "");
const wordsOf = (fs: readonly Finding[]) => refuse(fs).message;

export async function signOnlineFinalise(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("SIGNATURE");
  if (!guard.ok) {
    const who = await requireStaff();
    await logAdministratorRefusal({ organisationId: who.organisationId, accountId: who.accountId, exerciseId: exerciseIdOf(data), kind: "FINALISE", staffPersonId: who.personId, recordId: text(data, "openingId") });
    return guard.state;
  }
  const actor = guard.actor;
  const exerciseId = exerciseIdOf(data);
  const openingId = text(data, "openingId");
  // 20bb: the account's rate is counted before anything is looked up or tried.
  const limited = await officerActRate({ organisationId: actor.organisationId, accountId: actor.accountId, exerciseId, kind: "FINALISE", staffPersonId: actor.personId, recordId: recordIdOrNull(openingId) });
  if (limited) return { ok: false, message: limited };
  // The officer signs as themselves with the sign-in password asked again; a wrong one counts towards the sign-in lockout.
  const begun = await beginAct(actor, data, "OpeningSignature.person", { personField: "personId", onBehalf: false, document: { entity: "Opening", id: openingId } });
  if (!begun.ok) {
    await logSealedRefusal({ organisationId: actor.organisationId, exerciseId, kind: "FINALISE", staffPersonId: actor.personId, reasonCode: "STEP_UP_REFUSED", recordId: recordIdOrNull(openingId) });
    return begun.state;
  }
  const act = begun.act;
  const now = stampNow();
  if (await exerciseIsHidden(actor, exerciseId)) return GONE_OPENING;
  const refusal = { code: null as string | null };
  const out = await inOpening(actor, exerciseId, now, async (tx, l, c) => {
    const stop = (fs: readonly Finding[]): FormState => {
      refusal.code = blocking(fs)[0]?.code ?? "REFUSED";
      return refuse(fs);
    };
    const o = openingOf(c, openingId);
    if (!o) {
      refusal.code = "NOT_FOUND";
      return GONE_OPENING;
    }
    if (l.ex.submissionChannel !== "ONLINE") return stop([{ code: "NOT_ONLINE", level: "block" }]);
    const personId = act.subjectPersonId;
    const startDay = l.org.timeZone ? dayIn(o.startedAt, l.org.timeZone) : null;
    const fs = markFaults({ state: stateOf(o, l.ex.status), panel: panelOf(o), personId, already: o.signatures.some((s) => s.personId === personId), sameOpening: true, signedOn: { day: l.org.today, today: l.org.today, startDay } });
    if (blocking(fs).length) return stop(fs);
    const seat = o.panel.find((p) => p.personId === personId)!;
    const row = await tx.openingSignature.create({ data: { organisationId: l.org.id, openingId: o.id, personId, panelMemberId: seat.id, signedOn: dayToDate(l.org.today!), recordedAt: now } });
    await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.signature, row.id, openingLabel(l, o), "CREATE", diffFields(null, signatureFields({ person: seat.person.name, signedOn: l.org.today!, seat: seat.seatLabelSnapshot })));
    await act.write(tx, row.id, { document: { entity: "Opening", id: o.id } });
    const signed = new Set([...o.signatures.map((s) => s.personId), personId]);
    const waiting = o.panel.filter((p) => !signed.has(p.personId)).length;
    return { ok: true, message: waiting === 0 ? `${ONLINE_SIGNED} One can now finalise.` : `${ONLINE_SIGNED} ${waiting} still to sign.` };
  });
  if (out.ok) revalidatePath(`/sourcing/${exerciseId}`);
  else if (refusal.code) await logSealedRefusal({ organisationId: actor.organisationId, exerciseId, kind: "FINALISE", staffPersonId: actor.personId, reasonCode: refusal.code, recordId: recordIdOrNull(openingId) });
  return out;
}

export async function finaliseOnline(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("UNSEAL");
  if (!guard.ok) {
    const who = await requireStaff();
    await logAdministratorRefusal({ organisationId: who.organisationId, accountId: who.accountId, exerciseId: exerciseIdOf(data), kind: "FINALISE", staffPersonId: who.personId, recordId: text(data, "openingId") });
    return guard.state;
  }
  const actor = guard.actor;
  const exerciseId = exerciseIdOf(data);
  const openingId = text(data, "openingId");
  const passphrase = text(data, "passphrase");
  const refused = (reasonCode: string) => logSealedRefusal({ organisationId: actor.organisationId, exerciseId, kind: "FINALISE", staffPersonId: actor.personId, reasonCode, recordId: recordIdOrNull(openingId) });

  // 20bb: the account's rate is counted before anything is looked up or tried.
  const limited = await officerActRate({ organisationId: actor.organisationId, accountId: actor.accountId, exerciseId, kind: "FINALISE", staffPersonId: actor.personId, recordId: recordIdOrNull(openingId) });
  if (limited) return { ok: false, message: limited };
  if (passphrase.length === 0) return { ok: false, errors: { passphrase: ONLINE_FINALISE_NEEDS_PASSPHRASE } };
  if (passphrase.length > MAX_PASSPHRASE_CHARACTERS) return { ok: false, errors: { passphrase: ONLINE_PASSPHRASE_TOO_LONG } };

  // The sign-in password, asked again. A wrong one counts towards the sign-in lockout and is written on its own.
  const begun = await beginAct(actor, data, "EstimateEvent.person", { personField: "personId", onBehalf: false, document: { entity: "Opening", id: openingId } });
  if (!begun.ok) {
    await refused("STEP_UP_REFUSED");
    return begun.state;
  }
  const act = begun.act;
  const now = stampNow();

  // A restricted exercise the officer may not see reads as one that is not there, before any passphrase is derived or counted (FR-MTD-007).
  if (await exerciseIsHidden(actor, exerciseId)) return GONE_OPENING;

  // The doors, judged before the passphrase is tried, so a refusal here costs the officer nothing.
  const opening = await findOpening(actor.organisationId, openingId);
  if (!opening || opening.exerciseId !== exerciseId) {
    await refused("NOT_FOUND");
    return GONE_OPENING;
  }
  const exercise = await db.sourcingExercise.findFirst({ where: { id: exerciseId, organisationId: actor.organisationId }, select: { submissionChannel: true, status: true } });
  const named = await db.exerciseOpeningOfficer.findFirst({ where: { exerciseId, organisationId: actor.organisationId, personId: actor.personId, endedAt: null }, select: { id: true } });
  const officers = await db.exerciseOpeningOfficer.count({ where: { exerciseId, organisationId: actor.organisationId, endedAt: null } });
  const policy = await loadStorePolicy(actor.organisationId);
  const fileClass = policy.onlineBidFileClassId ? await db.documentClass.findFirst({ where: { id: policy.onlineBidFileClassId, organisationId: actor.organisationId }, select: { classification: true } }) : null;
  // Ruling 20t: every named officer has signed before anything is tried or opened. Read before the passphrase, so no grant is opened until all have.
  const roster = await db.openingPanelMember.findMany({ where: { openingId, organisationId: actor.organisationId }, select: { personId: true } });
  const signedBy = new Set((await db.openingSignature.findMany({ where: { openingId, organisationId: actor.organisationId }, select: { personId: true } })).map((s) => s.personId));
  const doors = onlineFinaliseDoorFaults({
    channel: exercise?.submissionChannel ?? null, actorIsAdministrator: actor.isAdministrator, actorIsNamedOfficer: !!named, unsealed: opening.unsealedAt != null, finalised: opening.finalisedAt != null,
    cancelled: exercise?.status === "CANCELLED", fileClassSet: policy.onlineBidFileClassId != null, fileClassSulit: fileClass?.classification === "SULIT",
    allSigned: roster.length > 0 && roster.every((p) => signedBy.has(p.personId)), officers,
  });
  if (doors.length > 0) {
    await refused(doorReason(doors));
    return { ok: false, message: wordsOf(doors) };
  }

  const unlocked = await unlockOwnKey({ organisationId: actor.organisationId, exerciseId, personId: actor.personId, passphrase, kind: "FINALISE", now, recordId: recordIdOrNull(openingId) });
  if (!unlocked.ok) return { ok: false, message: unlockRefusalWords(unlocked) };
  let material: FinaliseMaterial | null = null;
  try {
    // Outside the transaction: every opened file decrypted once through this officer's grants and discarded (M5), the declarations and the lodged estimate read.
    const gathered = await gatherFinaliseMaterial({ organisationId: actor.organisationId, exerciseId, openingId, officerKeyId: unlocked.officerKeyId, privateKey: unlocked.privateKey });
    if (!gathered.ok) {
      await refused(gathered.fault);
      return { ok: false, message: wordsOf([materialFinding(gathered.fault, gathered.listingNo)]) };
    }
    material = gathered.material;
    const refusal = { code: null as string | null };
    const out = await inOpening(
      actor,
      exerciseId,
      now,
      async (tx, l, c) => {
        const o = openingOf(c, openingId);
        if (!o) {
          refusal.code = "NOT_FOUND";
          return GONE_OPENING;
        }
        const keysRead = await loadUnsealKeys(tx, l.org.id, l.ex.id);
        if (!keysRead.ok) {
          refusal.code = keysRead.fault;
          return refuse([{ code: keysRead.fault, level: "block" }]);
        }
        const me = keysRead.keys.officers.find((x) => x.personId === actor.personId);
        if (!me) {
          refusal.code = "NOT_NAMED_OFFICER";
          return refuse([{ code: "NOT_NAMED_OFFICER", level: "block" }]);
        }
        // The key unlocked is the live one: the officer may have set a new share between the unlock and the lock this transaction holds.
        if (me.officerKeyId !== unlocked.officerKeyId) {
          refusal.code = "OFFICER_KEY_CHANGED";
          return refuse([{ code: "OFFICER_KEY_CHANGED", level: "block" }]);
        }
        const panelPeople = new Set(o.panel.map((p) => p.personId));
        if (panelPeople.size !== keysRead.keys.officers.length || keysRead.keys.officers.some((x) => !panelPeople.has(x.personId))) {
          refusal.code = "NOT_ON_PANEL_ONLINE";
          return refuse([{ code: "NOT_ON_PANEL_ONLINE", level: "block" }]);
        }
        // Everyone named has signed: the faults say so by name; this keeps the reason code for the access log.
        const result = await finaliseInTransaction(tx, l, c, { actor, act, now, openingId, personId: act.subjectPersonId, paperChoice: "", paperRaw: "", data, online: { material: material!, onFault: (code) => (refusal.code = code) } });
        if (!result.ok && !refusal.code) refusal.code = "REFUSED";
        return result;
      },
      // The declared prices are written here, so the SULIT price-write check applies as it does to every paper price write (a writer the prices are closed to is refused and logged).
      { estimate: true, prices: actor },
    );
    if (!out.ok) {
      if (refusal.code) await refused(refusal.code);
      return out;
    }
    revalidatePath(`/sourcing/${exerciseId}`);
    revalidatePath("/sourcing");
    await logSealedGranted({ organisationId: actor.organisationId, exerciseId, kind: "FINALISE", staffPersonId: actor.personId, recordId: openingId, at: now });
    // After the commit: the mover files the released files. A failure here never undoes the finalise: what is left stays released and is moved by the next call.
    try {
      const moved = await moveReleasedFiles({ organisationId: actor.organisationId, exerciseId });
      if (moved.remaining > 0) return { ok: true, message: `${out.message ?? "Finalised."} ${moved.remaining} file${moved.remaining === 1 ? "" : "s"} still to file.` };
    } catch {
      return { ok: true, message: `${out.message ?? "Finalised."} Some files still to file.` };
    }
    return out;
  } finally {
    zero(unlocked.privateKey);
    zeroMaterial(material);
  }
}

/**
 * Files the sealed bid files of a finalised online exercise that the post-commit mover left (a store outage, a file past one call's bound). A named opening officer, no passphrase: the data keys
 * were released at the finalise and the mover works from them. Idempotent and bounded (`moveReleasedFiles`); every file it moves writes its own audit rows.
 */
export async function fileSealedBidFiles(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("UNSEAL");
  if (!guard.ok) {
    const who = await requireStaff();
    await logAdministratorRefusal({ organisationId: who.organisationId, accountId: who.accountId, exerciseId: exerciseIdOf(data), kind: "FINALISE", staffPersonId: who.personId, recordId: text(data, "openingId") });
    return guard.state;
  }
  const actor = guard.actor;
  const exerciseId = exerciseIdOf(data);
  if (await exerciseIsHidden(actor, exerciseId)) return GONE_OPENING;
  const named = await db.exerciseOpeningOfficer.findFirst({ where: { exerciseId, organisationId: actor.organisationId, personId: actor.personId, endedAt: null }, select: { id: true } });
  const exercise = await db.sourcingExercise.findFirst({ where: { id: exerciseId, organisationId: actor.organisationId }, select: { submissionChannel: true } });
  if (!exercise || exercise.submissionChannel !== "ONLINE") return GONE_OPENING;
  if (!named) return { ok: false, message: "Only a named opening officer can file these." };
  let moved: Awaited<ReturnType<typeof moveReleasedFiles>>;
  try {
    moved = await moveReleasedFiles({ organisationId: actor.organisationId, exerciseId });
  } catch {
    return { ok: false, message: "Filing failed. Nothing lost. Try again." };
  }
  revalidatePath(`/sourcing/${exerciseId}`);
  if (moved.remaining > 0) return { ok: false, message: `${moved.moved} filed. ${moved.remaining} cannot be filed. Check Configuration › Documents.` };
  return { ok: true, message: moved.moved > 0 ? `${moved.moved} file${moved.moved === 1 ? "" : "s"} filed.` : "Every file is already filed." };
}
