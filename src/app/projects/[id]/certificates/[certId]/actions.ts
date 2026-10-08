"use server";

import { actStatusFault, actStatusText, certificateAct, certificateVoidAct, type CertificatePhase } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import type { CertificateKind, CertificateStatus } from "@/lib/certificate/types";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { AdjustmentNetMissing } from "@/lib/adjustment/ppjhk";
import { toSecond } from "@/lib/bids/lateness";
import { withLockedCertificate } from "@/lib/certificate/repo";
import { DELIVERY_METHODS, SIGNATURE_DECISIONS } from "@/lib/certificate/types";
import { acknowledgeCopy, CertificateRefusal, correctCertificateDate, despatchCopy, overrideField, proceedToSigning, recordCheck, recordRoutingReceived, recordSignature, sendForRouting, voidCertificate, type CertCtx } from "@/lib/certificate/write";
import { dayOf, storedDay } from "@/lib/dates";
import { parseSen, senToDecimalString } from "@/lib/money";
import { REJECTION_KINDS } from "@/lib/authority/rejection";
import { chooseCertificateRejection, decideCertificateStep } from "@/lib/certificate/route-write";
import { recordFinancePayment } from "@/lib/payment/finance-write";
import { submitForApproval } from "@/lib/payment/route-open";
import { FormReader } from "@/lib/validate";
import { toAuditActor, staffForAct } from "@/app/_auth/actor";
import { attributionRefusalState, beginAct, type PreparedAct } from "@/app/_auth/act";
import type { AuditActor } from "@/lib/auth/types";
import type { OrgScope } from "@/lib/org-scope";

/**
 * The certificate page's acts (6.14 increment 1). Each reads the server's clock once on entry (to the second),
 * locks the contract's chain and then the certificate (`withLockedCertificate`), and calls the core's helper,
 * which re-runs the rule on the locked rows, writes and audits in the same transaction. A refusal throws, so
 * nothing is saved, and says what refuses it. A cancelled contract refuses every act. The signed-in officer is named on every audit row, and
 * every act is attributed in the same transaction (`beginAct`, Phase 2b): the officer's own, or, from paper, recorded for another and not signed. No act posts a bound field (FR-CRT-002): the
 * figures, the number, the sequence and the certificate's date are never form fields.
 */

const GONE: FormState = { ok: false, message: "That certificate no longer exists." };
const NO_ZONE: FormState = { ok: false, message: "Set the organisation's time zone under Configuration › Organisation first: every act here records the organisation's day, never UTC's." };
const CANCELLED: FormState = { ok: false, message: "The contract is cancelled: its certificates are kept as they were." };

/// Lock, refuse a cancelled contract or an unset zone, then run the act.
async function inCertificate(scope: OrgScope, actor: AuditActor, certId: string, now: Date, phase: CertificatePhase | "VOID", fn: (c: CertCtx) => Promise<void>): Promise<FormState> {
  let contractId: string | undefined;
  let result: FormState | null;
  try {
    result = await withLockedCertificate(scope.organisationId, certId, async (tx, l) => {
      contractId = l.contract.id;
      // ADR 0031 (run 1a): the one act × status table, by the certificate's kind and the act's phase (BD-613-114: before
      // the issue the kind's family, after it the CERTIFICATE row; the void by certificateVoidAct), CANCELLED first (its
      // words as before).
      const kind = l.cert.kind as CertificateKind;
      const refused = actStatusFault(phase === "VOID" ? certificateVoidAct(kind, l.cert.status as CertificateStatus) : certificateAct(kind, phase), l.contract.status as ContractStatus);
      if (refused) return refused.code === "CONTRACT_CANCELLED" ? CANCELLED : { ok: false, message: actStatusText(refused) };
      const today = dayOf(now, l.org.timeZone);
      if (!today) return NO_ZONE;
      await fn({ tx, actor, l, now, today });
      return { ok: true };
    });
  } catch (e) {
    if (e instanceof CertificateRefusal) return { ok: false, message: e.message, errors: e.errors };
    if (e instanceof AdjustmentNetMissing) return { ok: false, message: e.message };
    const attribution = attributionRefusalState(e);
    if (attribution) return attribution;
    throw e;
  }
  if (result?.ok && contractId) {
    revalidatePath(`/projects/${contractId}`);
    revalidatePath(`/projects/${contractId}/certificates/${certId}`);
  }
  return result ?? GONE;
}

const certOf = (data: FormData) => String(data.get("certId") ?? "");

export async function sendCertificateForRouting(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  return inCertificate(actor, toAuditActor(actor), certOf(data), now, "PRE_ISSUE", (c) => sendForRouting(c));
}

export async function recordCertificateReceived(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const received = r.date("receivedOn", "Received on", { required: true });
  if (r.failed || !received) return { ok: false, errors: r.errors };
  return inCertificate(actor, toAuditActor(actor), certOf(data), now, "PRE_ISSUE", (c) => recordRoutingReceived(c, storedDay(received)));
}

export async function recordCertificateCheck(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const defOrder = r.int("defOrder", "Check", { min: 1, required: true });
  const on = r.date("on", "On", { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || defOrder == null || !on) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "RoutingCheck.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  return inCertificate(actor, toAuditActor(actor), certOf(data), now, "PRE_ISSUE", (c) => recordCheck(c, defOrder, begun.act, storedDay(on), note));
}

export async function sendCertificateToSigning(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  return inCertificate(actor, toAuditActor(actor), certOf(data), now, "PRE_ISSUE", (c) => proceedToSigning(c));
}

export async function recordCertificateSignature(_prev: FormState, data: FormData): Promise<FormState> {
  const holderGuard = await staffForAct("SIGNATURE");
  if (!holderGuard.ok) return holderGuard.state;
  const actor = holderGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const blockOrder = r.int("blockOrder", "Block", { min: 1, required: true });
  const name = r.text("name", "Full name", { max: 240 });
  const icNumber = r.text("icNumber", "Identity-card number", { max: 20 });
  const signedOn = r.date("signedOn", "Signed on");
  const refused = r.choice("refused", "Refused to sign", ["yes", "no"] as const);
  const refusalNote = r.text("refusalNote", "What the refusal was", { max: 2000 });
  const decision = r.choice("decision", "Answer", SIGNATURE_DECISIONS);
  const cap = r.money("decisionCap", "Supported up to");
  if (r.failed || blockOrder == null) return { ok: false, errors: r.errors };
  // A block of the organisation's own is signed by a person: the holder signed in, with the password asked again, or the paper they signed recorded for them.
  // A block that is not a person's (the contractor's side) names its signatory by name and asks no one's password. The certificate it signs is named (NFR-SIG-001).
  const personBlock = data.get("personBlock") === "yes";
  let act: PreparedAct | null = null;
  if (personBlock) {
    const begun = await beginAct(actor, data, "CertificateSignature.person", { personField: "personId", dateField: "signedOn", document: { entity: "Certificate", id: certOf(data) } });
    if (!begun.ok) return begun.state;
    act = begun.act;
  }
  const personId = act?.subjectPersonId ?? null;
  const signedOnDay = act ? act.day : signedOn ? storedDay(signedOn) : null;
  return inCertificate(actor, toAuditActor(actor), certOf(data), now, "PRE_ISSUE", (c) =>
    recordSignature(c, { blockOrder, personId: personId || null, act, name, icNumber, signedOn: signedOnDay, refused: refused === "yes", refusalNote, decision: decision ?? null, decisionCap: cap ? senToDecimalString(parseSen(cap)) : null }),
  );
}

export async function overrideCertificateFigure(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const fieldKey = r.text("fieldKey", "Figure", { required: true, max: 120 });
  const value = r.text("value", "Overridden to", { required: true, max: 240 });
  const justification = r.text("justification", "Justification", { required: true, max: 4000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "CertificateOverride.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  return inCertificate(actor, toAuditActor(actor), certOf(data), now, "PRE_ISSUE", (c) => overrideField(c, fieldKey, value, justification, begun.act));
}

export async function correctCertificateDay(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const proposed = r.date("correctedDay", "Corrected day", { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  if (r.failed || !proposed) return { ok: false, errors: r.errors };
  return inCertificate(actor, toAuditActor(actor), certOf(data), now, "PRE_ISSUE", (c) => correctCertificateDate(c, storedDay(proposed), reason));
}

export async function despatchCertificateCopy(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const copyId = r.text("copyId", "Copy", { required: true });
  const method = r.choice("method", "How it went", DELIVERY_METHODS, { required: true });
  const on = r.date("despatchedOn", "Sent on", { required: true });
  if (r.failed || !method || !on) return { ok: false, errors: r.errors };
  return inCertificate(actor, toAuditActor(actor), certOf(data), now, "POST_ISSUE", (c) => despatchCopy(c, copyId, method, storedDay(on)));
}

export async function acknowledgeCertificateCopy(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const copyId = r.text("copyId", "Copy", { required: true });
  const on = r.date("acknowledgedOn", "Acknowledged on", { required: true });
  if (r.failed || !on) return { ok: false, errors: r.errors };
  return inCertificate(actor, toAuditActor(actor), certOf(data), now, "POST_ISSUE", (c) => acknowledgeCopy(c, copyId, storedDay(on)));
}

export async function voidCertificateAct(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const reason = String(data.get("reason") ?? "").slice(0, 2000);
  return inCertificate(actor, toAuditActor(actor), certOf(data), now, "VOID", (c) => voidCertificate(c, reason));
}

// ------------------------------------------------------------------ the approval route (6.13 Part A step 3, 614-C4)

/// Send a certificate raised by a post-award module for approval: its route resolved on the matrix (FR-PAY-016).
export async function sendCertificateForApproval(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "ApprovalInstance.submittedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  return inCertificate(actor, toAuditActor(actor), certOf(data), now, "PRE_ISSUE", (c) => submitForApproval(c, begun.act));
}

/// A decision on a step of the certificate's open route (614-C4: decided here, under the lock order): the holder's own, signed, or recorded for them from paper.
export async function decideCertificateRouteStep(_prev: FormState, data: FormData): Promise<FormState> {
  const holderGuard = await staffForAct("HOLDER_CHECKED");
  if (!holderGuard.ok) return holderGuard.state;
  const actor = holderGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const stepId = r.text("stepId", "Step", { required: true });
  const decision = r.choice("decision", "Decision", ["DONE", "REJECTED"] as const, { required: true });
  r.date("decidedOn", "Decided on");
  const received = r.date("receivedOn", "Received on");
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed || !decision) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "ApprovalStep.decidedBy", { personField: "personId", dateField: "decidedOn", document: { entity: "Certificate", id: certOf(data) } });
  if (!begun.ok) return begun.state;
  return inCertificate(actor, toAuditActor(actor), certOf(data), now, "PRE_ISSUE", (c) => decideCertificateStep(c, { stepId, decision, act: begun.act, decidedOn: begun.act.day!, receivedOn: received ? storedDay(received) : null, reason }));
}

/// Where a refused route goes, where its refusal decided nothing (CO-5): the signed-in officer's own choice.
export async function chooseCertificateRouteRejection(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const kind = r.choice("goesTo", "Where it goes", REJECTION_KINDS);
  const seq = r.int("returnToSeq", "Step", { min: 1 });
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "ApprovalInstance.rejectionChosenBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  return inCertificate(actor, toAuditActor(actor), certOf(data), now, "PRE_ISSUE", (c) => chooseCertificateRejection(c, { kind: kind ?? null, returnToSeq: seq ?? null, personId: begun.act.subjectPersonId, reason, act: begun.act }));
}

/// Finance's payment of an issued payment certificate (FR-PAY-019, INT-07's manual adapter).
export async function recordCertificatePayment(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const batchNo = r.text("batchNo", "Batch number", { required: true, max: 60 });
  const paidOn = r.date("paidOn", "Paid on", { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || !paidOn) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "FinancePayment.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  return inCertificate(actor, toAuditActor(actor), certOf(data), now, "POST_ISSUE", (c) => recordFinancePayment(c, { batchNo, paidOn: storedDay(paidOn), act: begun.act, note }));
}
