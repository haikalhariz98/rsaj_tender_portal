/**
 * The online award return and the contractor's questions, as acts (ADR 0045 D1, D3, D4; wave V plan V2). Every act runs under the award's lock, in one transaction, with its
 * audit rows, its attribution and its notices; a refusal writes nothing.
 *
 * The contractor's two acts (`lodgeOnlineReturn`, `askAwardQuery`) run inside `inHeldContract`: the contract held by the session's supplier, locked in the canonical order
 * (requisition, exercise, award, contract), the same "not found" for every other case, the supplier's standing asked, and the organisation's day read once. They throw
 * `AwardReturnRefused` (or the held contract's `ProjectRefused`); the portal routes (V3) turn either into an answer.
 *
 * The officer's three acts (`verifyOnlineReturn`, `refuseOnlineReturn`, `answerAwardQuery`) run inside `withLockedAwardFor` (an award of a restricted exercise reads as gone to
 * anyone not named on it, logged), take the act the server action began (`beginAct`), and answer as the form's state.
 *
 * Verifying is one act (ADR 0045 D1): the row is marked verified first (while it waits, the award's owner facts freeze its return purposes, WV-4), the `AwardReturn` is written
 * through the paper path's core (`saveReturn`), each scan is attached to the award under its purpose through the staff attach's core (`attachToLockedOwner`), and
 * `acceptOnCompleteReturn` accepts the award. The award owner's `afterChange` runs on each attach with the award as loaded before the write, so it accepts nothing; if it ever
 * did, the final guarded update changes nothing. Anything short of an accepted award, an incomplete return included, rolls the whole act back, the verified mark with it.
 * One stored version is then held by both the return and the award: nothing refuses that outside the project files' one-pin index.
 */

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import type { PreparedAct } from "@/lib/auth/act-begin";
import { auditActorOfStaff } from "@/lib/auth/audit-actor";
import { sulitWriteDecision, sulitWriteRefusal } from "@/lib/auth/sulit-store";
import { attributeSupplierAct } from "@/lib/auth/supplier-attribution-store";
import type { StaffActor, SupplierActor } from "@/lib/auth/types";
import { caseHref } from "@/lib/contract/links";
import type { LoadedContract } from "@/lib/contract/repo";
import { dayToDate, storedDay } from "@/lib/dates";
import { db, type Tx } from "@/lib/db";
import { awardReturnClassFault } from "@/lib/documents/award-return-class";
import { attachToLockedOwner } from "@/lib/documents/attach-store";
import { attached, filed } from "@/lib/documents/audit-view";
import { isLive } from "@/lib/documents/evidence";
import { PURPOSE_LABEL } from "@/lib/documents/labels";
import { lockDocument } from "@/lib/documents/lock";
import { awardLockedOwner } from "@/lib/documents/owners";
import { STAGED_FOR_AWARD_RETURN } from "@/lib/documents/staged-for";
import { loadStorePolicy } from "@/lib/documents/service";
import type { AttachmentPurpose } from "@/lib/documents/types";
import { awardReturnNotices } from "@/lib/inbox/notices";
import { writeNotices } from "@/lib/inbox/store";
import { contractorSigningFaultOf } from "@/lib/portal/projects/signing-store";
import { inHeldContract, supplierAuditActor } from "@/lib/portal/projects/submission-store";

import { awardAuditCreate } from "./audit-view";
import { loadEventPlan } from "./clock-notices";
import { RETURN_SLOT_LABEL } from "./labels";
import { answerFaults, askFaults, lodgeFaults, onlineReturnState, paperStarted, refuseFaults, returnRecordFromOnline, stagedReturnFileFaults, verifyFaults, type OnlineReturnPage, type OnlineReturnPageInput, type StagedReturnFile } from "./online-return";
import { AwardReturnRefused, awardReturnFaultsText, type AwardReturnFault } from "./online-return-words";
import { withLockedAwardFor, type LoadedAward } from "./repo";
import { onlineReturnWithheld, WITHHELD_WORDS, withheldForTrail } from "./return-withheld";
import { acceptOnCompleteReturn, returnRecordOf } from "./return-acceptance";
import { saveReturn } from "./return-store";
import { audit, labelOf, Refusal } from "./route-write";
import { RETURN_SCANS } from "./stage-two";
import type { Finding, InstrumentKind } from "./types";

/// The configuration keys of the two events (`NOTIFICATION_EVENTS`).
export const AWARD_RETURN_EVENT_KEY = { AWARD_RETURN_LODGED: "award.return.lodged", AWARD_QUERY_RAISED: "award.query.raised" } as const;

// One answer for a row that is not there and for an award gone or closed to the officer (security review L5): neither tells the other apart.
const RETURN_GONE: FormState = { ok: false, message: "That return is not on record." };
const QUERY_GONE: FormState = { ok: false, message: "That question is not on record." };

const statusOf = (fs: readonly Finding<AwardReturnFault>[]): 403 | 409 | 422 | 429 =>
  fs.some((f) => f.code === "NOT_SIGNING_AUTHORITY") ? 403 : fs.some((f) => f.code === "ALREADY_WAITING") ? 409 : fs.some((f) => f.code === "TOO_MANY_OPEN") ? 429 : 422;
const refuseContractor = (fs: readonly Finding<AwardReturnFault>[]): never => {
  throw new AwardReturnRefused(fs, statusOf(fs));
};

/// The case's Return tab, where both notices open (the Award stage; the case is addressed by its contract once there is one).
const returnTab = (l: LoadedAward) => caseHref({ awardId: l.award.id, contractId: l.award.contract?.id ?? null }, { stage: "award", tab: "return" });

/// The award's live return scans, as the award was loaded under the lock.
const liveReturnScans = (a: LoadedAward["award"]) => a.attachments.filter((x) => (RETURN_SCANS.LETTER_OF_ACCEPTANCE as readonly string[]).concat(RETURN_SCANS.WORK_INDENT).includes(x.purpose) && isLive(x)).length;

async function tellOffices(tx: Tx, l: LoadedAward, today: string, kind: "AWARD_RETURN_LODGED" | "AWARD_QUERY_RAISED", subjectId: string): Promise<void> {
  const plan = await loadEventPlan(tx, { organisationId: l.org.id, organisationCode: l.org.code, requestingUnitCode: l.req.requestingUnitCode, namedPartyId: l.ex.personInChargeId, today, eventKey: AWARD_RETURN_EVENT_KEY[kind] });
  await writeNotices(tx, l.org.id, null, awardReturnNotices({ kind, subjectId, awardLabel: labelOf(l.award), contractorName: l.award.awardeeName, exerciseId: l.ex.id, href: returnTab(l), recipients: plan.recipientIds }));
}

// ------------------------------------------------------------------ the contractor lodges

export interface LodgeInput {
  contractId: string;
  /// Each scan the instrument takes, with the store version staged for it (`storeReturnFile`).
  files: Readonly<Record<string, string>>;
  /// A work indent's acceptance page, its signatory named by contact id (M1); null for a Letter of Acceptance.
  page: OnlineReturnPageInput | null;
  /// The moment the password was asked again (`confirmSupplierPassword`). The lodge is a signed act.
  stepUpAt: Date | null;
}

export async function lodgeOnlineReturn(actor: SupplierActor, i: LodgeInput, now: Date = new Date()): Promise<{ onlineReturnId: string }> {
  return inHeldContract(actor, i.contractId, async (tx, l: LoadedContract, today) => {
    const a = l.award;
    const kind = a.instrumentKind as InstrumentKind;
    const policy = await loadStorePolicy(l.org.id, tx);
    const cls = policy.awardReturnClassId ? await tx.documentClass.findFirst({ where: { id: policy.awardReturnClassId, organisationId: l.org.id }, select: { classification: true } }) : null;
    const scans = Object.keys(i.files);
    // Security review M1: the signatory is a current contact of this supplier who signs for it, read here under the lock. Its name is written, never one the browser sent.
    let typed: OnlineReturnPage | null = null;
    if (i.page) {
      const { signatoryContactId, ...rest } = i.page;
      const signer = await tx.supplierContact.findFirst({ where: { id: signatoryContactId, supplierId: actor.supplierId, organisationId: l.org.id, retiredOn: null, authorisedToSignForContractor: true }, select: { name: true } });
      if (!signer) return refuseContractor([{ code: "SIGNATORY_UNKNOWN", level: "block" }]);
      typed = { ...rest, signatoryName: signer.name };
    }
    const faults = lodgeFaults(
      {
        awardStatus: a.status,
        instrument: kind,
        today,
        paperStarted: paperStarted(a.awardReturn ? returnRecordOf(a.awardReturn) : null, liveReturnScans(a)),
        waiting: onlineReturnState(a.onlineReturns) === "WAITING",
        classSet: !!policy.awardReturnClassId && awardReturnClassFault(cls) === null,
        signingFault: await contractorSigningFaultOf(tx, actor),
      },
      { scans, page: typed },
    );
    if (faults.length) refuseContractor(faults);

    // Each staged scan: its store document locked first (in id order, as every attach takes them), then read and judged (ADR 0045 D1). Only a version this account staged for
    // a return is read or locked at all (security review L3): any other id, of whatever owner, reads as not there.
    const own = { organisationId: l.org.id, recordedBySupplierAccountId: actor.accountId, recordedByPersonId: null, document: { stagedFor: STAGED_FOR_AWARD_RETURN } };
    const read = async (versionId: string) => tx.documentVersion.findFirst({ where: { id: versionId, ...own }, select: { id: true, documentId: true, versionNo: true, sha256: true, withdrawnAt: true, recordedByPersonId: true, recordedBySupplierAccountId: true, _count: { select: { attachments: true } }, document: { select: { id: true, title: true, status: true, stagedFor: true, documentClassId: true } } } });
    const docIds = new Set<string>();
    for (const versionId of Object.values(i.files)) {
      const v = await read(versionId);
      if (v) docIds.add(v.documentId);
    }
    for (const d of [...docIds].sort()) await lockDocument(tx, d);
    const files: { scan: string; v: Awaited<ReturnType<typeof read>> }[] = [];
    for (const scan of scans) files.push({ scan, v: await read(i.files[scan]!) });
    const staged: StagedReturnFile[] = files.map(({ scan, v }) => ({
      scan,
      versionId: v?.id ?? i.files[scan]!,
      known: !!v,
      stagedFor: v?.document.stagedFor ?? null,
      recordedByPersonId: v?.recordedByPersonId ?? null,
      recordedBySupplierAccountId: v?.recordedBySupplierAccountId ?? null,
      attachments: v?._count.attachments ?? 0,
      withdrawn: !!v?.withdrawnAt,
      documentClassId: v?.document.documentClassId ?? "",
    }));
    const fileFaults = stagedReturnFileFaults(staged, actor.accountId, policy.awardReturnClassId!);
    if (fileFaults.length) refuseContractor(fileFaults);

    const page = kind === "WORK_INDENT" && typed ? { ...typed, signatoryName: typed.signatoryName.trim(), icNumber: typed.icNumber.trim(), occupation: typed.occupation.trim(), address: typed.address.trim(), capacity: typed.capacity.trim(), witnessName: typed.witnessName.trim() } : {};
    const submittedOn = dayToDate(today);
    const row = await tx.awardOnlineReturn.create({ data: { organisationId: l.org.id, awardId: a.id, submittedBySupplierAccountId: actor.accountId, submittedAt: now, submittedOn, stepUpAt: i.stepUpAt ?? now, ...page } });
    const who = supplierAuditActor(actor);
    const label = `${a.reference} · return sent online`;
    for (const { scan, v } of files) {
      const purpose = scan as AttachmentPurpose;
      const pin = await tx.documentAttachment.create({ data: { organisationId: l.org.id, purpose, versionId: v!.id, awardOnlineReturnId: row.id } });
      await writeAudit(tx, { actor: who, organisationId: l.org.id, entity: "DocumentAttachment", entityId: pin.id, entityLabel: `${label} · ${PURPOSE_LABEL[purpose]}` }, "CREATE", attached({ purpose, title: v!.document.title, versionNo: v!.versionNo, sha256: v!.sha256, owner: label }));
      if (v!.document.status === "STAGED") {
        await tx.document.update({ where: { id: v!.document.id, organisationId: l.org.id }, data: { status: "FILED", filedAt: now } });
        await writeAudit(tx, { actor: who, organisationId: l.org.id, entity: "Document", entityId: v!.document.id, entityLabel: `Document · ${v!.document.title}` }, "UPDATE", filed());
      }
    }
    // NFR-SIG-001: the return is the exact document signed, with the moment the password was asked again. Without that moment the attribution refuses, and nothing is kept.
    await attributeSupplierAct(tx, {
      actor,
      entity: "AwardOnlineReturn",
      entityId: row.id,
      slot: "submittedBySupplierAccount",
      stepUpAt: i.stepUpAt,
      document: { entity: "AwardOnlineReturn", id: row.id },
      reason: `Signed with the password entered when the award return was sent online, by ${actor.displayName}`,
    });
    // The five personal values never enter the trail (PDPA, ruling of 2026-10-24): they are said as withheld. The rest of the page is recorded as typed.
    await writeAudit(tx, { actor: who, organisationId: l.org.id, entity: "AwardOnlineReturn", entityId: row.id, entityLabel: label }, "CREATE", awardAuditCreate({ submittedOn }, { ...withheldForTrail(page), scans: scans.map((s) => RETURN_SLOT_LABEL[s as keyof typeof RETURN_SLOT_LABEL]).join(", ") }));
    await tellOffices(tx, l, today, "AWARD_RETURN_LODGED", row.id);
    return { onlineReturnId: row.id };
  }, now);
}

// ------------------------------------------------------------------ the contractor asks

/// `requestKey` is the browser's one-time key (security review L2): a question sent again with it is the one already asked, answered with its id and nothing written or told.
export async function askAwardQuery(actor: SupplierActor, i: { contractId: string; body: string; requestKey: string }, now: Date = new Date()): Promise<{ queryId: string }> {
  return inHeldContract(actor, i.contractId, async (tx, l, today) => {
    // Under the award's lock, so a second press waits for the first and finds it.
    const again = await tx.awardQuery.findFirst({ where: { awardId: l.award.id, organisationId: l.org.id, requestKey: i.requestKey }, select: { id: true } });
    if (again) return { queryId: again.id };
    const unanswered = await tx.awardQuery.count({ where: { awardId: l.award.id, organisationId: l.org.id, answeredAt: null } });
    const faults = askFaults({ awardStatus: l.award.status, body: i.body, unanswered });
    if (faults.length) refuseContractor(faults);
    const body = i.body.trim();
    // A question writes no clock field and pauses nothing (AC-31): the indent's validity, the return days and commencement stand.
    const q = await tx.awardQuery.create({ data: { organisationId: l.org.id, awardId: l.award.id, body, askedBySupplierAccountId: actor.accountId, askedAt: now, requestKey: i.requestKey } });
    await writeAudit(tx, { actor: supplierAuditActor(actor), organisationId: l.org.id, entity: "AwardQuery", entityId: q.id, entityLabel: `${l.award.reference} · question` }, "CREATE", diffFields(null, { question: body }));
    await tellOffices(tx, l, today, "AWARD_QUERY_RAISED", q.id);
    return { queryId: q.id };
  }, now);
}

// ------------------------------------------------------------------ the officer decides

/// `gone` is what a row not there says: the same words when the award itself is gone or closed to the officer (L5).
async function inLockedAward(actor: StaffActor, awardId: string, gone: FormState, fn: (tx: Tx, l: LoadedAward) => Promise<FormState>): Promise<FormState> {
  try {
    return (await withLockedAwardFor(actor, awardId, fn)) ?? gone;
  } catch (e) {
    if (e instanceof Refusal) return e.state;
    throw e;
  }
}

const formOf = (fs: readonly Finding<AwardReturnFault>[], field: string, codes: readonly string[]): FormState => {
  const onField = fs.filter((f) => codes.includes(f.code));
  return onField.length === fs.length ? { ok: false, errors: { [field]: awardReturnFaultsText(fs) } } : { ok: false, message: awardReturnFaultsText(fs) };
};

/// The trail's line for the five personal values withheld at the decision, said and never shown (as go-live N7's).
const withheldLine = (withheld: boolean) => (withheld ? [{ field: WITHHELD_WORDS.field, before: WITHHELD_WORDS.held, after: WITHHELD_WORDS.en }] : []);

const ROW_SELECT = {
  id: true,
  awardId: true,
  submittedAt: true,
  submittedOn: true,
  verifiedAt: true,
  refusedAt: true,
  signatoryName: true,
  icNumber: true,
  occupation: true,
  address: true,
  capacity: true,
  witnessName: true,
  contractorSigned: true,
  stampAffixed: true,
  witnessSigned: true,
  files: { where: { detachedAt: null }, orderBy: { attachedAt: "asc" as const }, select: { purpose: true, versionId: true } },
} as const;

/**
 * Verify a waiting online return into the award's return, and accept the award (ADR 0045 D1). `act` is `AwardOnlineReturn.verifiedBy`, begun by the server action; the same
 * person is written to `AwardReturn.receivedBy` by `writeAlso`, from the one attribution.
 */
export async function verifyOnlineReturn(actor: StaffActor, onlineReturnId: string, act: PreparedAct): Promise<FormState> {
  const found = await db.awardOnlineReturn.findFirst({ where: { id: onlineReturnId, organisationId: actor.organisationId }, select: { awardId: true } });
  if (!found) return RETURN_GONE;
  return inLockedAward(actor, found.awardId, RETURN_GONE, async (tx, l) => {
    const a = l.award;
    const row = await tx.awardOnlineReturn.findFirst({ where: { id: onlineReturnId, awardId: a.id, organisationId: l.org.id }, select: ROW_SELECT });
    if (!row) return RETURN_GONE;
    const faults = verifyFaults({ awardStatus: a.status, state: onlineReturnState([row]) });
    if (faults.length) return { ok: false, message: awardReturnFaultsText(faults) };
    // The identity card number is written to the return, so the verifier must be someone it is open to. Asked before anything is written, so a refusal keeps its logged event.
    const decision = await sulitWriteDecision(tx, actor, { scope: "exercise", exerciseId: a.exerciseId }, ["icNumber"]);
    if (decision?.refusal) {
      const closed = await sulitWriteRefusal(tx, actor, { scope: "exercise", exerciseId: a.exerciseId }, ["icNumber"]);
      return { ok: false, message: `Not verified: the identity card number is SULIT and is closed to you. ${closed ?? ""}`.trim() };
    }
    // From here, anything short of an accepted award rolls the whole act back (a thrown Refusal), the mark included.
    const fail = (message: string): never => {
      throw new Refusal({ ok: false, message });
    };
    // A waiting row holds its values (CHECK): a withheld one here is a broken row, and nothing empty is ever written into the award's return.
    const held = (v: string | null): string => {
      if (v === null) throw new Error("A waiting online return holds a withheld value");
      return v;
    };
    const kind = a.instrumentKind as InstrumentKind;
    const values = returnRecordFromOnline(kind, { ...row, submittedOn: storedDay(row.submittedOn), signatoryName: held(row.signatoryName), icNumber: held(row.icNumber), occupation: held(row.occupation), address: held(row.address), witnessName: held(row.witnessName) });
    const now = new Date();
    // PDPA (ruling of 2026-10-24): a typed page's five personal values are withheld in the deciding update itself, so a rollback keeps them as they were.
    const withheld = row.capacity !== "";
    const marked = await tx.awardOnlineReturn.updateMany({ where: { id: row.id, verifiedAt: null, refusedAt: null }, data: { verifiedByPersonId: act.subjectPersonId, verifiedAt: now, ...(withheld ? onlineReturnWithheld() : {}) } });
    if (marked.count !== 1) fail(awardReturnFaultsText([{ code: "NOT_WAITING", level: "block" }]));
    const saved = await saveReturn(tx, actor, l, { values, receivedByPersonId: act.subjectPersonId, correction: "" });
    if (!saved.ok) throw new Refusal(saved.state);
    await act.write(tx, row.id);
    await act.writeAlso(tx, "AwardReturn.receivedBy", saved.returnId);
    // The award as a locked owner, its return purposes no longer frozen: the row it waited on is marked verified.
    const owner = awardLockedOwner(l, auditActorOfStaff(actor), { onlineReturnWaiting: false });
    for (const f of row.files) {
      const put = await attachToLockedOwner(tx, actor, owner, { purpose: f.purpose, versionId: f.versionId });
      if (!put.ok) fail(`Not verified: ${RETURN_SLOT_LABEL[f.purpose as keyof typeof RETURN_SLOT_LABEL] ?? "a scan"} could not be put on the award. ${put.message ?? ""}`.trim());
    }
    await acceptOnCompleteReturn(tx, auditActorOfStaff(actor), l, saved.rec);
    const after = await tx.award.findUniqueOrThrow({ where: { id: a.id }, select: { status: true } });
    if (after.status !== "ACCEPTED") fail("Not verified: these scans do not complete the return. Refuse it, with the reason, so the contractor can send it again.");
    await audit(tx, auditActorOfStaff(actor), l.org.id, "AwardOnlineReturn", row.id, `${a.reference} · return sent online`, "UPDATE", [...diffFields({ state: "Being checked" }, { state: "Verified" }), ...withheldLine(withheld)]);
    return { ok: true, message: "Verified. The award is accepted." };
  });
}

/// Refuse a waiting online return, with the reason the contractor reads (ADR 0045 D1). Nothing is attached to the award; the row keeps its files as the record of what was sent.
/// A typed page's five personal values are withheld in the same update (PDPA, ruling of 2026-10-24): the contractor lodges again.
export async function refuseOnlineReturn(actor: StaffActor, onlineReturnId: string, reason: string, act: PreparedAct): Promise<FormState> {
  const found = await db.awardOnlineReturn.findFirst({ where: { id: onlineReturnId, organisationId: actor.organisationId }, select: { awardId: true } });
  if (!found) return RETURN_GONE;
  return inLockedAward(actor, found.awardId, RETURN_GONE, async (tx, l) => {
    const row = await tx.awardOnlineReturn.findFirst({ where: { id: onlineReturnId, awardId: l.award.id, organisationId: l.org.id }, select: { id: true, submittedAt: true, verifiedAt: true, refusedAt: true, capacity: true } });
    if (!row) return RETURN_GONE;
    const faults = refuseFaults({ state: onlineReturnState([row]), reason });
    if (faults.length) return formOf(faults, "reason", ["REASON_REQUIRED", "REASON_TOO_LONG"]);
    const why = reason.trim();
    const withheld = row.capacity !== "";
    const marked = await tx.awardOnlineReturn.updateMany({ where: { id: row.id, verifiedAt: null, refusedAt: null }, data: { refusedByPersonId: act.subjectPersonId, refusedAt: new Date(), refusedReason: why, ...(withheld ? onlineReturnWithheld() : {}) } });
    if (marked.count !== 1) return { ok: false, message: awardReturnFaultsText([{ code: "NOT_WAITING", level: "block" }]) };
    await act.write(tx, row.id);
    await audit(tx, auditActorOfStaff(actor), l.org.id, "AwardOnlineReturn", row.id, `${l.award.reference} · return sent online`, "UPDATE", [...diffFields({ state: "Being checked" }, { state: "Refused" }), ...withheldLine(withheld)], why);
    return { ok: true };
  });
}

/// Answer a contractor's question, once, in any status of the award (WV-7). The contractor reads it in the portal; no notice is sent to it (ADR 0045 D3).
export async function answerAwardQuery(actor: StaffActor, queryId: string, answer: string, act: PreparedAct): Promise<FormState> {
  const found = await db.awardQuery.findFirst({ where: { id: queryId, organisationId: actor.organisationId }, select: { awardId: true } });
  if (!found) return QUERY_GONE;
  return inLockedAward(actor, found.awardId, QUERY_GONE, async (tx, l) => {
    const q = await tx.awardQuery.findFirst({ where: { id: queryId, awardId: l.award.id, organisationId: l.org.id }, select: { id: true, answeredAt: true } });
    if (!q) return QUERY_GONE;
    const faults = answerFaults({ answeredAt: q.answeredAt, answer });
    if (faults.length) return formOf(faults, "answer", ["ANSWER_REQUIRED", "ANSWER_TOO_LONG"]);
    const text = answer.trim();
    const marked = await tx.awardQuery.updateMany({ where: { id: q.id, answeredAt: null }, data: { answer: text, answeredByPersonId: act.subjectPersonId, answeredAt: new Date() } });
    if (marked.count !== 1) return { ok: false, message: awardReturnFaultsText([{ code: "ALREADY_ANSWERED", level: "block" }]) };
    await act.write(tx, q.id);
    await audit(tx, auditActorOfStaff(actor), l.org.id, "AwardQuery", q.id, `${l.award.reference} · question`, "UPDATE", diffFields({ answer: "" }, { answer: text }));
    return { ok: true };
  });
}
