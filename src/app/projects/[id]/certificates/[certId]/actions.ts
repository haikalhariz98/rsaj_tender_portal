"use server";

import { actStatusFault, actStatusText, certificateAct, certificatePhase, type CertificatePhase } from "@/lib/contract/act-status";
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

/**
 * The certificate page's acts (6.14 increment 1). Each reads the server's clock once on entry (to the second),
 * locks the contract's chain and then the certificate (`withLockedCertificate`), and calls the core's helper,
 * which re-runs the rule on the locked rows, writes and audits in the same transaction. A refusal throws, so
 * nothing is saved, and says what refuses it. A cancelled contract refuses every act. Nobody is signed in:
 * every Person named is recorded on their behalf, not signed. No act posts a bound field (FR-CRT-002): the
 * figures, the number, the sequence and the certificate's date are never form fields.
 */

const GONE: FormState = { ok: false, message: "That certificate no longer exists." };
const NO_ZONE: FormState = { ok: false, message: "Set the organisation's time zone under Configuration › Organisation first: every act here records the organisation's day, never UTC's." };
const CANCELLED: FormState = { ok: false, message: "The contract is cancelled: its certificates are kept as they were." };

/// Lock, refuse a cancelled contract or an unset zone, then run the act.
async function inCertificate(certId: string, now: Date, phase: CertificatePhase | "BY_STATUS", fn: (c: CertCtx) => Promise<void>): Promise<FormState> {
  let contractId: string | undefined;
  let result: FormState | null;
  try {
    result = await withLockedCertificate(certId, async (tx, l) => {
      contractId = l.contract.id;
      // ADR 0031 (run 1a): the one act × status table, by the certificate's kind and the act's phase (BD-613-114: before
      // the issue the kind's family, after it the CERTIFICATE row; the void by where the certificate stands), CANCELLED
      // first (its words as before).
      const refused = actStatusFault(certificateAct(l.cert.kind as CertificateKind, phase === "BY_STATUS" ? certificatePhase(l.cert.status as CertificateStatus) : phase), l.contract.status as ContractStatus);
      if (refused) return refused.code === "CONTRACT_CANCELLED" ? CANCELLED : { ok: false, message: actStatusText(refused) };
      const today = dayOf(now, l.org.timeZone);
      if (!today) return NO_ZONE;
      await fn({ tx, l, now, today });
      return { ok: true };
    });
  } catch (e) {
    if (e instanceof CertificateRefusal) return { ok: false, message: e.message, errors: e.errors };
    if (e instanceof AdjustmentNetMissing) return { ok: false, message: e.message };
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
  const now = toSecond(new Date());
  return inCertificate(certOf(data), now, "PRE_ISSUE", (c) => sendForRouting(c));
}

export async function recordCertificateReceived(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const received = r.date("receivedOn", "Received on", { required: true });
  if (r.failed || !received) return { ok: false, errors: r.errors };
  return inCertificate(certOf(data), now, "PRE_ISSUE", (c) => recordRoutingReceived(c, storedDay(received)));
}

export async function recordCertificateCheck(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const defOrder = r.int("defOrder", "Check", { min: 1, required: true });
  const personId = r.text("personId", "Recorded for", { required: true });
  const on = r.date("on", "On", { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || defOrder == null || !on) return { ok: false, errors: r.errors };
  return inCertificate(certOf(data), now, "PRE_ISSUE", (c) => recordCheck(c, defOrder, personId, storedDay(on), note));
}

export async function sendCertificateToSigning(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  return inCertificate(certOf(data), now, "PRE_ISSUE", (c) => proceedToSigning(c));
}

export async function recordCertificateSignature(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const blockOrder = r.int("blockOrder", "Block", { min: 1, required: true });
  const personId = r.text("personId", "Signed by", { max: 64 });
  const name = r.text("name", "Full name", { max: 240 });
  const icNumber = r.text("icNumber", "Identity-card number", { max: 20 });
  const signedOn = r.date("signedOn", "Signed on");
  const refused = r.choice("refused", "Refused to sign", ["yes", "no"] as const);
  const refusalNote = r.text("refusalNote", "What the refusal was", { max: 2000 });
  const decision = r.choice("decision", "Answer", SIGNATURE_DECISIONS);
  const cap = r.money("decisionCap", "Supported up to");
  if (r.failed || blockOrder == null) return { ok: false, errors: r.errors };
  return inCertificate(certOf(data), now, "PRE_ISSUE", (c) =>
    recordSignature(c, { blockOrder, personId: personId || null, name, icNumber, signedOn: signedOn ? storedDay(signedOn) : null, refused: refused === "yes", refusalNote, decision: decision ?? null, decisionCap: cap ? senToDecimalString(parseSen(cap)) : null }),
  );
}

export async function overrideCertificateFigure(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const fieldKey = r.text("fieldKey", "Figure", { required: true, max: 120 });
  const value = r.text("value", "Overridden to", { required: true, max: 240 });
  const justification = r.text("justification", "Justification", { required: true, max: 4000 });
  const personId = r.text("personId", "Recorded for", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  return inCertificate(certOf(data), now, "PRE_ISSUE", (c) => overrideField(c, fieldKey, value, justification, personId));
}

export async function correctCertificateDay(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const proposed = r.date("correctedDay", "Corrected day", { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  if (r.failed || !proposed) return { ok: false, errors: r.errors };
  return inCertificate(certOf(data), now, "PRE_ISSUE", (c) => correctCertificateDate(c, storedDay(proposed), reason));
}

export async function despatchCertificateCopy(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const copyId = r.text("copyId", "Copy", { required: true });
  const method = r.choice("method", "How it went", DELIVERY_METHODS, { required: true });
  const on = r.date("despatchedOn", "Sent on", { required: true });
  if (r.failed || !method || !on) return { ok: false, errors: r.errors };
  return inCertificate(certOf(data), now, "POST_ISSUE", (c) => despatchCopy(c, copyId, method, storedDay(on)));
}

export async function acknowledgeCertificateCopy(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const copyId = r.text("copyId", "Copy", { required: true });
  const on = r.date("acknowledgedOn", "Acknowledged on", { required: true });
  if (r.failed || !on) return { ok: false, errors: r.errors };
  return inCertificate(certOf(data), now, "POST_ISSUE", (c) => acknowledgeCopy(c, copyId, storedDay(on)));
}

export async function voidCertificateAct(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const reason = String(data.get("reason") ?? "").slice(0, 2000);
  return inCertificate(certOf(data), now, "BY_STATUS", (c) => voidCertificate(c, reason));
}

// ------------------------------------------------------------------ the approval route (6.13 Part A step 3, 614-C4)

/// Send a certificate raised by a post-award module for approval: its route resolved on the matrix (FR-PAY-016).
export async function sendCertificateForApproval(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const personId = r.text("personId", "Sent by", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  return inCertificate(certOf(data), now, "PRE_ISSUE", (c) => submitForApproval(c, personId));
}

/// A named Person's decision on a step of the certificate's open route (614-C4: decided here, under the lock order).
export async function decideCertificateRouteStep(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const stepId = r.text("stepId", "Step", { required: true });
  const decision = r.choice("decision", "Decision", ["DONE", "REJECTED"] as const, { required: true });
  const personId = r.text("personId", "Decided by", { required: true });
  const on = r.date("decidedOn", "Decided on", { required: true });
  const received = r.date("receivedOn", "Received on");
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed || !decision || !on) return { ok: false, errors: r.errors };
  return inCertificate(certOf(data), now, "PRE_ISSUE", (c) => decideCertificateStep(c, { stepId, decision, personId, decidedOn: storedDay(on), receivedOn: received ? storedDay(received) : null, reason }));
}

/// Where a refused route goes, where its refusal decided nothing (CO-5): the officer's choice, on a named Person's behalf.
export async function chooseCertificateRouteRejection(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const kind = r.choice("goesTo", "Where it goes", REJECTION_KINDS);
  const seq = r.int("returnToSeq", "Step", { min: 1 });
  const personId = r.optionalText("personId");
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inCertificate(certOf(data), now, "PRE_ISSUE", (c) => chooseCertificateRejection(c, { kind: kind ?? null, returnToSeq: seq ?? null, personId, reason }));
}

/// Finance's payment of an issued payment certificate (FR-PAY-019, INT-07's manual adapter).
export async function recordCertificatePayment(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const batchNo = r.text("batchNo", "Batch number", { required: true, max: 60 });
  const paidOn = r.date("paidOn", "Paid on", { required: true });
  const personId = r.text("personId", "Recorded for", { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || !paidOn) return { ok: false, errors: r.errors };
  return inCertificate(certOf(data), now, "POST_ISSUE", (c) => recordFinancePayment(c, { batchNo, paidOn: storedDay(paidOn), personId, note }));
}
