/**
 * Writing what came back (FR-AWD-003, FR-AWD-008; wave V plan V2): the core the paper path (`recordReturn`, src/app/awards/actions.ts) and the verify act of an online return
 * (`online-return-store.ts`) share, so neither restates a rule. Under the award's lock, which the caller holds, in the caller's transaction:
 *
 * - the time zone, and the SULIT write refusal on the identity card number (it is written, and an edit that left it out would erase it, so it is done by someone it is open to,
 *   and the access is logged);
 * - the award issued (or, correcting an accepted award's return, the correction's reason given);
 * - WV-4: no return lodged online waiting, read fresh in the transaction, so the verify act passes once it has marked its row verified;
 * - each received day not before the instrument was issued and not after today, and the person who received it on record and active;
 * - FR-AWD-006: a work indent's acceptance received after the indent expired is not taken (`indentReturnLate`), judged on the received day; on a correction only when that
 *   day changes, so an award accepted before the rule is not reopened;
 * - the caller's own check, before anything is written (the paper correction's scans);
 * - the update and its audit pair, the IC number masked.
 *
 * It does not accept the award: each caller calls `acceptOnCompleteReturn` itself, `recordReturn` at once and the verify act after its attaches. Nor does it write the
 * attribution: the caller's act does (`AwardReturn.receivedBy`). A refusal writes nothing and comes back as the form's state.
 */

import type { FormState } from "@/components/record-editor";
import { auditActorOfStaff } from "@/lib/auth/audit-actor";
import { sulitWriteRefusal } from "@/lib/auth/sulit-store";
import type { StaffActor } from "@/lib/auth/types";
import { dayOrNull, dayToDate, storedDay } from "@/lib/dates";
import type { Tx } from "@/lib/db";
import { formatDate } from "@/lib/format";

import { awardAuditPair } from "./audit-view";
import { indentLateWords, indentReturnLate } from "./indent";
import { loadAwardPolicy, type LoadedAward } from "./repo";
import { audit, NO_ZONE } from "./route-write";
import type { ReturnRecord } from "./stage-two";

/// The fields a save writes: the record, where the originals are held, and who received it.
export type ReturnWrite = ReturnRecord & { whereHeld: string };

export type ReturnSaved = { ok: true; rec: ReturnRecord; returnId: string } | { ok: false; state: FormState };

const DAY_FIELDS = ["signedLetterReceivedOn", "declarationReceivedOn", "authorisationReceivedOn"] as const;

export async function saveReturn(
  tx: Tx,
  actor: StaffActor,
  l: LoadedAward,
  i: {
    values: ReturnWrite;
    /// The person who received it (the act's subject), or null.
    receivedByPersonId: string | null;
    /// The reason for correcting an accepted award's return (BD-24); empty otherwise.
    correction: string;
    /// The caller's own refusal, judged after the fields and before the write. Null: none.
    check?: (rec: ReturnRecord) => Promise<FormState | null>;
  },
): Promise<ReturnSaved> {
  const a = l.award;
  const no = (state: FormState): ReturnSaved => ({ ok: false, state });
  if (!l.org.today) return no(NO_ZONE);
  const closed = await sulitWriteRefusal(tx, actor, { scope: "exercise", exerciseId: a.exerciseId }, ["icNumber"]);
  if (closed) return no({ ok: false, message: `Nothing was saved: the identity card number is SULIT and is closed to you. ${closed}` });
  // An accepted award's return may be corrected, with a reason, but never left incomplete.
  const correcting = a.status === "ACCEPTED";
  if (!(a.status === "ISSUED" || correcting) || !a.awardReturn || !a.issuedAt) return no({ ok: false, message: "The return is recorded once the instrument is issued." });
  if (correcting && !i.correction) return no({ ok: false, errors: { reason: "Say why the return is corrected." } });
  // WV-4: paper and online are not mixed. Read in this transaction, so the verify act, which marks its row first, is not refused by its own return.
  const waiting = await tx.awardOnlineReturn.findFirst({ where: { awardId: a.id, organisationId: l.org.id, verifiedAt: null, refusedAt: null }, select: { submittedOn: true } });
  if (waiting) return no({ ok: false, message: `The contractor sent the return online on ${formatDate(waiting.submittedOn)}. Verify or refuse it first; paper and online are not mixed.` });
  const issued = storedDay(a.issuedAt);
  const v = i.values;
  const errors: Record<string, string> = {};
  for (const k of DAY_FIELDS) {
    const x = v[k];
    if (x && x > l.org.today) errors[k] = "Not after today.";
    else if (x && x < issued) errors[k] = "Not before the instrument was issued.";
  }
  let receivedBy: { id: string; name: string } | null = null;
  if (i.receivedByPersonId) {
    receivedBy = await tx.person.findFirst({ where: { id: i.receivedByPersonId, organisationId: l.org.id, isActive: true }, select: { id: true, name: true } });
    if (!receivedBy) errors.receivedByPersonId = "Choose someone on record and active.";
  }
  if (Object.keys(errors).length) return no({ ok: false, errors });
  // FR-AWD-006 (product owner ruling, 2026-10-24): refused here as the day is saved, paper and online alike. A scan attached later is judged again on the stored day
  // (`indentLateOf`, documents/owners.ts): the validity may have been set since, or the day saved before this rule.
  const receivedOn = v.signedLetterReceivedOn;
  if (a.instrumentKind === "WORK_INDENT" && receivedOn && (!correcting || receivedOn !== dayOrNull(a.awardReturn.signedLetterReceivedOn))) {
    const late = indentReturnLate(dayOrNull(a.indentReceivedOn), (await loadAwardPolicy(l.org.id, tx)).indentValidityDays, receivedOn);
    if (late) return no({ ok: false, message: indentLateWords(late, receivedOn, true) });
  }
  const rec: ReturnRecord = { ...v };
  delete (rec as Partial<ReturnWrite>).whereHeld;
  const refused = i.check ? await i.check(rec) : null;
  if (refused) return no(refused);
  const before = a.awardReturn;
  const data = {
    ...v,
    signedLetterReceivedOn: v.signedLetterReceivedOn ? dayToDate(v.signedLetterReceivedOn) : null,
    declarationReceivedOn: v.declarationReceivedOn ? dayToDate(v.declarationReceivedOn) : null,
    authorisationReceivedOn: v.authorisationReceivedOn ? dayToDate(v.authorisationReceivedOn) : null,
    receivedByPersonId: i.receivedByPersonId,
  };
  await tx.awardReturn.update({ where: { id: before.id, award: { organisationId: actor.organisationId } }, data });
  const view = (x: Record<string, unknown>) => ({ ...x, receivedByPersonId: undefined, receivedBy: x.receivedByPersonId ? (x.receivedByPersonId === receivedBy?.id ? receivedBy?.name : before.receivedBy?.name) : null });
  await audit(tx, auditActorOfStaff(actor), l.org.id, "AwardReturn", before.id, `${a.reference} · return`, "UPDATE", awardAuditPair(view(before), view({ ...before, ...data })), correcting ? `Corrected: ${i.correction}` : "");
  return { ok: true, rec, returnId: before.id };
}
