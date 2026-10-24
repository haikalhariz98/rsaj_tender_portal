import { dayToDate } from "@/lib/dates";

import { slotOf } from "./act-slots";
import type { Fault, PermissionKey } from "./types";

/**
 * The attribution of an act (ADR 0034 D12, Phase 2a). Pure: what an attribution row must satisfy, the row to write, and how a stored
 * (or missing) one reads aloud. The writer is `attribution-store.ts`; it takes the act's own transaction and calls this first.
 *
 * Two modes. SIGNED: the person did it, in their own session, and the recorder is the subject. RECORDED_ON_BEHALF: an officer recorded it
 * for someone from a paper record, and it is not a signature. A recorder is a person, a supplier's account (Phase 4), or the system by label (a demo
 * loader, a fixture, a migration), so that those acts are attributed honestly rather than to nobody.
 *
 * Reading one is never inferred from a date (D12):
 * - a row: "Signed by X", or "Recorded by Y on behalf of X, not signed";
 * - no row, and the act's audit row is unattributed: "Recorded on behalf of X, not signed (before sign-in)";
 * - no row, but the audit row names an actor: "Attribution missing", a defect shown as one.
 */

// --------------------------------------------------------------------------------------------- the words

/// "recorded on behalf of, not signed": the one phrase. The three copies Phase 2a retires (certificate labels' `ON_BEHALF`, document labels'
/// `RECORDED_ON_BEHALF`, and the literal in the rejection store) are this, byte for byte, so no screen changes.
export const ON_BEHALF_PHRASE = "recorded on behalf of, not signed";
export const ON_BEHALF_SENTENCE = "Recorded on behalf of, not signed";
/// What a history line says of an act that was not signed.
export const NOT_SIGNED_WORDS = "not signed";

// --------------------------------------------------------------------------------------------- the request

export type ActSubject = { kind: "PERSON"; personId: string } | { kind: "SUPPLIER_ACCOUNT"; supplierAccountId: string };

export type ActRecorder =
  | { kind: "PERSON"; personId: string; sessionId: string | null }
  | { kind: "SUPPLIER_ACCOUNT"; supplierAccountId: string; sessionId: string | null }
  | { kind: "SYSTEM"; label: string };

export type ActModeName = "SIGNED" | "RECORDED_ON_BEHALF";

export interface AttributionRequest {
  entity: string;
  entityId: string;
  slot: string;
  subject: ActSubject;
  recorder: ActRecorder;
  mode: ActModeName;
  /// When the password was asked again for this act (`stepUp`). Required to sign a signature-class act.
  stepUpAt?: Date | null;
  paperReference?: string;
  reason?: string;
  /// What the recorder holds (a person recorder), and the organisation's switch: both judged for a signature-class act recorded from paper.
  recorderPermissions?: ReadonlySet<PermissionKey>;
  paperSignatureRecording?: "ALLOWED" | "REFUSED" | null;
  /// NFR-SIG-001: the exact document or record a signature-class act signed, and the office the signer held. The document is required for a signature-class act.
  document?: { entity: string; id: string } | null;
  roleCode?: string | null;
  /// NFR-AUD-006: a signed act dated earlier than the day it is recorded is an exception, with its reason and the person who authorised it.
  effectiveOn?: string | null;
  backdate?: { reason: string; authorisedByPersonId: string } | null;
}

const fault = (code: string, en: string): Fault => ({ code, en });

const sameParty = (s: ActSubject, r: ActRecorder): boolean =>
  (s.kind === "PERSON" && r.kind === "PERSON" && s.personId === r.personId) ||
  (s.kind === "SUPPLIER_ACCOUNT" && r.kind === "SUPPLIER_ACCOUNT" && s.supplierAccountId === r.supplierAccountId);

/// The people an act's separation-of-duties checks run against: the actor and, where it differs, the person the act is attributed to (F1). Both, always.
export function actingPeople(req: Pick<AttributionRequest, "subject" | "recorder">): string[] {
  const out = new Set<string>();
  if (req.recorder.kind === "PERSON") out.add(req.recorder.personId);
  if (req.subject.kind === "PERSON") out.add(req.subject.personId);
  return [...out];
}

/**
 * Whether the password was really asked again for this signature (review of Phase 2a). The caller hands over the time `stepUp` gave it, but the
 * writer does not trust it: it must be the stamp the act's own session carries now (so a stamp from an earlier step-up, or a time made up, is not
 * it), and no earlier attribution may already have been signed on it (so one password entry signs one act). There is no time window: the single
 * use is what makes "asked at every approval, signature and unseal" true.
 */
export interface StepUpFacts {
  passed: Date | null | undefined;
  /// The stamp the session carries now, or null where it has none (or the session has ended).
  onSession: Date | null;
  /// Whether an attribution already carries this session and this stamp.
  consumed: boolean;
}

export function stepUpFault(f: StepUpFacts): Fault | null {
  if (!f.passed) return fault("STEP_UP_REQUIRED", "This act needs the password again. Enter it to sign.");
  if (!f.onSession || f.onSession.getTime() !== f.passed.getTime()) {
    return fault("STEP_UP_NOT_CURRENT", "The password was not asked for this act in this session. Enter it again to sign.");
  }
  if (f.consumed) return fault("STEP_UP_USED", "That password entry has already signed an act. Enter the password again to sign this one.");
  return null;
}

/// Whether this request is signed with the password asked again: a signature-class act signed in a session (not the system's, and not on someone's behalf).
const signedWithPassword = (req: Pick<AttributionRequest, "entity" | "slot" | "mode" | "recorder">): boolean =>
  req.mode === "SIGNED" && req.recorder.kind !== "SYSTEM" && slotOf(req.entity, req.slot)?.signatureClass === true;

/// Whether the writer checks the stamp against a staff session: the same, for a person's session. (A supplier's session has no table until Phase 4.)
export const needsStepUp = (req: Pick<AttributionRequest, "entity" | "slot" | "mode" | "recorder">): boolean => signedWithPassword(req) && req.recorder.kind === "PERSON";

/// What stops this attribution being written, in both languages. Empty: it may be written.
export function attributionFaults(req: AttributionRequest): Fault[] {
  const out: Fault[] = [];
  const registered = slotOf(req.entity, req.slot);
  if (!registered) {
    return [fault("UNKNOWN_SLOT", "This act has no registered person slot, so it cannot be attributed.")];
  }
  const signatureClass = registered.signatureClass;
  const system = req.recorder.kind === "SYSTEM";
  if (signatureClass && !(req.document?.entity.trim() && req.document.id.trim())) {
    out.push(fault("DOCUMENT_REQUIRED", "A signature names the exact document or record it signs."));
  }
  if (req.backdate) {
    if (req.mode !== "SIGNED" || !req.effectiveOn) {
      out.push(fault("BACKDATE_NOT_SIGNED", "Only a signed act is back-dated, and it names the day it is dated."));
    }
    if (req.backdate.reason.trim() === "") {
      out.push(fault("BACKDATE_REASON_REQUIRED", "Dating an act earlier than today needs the reason."));
    }
    if (req.recorder.kind === "PERSON" && req.backdate.authorisedByPersonId === req.recorder.personId) {
      out.push(fault("BACKDATE_SELF_AUTHORISED", "Dating an act earlier than today is authorised by someone other than the person who records it."));
    }
  }
  if (req.recorder.kind === "SYSTEM" && req.recorder.label.trim() === "") {
    out.push(fault("SYSTEM_UNLABELLED", "A system act says what it is."));
  }

  if (req.mode === "SIGNED") {
    if (!sameParty(req.subject, req.recorder)) {
      out.push(
        fault(
          "SIGNED_BY_ANOTHER",
          "An act is signed only by the person it is attributed to, in their own session. Recording it for someone else is recorded on their behalf, and is not a signature.",
        ),
      );
    }
    if (signatureClass && !req.stepUpAt) {
      out.push(fault("STEP_UP_REQUIRED", "This act needs the password again. Enter it to sign."));
    }
    return out;
  }

  // Recorded on someone's behalf, from paper.
  const paper = (req.paperReference ?? "").trim();
  const why = (req.reason ?? "").trim();
  if (paper === "" && why === "") {
    out.push(fault("PAPER_OR_REASON_REQUIRED", "Recording an act on someone's behalf needs the paper it came from or the reason it is recorded."));
  }
  if (sameParty(req.subject, req.recorder)) {
    // A person who records their own act "on their behalf" would skip the password a signature asks, and says nothing true: it is signed, or it is not theirs.
    out.push(
      fault(
        "ON_BEHALF_OF_SELF",
        "An act recorded on someone's behalf is recorded for another person. To act as yourself, sign it.",
      ),
    );
  }
  // A signature, or an act that moves money, time or authority (`paperGated`): the permission and the paper's reference. The organisation's switch is the signature's alone.
  if ((signatureClass || registered.paperGated) && !system) {
    if (!req.recorderPermissions?.has("acts.recordOnBehalf")) {
      out.push(
        signatureClass
          ? fault(
              "NOT_PERMITTED_TO_RECORD",
              "Recording an approval, signature or unsealing from paper needs the permission to record on someone's behalf, which you do not hold.",
            )
          : fault(
              "NOT_PERMITTED_TO_RECORD",
              "Recording this from paper for someone else needs the permission to record on someone's behalf, which you do not hold. It moves money, time or authority.",
            ),
      );
    }
    if (paper === "") {
      out.push(fault("PAPER_REFERENCE_REQUIRED", "A paper decision is recorded with the reference of the paper it came from."));
    }
  }
  if (signatureClass && !system) {
    if (req.paperSignatureRecording == null) {
      out.push(
        fault(
          "PAPER_SWITCH_NOT_SET",
          "The organisation has not set whether a paper decision may be recorded for someone else, so it cannot be recorded. That setting is the organisation's to choose.",
        ),
      );
    } else if (req.paperSignatureRecording === "REFUSED") {
      out.push(fault("PAPER_REFUSED", "The organisation does not allow a paper decision to be recorded for someone else."));
    }
  }
  return out;
}

/**
 * What is judged at the PROPOSAL and not again at the apply (ruling 1982(h)(1), log line 2036). An act that names its subject in a form (a delegation's grantor) is made by the
 * person who proposes the change: at the proposal they are asked for the permission to record from paper, and the rehearsal refuses without it. When a second person applies the
 * change, the recorder of the attribution is still the proposer, and their permission is not the applier's to judge: the applier's own is the change's decision. So the faults of
 * the recorder's standing are not asked again here; every other fault (the paper or the reason, a recorder who is the subject, a person gone) still is.
 */
export const JUDGED_AT_PROPOSAL: readonly string[] = ["NOT_PERMITTED_TO_RECORD", "PAPER_SWITCH_NOT_SET", "PAPER_REFUSED"];

/// The faults of an attribution a second person applies for the person who proposed it. A signature cannot be applied: it is made by the person signing, in their own session.
export function appliedAttributionFaults(req: AttributionRequest): Fault[] {
  if (slotOf(req.entity, req.slot)?.signatureClass) {
    return [fault("SIGNATURE_NOT_APPLIED", "A signature is made by the person signing it, in their own session, so it cannot be applied from a proposal.")];
  }
  return attributionFaults(req).filter((f) => !JUDGED_AT_PROPOSAL.includes(f.code));
}

/// The columns of the `ActAttribution` row for a request that has no faults. `organisationId` is added by the writer.
export function attributionRow(req: AttributionRequest) {
  return {
    entity: req.entity,
    entityId: req.entityId,
    slot: req.slot,
    subjectPersonId: req.subject.kind === "PERSON" ? req.subject.personId : null,
    subjectSupplierAccountId: req.subject.kind === "SUPPLIER_ACCOUNT" ? req.subject.supplierAccountId : null,
    recordedByPersonId: req.recorder.kind === "PERSON" ? req.recorder.personId : null,
    recordedBySupplierAccountId: req.recorder.kind === "SUPPLIER_ACCOUNT" ? req.recorder.supplierAccountId : null,
    recordedBySystemLabel: req.recorder.kind === "SYSTEM" ? req.recorder.label.trim() : null,
    mode: req.mode,
    // Kept only where it is the proof of a signature: it is also the key that lets one password entry sign one act (`@@unique([sessionId, stepUpAt])`).
    stepUpAt: signedWithPassword(req) ? (req.stepUpAt ?? null) : null,
    sessionId: req.recorder.kind === "SYSTEM" ? null : req.recorder.sessionId,
    paperReference: (req.paperReference ?? "").trim(),
    reason: (req.reason ?? "").trim(),
    documentEntity: req.document ? req.document.entity.trim() : null,
    documentId: req.document ? req.document.id.trim() : null,
    roleCode: req.roleCode?.trim() || null,
    effectiveOn: req.effectiveOn ? dayToDate(req.effectiveOn) : null,
    backdateReason: req.backdate ? req.backdate.reason.trim() : "",
    backdateAuthorisedByPersonId: req.backdate ? req.backdate.authorisedByPersonId : null,
  } as const;
}

// --------------------------------------------------------------------------------------------- reading one

/// An act's slot may be written again (a variation returned and decided again, a conflict declared a second time on one step): each write is a new
/// occurrence, numbered from 1, and the one in force is the highest. Earlier ones stay as the evidence of who acted before.
export function latestAttribution<T extends { occurrence: number }>(rows: readonly T[]): T | null {
  let best: T | null = null;
  for (const r of rows) if (!best || r.occurrence > best.occurrence) best = r;
  return best;
}

export type AttributionState = "SIGNED" | "ON_BEHALF" | "LEGACY" | "MISSING";

export interface AttributionRead {
  state: AttributionState;
  en: string;
}

export interface AttributionFacts {
  /// The act's attribution row, or null where there is none.
  row: {
    mode: ActModeName;
    recordedBySystemLabel: string | null;
    /// Set where the act was back-dated: the day it is dated, and who authorised it.
    effectiveOn?: string | null;
    backdateAuthorisedByName?: string | null;
    /// The day the person named confirmed the back-dating in a signature of their own (Phase 5a, ruling item 9); null until they do.
    backdateConfirmedOn?: string | null;
  } | null;
  /// The name of the person the act is attributed to (the slot's own value).
  subjectName: string;
  /// The name of whoever recorded it: the person, or the supplier's contact. Unused for a system recorder.
  recorderName: string | null;
  /// Whether the act's audit row names an actor: false for everything written before sign-in.
  auditAttributed: boolean;
  /// The slot, where it is known: a signed act that is not a signature reads in the slot's own words ("Received by X"), not as a signature.
  slot?: { label: string; ms: string; signatureClass: boolean };
}

export function attributionLabel(f: AttributionFacts): AttributionRead {
  if (f.row) {
    if (f.row.mode === "SIGNED") {
      // The authoriser is named by the recorder, and until that person confirms it in a signature of their own (Phase 5a) it is read as the recorder's claim and never as fact.
      const who = f.row.backdateAuthorisedByName;
      const confirmed = f.row.backdateConfirmedOn;
      const back = f.row.effectiveOn
        ? {
            en: `, dated ${f.row.effectiveOn} (back-dated${who ? (confirmed ? `; ${who} confirmed it on ${confirmed}` : `; the signer names ${who} as authorising it, not confirmed`) : ""})`,
          }
        : { en: "" };
      if (f.slot && !f.slot.signatureClass) return { state: "SIGNED", en: `${f.slot.label} ${f.subjectName}${back.en}` };
      return { state: "SIGNED", en: `Signed by ${f.subjectName}${back.en}` };
    }
    // A loader's paper history reads short on a working screen; the long form stays in the History (audit view).
    if (f.row.recordedBySystemLabel) return { state: "ON_BEHALF", en: `${f.subjectName} · from paper` };
    const by = f.recorderName ?? "a person no longer on record";
    return {
      state: "ON_BEHALF",
      en: `Recorded by ${by} on behalf of ${f.subjectName}, ${NOT_SIGNED_WORDS}`,
    };
  }
  if (!f.auditAttributed) {
    return { state: "LEGACY", en: `Recorded on behalf of ${f.subjectName}, ${NOT_SIGNED_WORDS} (before sign-in)` };
  }
  return { state: "MISSING", en: "Attribution missing" };
}
