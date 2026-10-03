"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { toSecond } from "@/lib/bids/lateness";
import { withLockedCertificate } from "@/lib/certificate/repo";
import { DELIVERY_METHODS, SIGNATURE_DECISIONS } from "@/lib/certificate/types";
import { acknowledgeCopy, CertificateRefusal, correctCertificateDate, despatchCopy, overrideField, proceedToSigning, recordCheck, recordRoutingReceived, recordSignature, sendForRouting, voidCertificate, type CertCtx } from "@/lib/certificate/write";
import { dayOf, storedDay } from "@/lib/dates";
import { parseSen, senToDecimalString } from "@/lib/money";
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
async function inCertificate(certId: string, now: Date, fn: (c: CertCtx) => Promise<void>): Promise<FormState> {
  let contractId: string | undefined;
  let result: FormState | null;
  try {
    result = await withLockedCertificate(certId, async (tx, l) => {
      contractId = l.contract.id;
      if (l.contract.status === "CANCELLED") return CANCELLED;
      const today = dayOf(now, l.org.timeZone);
      if (!today) return NO_ZONE;
      await fn({ tx, l, now, today });
      return { ok: true };
    });
  } catch (e) {
    if (e instanceof CertificateRefusal) return { ok: false, message: e.message, errors: e.errors };
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
  return inCertificate(certOf(data), now, (c) => sendForRouting(c));
}

export async function recordCertificateReceived(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const received = r.date("receivedOn", "Received on", { required: true });
  if (r.failed || !received) return { ok: false, errors: r.errors };
  return inCertificate(certOf(data), now, (c) => recordRoutingReceived(c, storedDay(received)));
}

export async function recordCertificateCheck(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const defOrder = r.int("defOrder", "Check", { min: 1, required: true });
  const personId = r.text("personId", "Recorded for", { required: true });
  const on = r.date("on", "On", { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || defOrder == null || !on) return { ok: false, errors: r.errors };
  return inCertificate(certOf(data), now, (c) => recordCheck(c, defOrder, personId, storedDay(on), note));
}

export async function sendCertificateToSigning(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  return inCertificate(certOf(data), now, (c) => proceedToSigning(c));
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
  return inCertificate(certOf(data), now, (c) =>
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
  return inCertificate(certOf(data), now, (c) => overrideField(c, fieldKey, value, justification, personId));
}

export async function correctCertificateDay(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const proposed = r.date("correctedDay", "Corrected day", { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  if (r.failed || !proposed) return { ok: false, errors: r.errors };
  return inCertificate(certOf(data), now, (c) => correctCertificateDate(c, storedDay(proposed), reason));
}

export async function despatchCertificateCopy(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const copyId = r.text("copyId", "Copy", { required: true });
  const method = r.choice("method", "How it went", DELIVERY_METHODS, { required: true });
  const on = r.date("despatchedOn", "Sent on", { required: true });
  if (r.failed || !method || !on) return { ok: false, errors: r.errors };
  return inCertificate(certOf(data), now, (c) => despatchCopy(c, copyId, method, storedDay(on)));
}

export async function acknowledgeCertificateCopy(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const copyId = r.text("copyId", "Copy", { required: true });
  const on = r.date("acknowledgedOn", "Acknowledged on", { required: true });
  if (r.failed || !on) return { ok: false, errors: r.errors };
  return inCertificate(certOf(data), now, (c) => acknowledgeCopy(c, copyId, storedDay(on)));
}

export async function voidCertificateAct(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const reason = String(data.get("reason") ?? "").slice(0, 2000);
  return inCertificate(certOf(data), now, (c) => voidCertificate(c, reason));
}
