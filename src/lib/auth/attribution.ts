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
}

const fault = (code: string, en: string, ms: string): Fault => ({ code, en, ms });

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

/// What stops this attribution being written, in both languages. Empty: it may be written.
export function attributionFaults(req: AttributionRequest): Fault[] {
  const out: Fault[] = [];
  const registered = slotOf(req.entity, req.slot);
  if (!registered) {
    return [fault("UNKNOWN_SLOT", "This act has no registered person slot, so it cannot be attributed.", "Tindakan ini tidak mempunyai slot orang yang berdaftar, jadi ia tidak boleh dikaitkan.")];
  }
  const signatureClass = registered.signatureClass;
  const system = req.recorder.kind === "SYSTEM";
  if (req.recorder.kind === "SYSTEM" && req.recorder.label.trim() === "") {
    out.push(fault("SYSTEM_UNLABELLED", "A system act says what it is.", "Tindakan sistem menyatakan apa ia."));
  }

  if (req.mode === "SIGNED") {
    if (!sameParty(req.subject, req.recorder)) {
      out.push(
        fault(
          "SIGNED_BY_ANOTHER",
          "An act is signed only by the person it is attributed to, in their own session. Recording it for someone else is recorded on their behalf, and is not a signature.",
          "Sesuatu tindakan hanya ditandatangani oleh orang yang dikaitkan dengannya, dalam sesinya sendiri. Merekodkannya bagi pihak orang lain direkodkan bagi pihaknya, dan bukan tandatangan.",
        ),
      );
    }
    if (signatureClass && !req.stepUpAt) {
      out.push(fault("STEP_UP_REQUIRED", "This act needs the password again. Enter it to sign.", "Tindakan ini memerlukan kata laluan sekali lagi. Masukkannya untuk menandatangani."));
    }
    return out;
  }

  // Recorded on someone's behalf, from paper.
  const paper = (req.paperReference ?? "").trim();
  const why = (req.reason ?? "").trim();
  if (paper === "" && why === "") {
    out.push(fault("PAPER_OR_REASON_REQUIRED", "Recording an act on someone's behalf needs the paper it came from or the reason it is recorded.", "Merekodkan tindakan bagi pihak seseorang memerlukan kertas asalnya atau sebab ia direkodkan."));
  }
  if (signatureClass && !system) {
    if (!req.recorderPermissions?.has("acts.recordOnBehalf")) {
      out.push(
        fault(
          "NOT_PERMITTED_TO_RECORD",
          "Recording an approval, signature or unsealing from paper needs the permission to record on someone's behalf, which you do not hold.",
          "Merekodkan kelulusan, tandatangan atau pembukaan meterai daripada kertas memerlukan kebenaran merekod bagi pihak seseorang, yang tidak anda pegang.",
        ),
      );
    }
    if (paper === "") {
      out.push(fault("PAPER_REFERENCE_REQUIRED", "A paper decision is recorded with the reference of the paper it came from.", "Keputusan atas kertas direkodkan dengan rujukan kertas asalnya."));
    }
    if (req.paperSignatureRecording == null) {
      out.push(
        fault(
          "PAPER_SWITCH_NOT_SET",
          "The organisation has not set whether a paper decision may be recorded for someone else, so it cannot be recorded. That setting is the organisation's to choose.",
          "Organisasi belum menetapkan sama ada keputusan atas kertas boleh direkodkan bagi pihak orang lain, jadi ia tidak boleh direkodkan. Tetapan itu pilihan organisasi.",
        ),
      );
    } else if (req.paperSignatureRecording === "REFUSED") {
      out.push(fault("PAPER_REFUSED", "The organisation does not allow a paper decision to be recorded for someone else.", "Organisasi tidak membenarkan keputusan atas kertas direkodkan bagi pihak orang lain."));
    }
  }
  return out;
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
    stepUpAt: req.recorder.kind === "SYSTEM" ? null : (req.stepUpAt ?? null),
    sessionId: req.recorder.kind === "SYSTEM" ? null : req.recorder.sessionId,
    paperReference: (req.paperReference ?? "").trim(),
    reason: (req.reason ?? "").trim(),
  } as const;
}

// --------------------------------------------------------------------------------------------- reading one

export type AttributionState = "SIGNED" | "ON_BEHALF" | "LEGACY" | "MISSING";

export interface AttributionRead {
  state: AttributionState;
  en: string;
  ms: string;
}

export interface AttributionFacts {
  /// The act's attribution row, or null where there is none.
  row: { mode: ActModeName; recordedBySystemLabel: string | null } | null;
  /// The name of the person the act is attributed to (the slot's own value).
  subjectName: string;
  /// The name of whoever recorded it: the person, or the supplier's contact. Unused for a system recorder.
  recorderName: string | null;
  /// Whether the act's audit row names an actor: false for everything written before sign-in.
  auditAttributed: boolean;
}

export function attributionLabel(f: AttributionFacts): AttributionRead {
  if (f.row) {
    if (f.row.mode === "SIGNED") return { state: "SIGNED", en: `Signed by ${f.subjectName}`, ms: `Ditandatangani oleh ${f.subjectName}` };
    const by = f.row.recordedBySystemLabel ?? f.recorderName ?? "a person no longer on record";
    return {
      state: "ON_BEHALF",
      en: `Recorded by ${by} on behalf of ${f.subjectName}, ${NOT_SIGNED_WORDS}`,
      ms: `Direkodkan oleh ${by} bagi pihak ${f.subjectName}, tidak ditandatangani`,
    };
  }
  if (!f.auditAttributed) {
    return { state: "LEGACY", en: `Recorded on behalf of ${f.subjectName}, ${NOT_SIGNED_WORDS} (before sign-in)`, ms: `Direkodkan bagi pihak ${f.subjectName}, tidak ditandatangani (sebelum log masuk)` };
  }
  return { state: "MISSING", en: "Attribution missing", ms: "Pengaitan tiada" };
}
