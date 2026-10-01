import { describe, expect, it } from "vitest";

import { SPEC_METHODS, SPEC_REASONS } from "@/lib/method/fixture";
import { dossierFault, justificationFaults } from "@/lib/method/justification";

import { evidenceCount, evidencePins, evidenceSnapshot, exerciseEvidence, isEvidenceSnapshot, snapshotFaults } from "./evidence";
import type { AttachmentFact, AttachmentPurpose } from "./types";

const day = new Date("2026-09-30T00:00:00Z");
let n = 0;
const row = (purpose: AttachmentPurpose, x: { detached?: boolean; withdrawn?: boolean } = {}): AttachmentFact => {
  n++;
  return {
    id: `a${n}`,
    purpose,
    detachedAt: x.detached ? day : null,
    version: { id: `v${n}`, documentId: `d${n}`, versionNo: 1, sha256: String(n).padStart(64, "0"), withdrawnAt: x.withdrawn ? day : null, title: `Evidence ${n}` },
  };
};

const direct = SPEC_METHODS.find((m) => m.code === "selective_direct")!;
const emergency = SPEC_METHODS.find((m) => m.code === "emergency")!;
const dossier = (rows: AttachmentFact[]) => ({ justificationReasonCode: "SOLE_DISTRIBUTOR", dossierReference: "DA/1", evidenceAttachments: evidenceCount(rows, "DOSSIER_EVIDENCE") });
const draft = { justificationReasonCode: "SOLE_DISTRIBUTOR", evidenceNote: "OEM letter on file", dossierReference: "DA/1", emergencyTrigger: "", coordinationMeetingOn: null };
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("what 'attached' means: live, and its version not withdrawn (plan §3)", () => {
  it("counts only live attachments of the purpose", () => {
    const rows = [row("DOSSIER_EVIDENCE"), row("DOSSIER_EVIDENCE", { detached: true }), row("DOSSIER_EVIDENCE", { withdrawn: true }), row("COORDINATION_SCOPE")];
    expect(evidenceCount(rows, "DOSSIER_EVIDENCE")).toBe(1);
    expect(evidenceCount(rows, "COORDINATION_SCOPE")).toBe(1);
    expect(evidenceCount(rows, "SIGNED_MINUTES")).toBe(0);
    expect(exerciseEvidence(rows)).toEqual({ dossier: 1, scope: 1 });
  });
  it("pins name the version, its fingerprint and title, live ones only", () => {
    const rows = [row("DOSSIER_EVIDENCE"), row("DOSSIER_EVIDENCE", { withdrawn: true })];
    expect(evidencePins(rows, "DOSSIER_EVIDENCE")).toEqual([{ attachmentId: rows[0].id, documentId: rows[0].version.documentId, versionId: rows[0].version.id, versionNo: 1, sha256: rows[0].version.sha256, title: rows[0].version.title }]);
  });
});

describe("FR-MTD-009 / BD-4 lifted: the dossier passes on one live attachment (scope ruling)", () => {
  it("dossierFault passes on one attached", () => {
    expect(dossierFault(direct, dossier([row("DOSSIER_EVIDENCE")]))).toEqual([]);
  });
  it("dossierFault fails when the only evidence was detached", () => {
    expect(codes(dossierFault(direct, dossier([row("DOSSIER_EVIDENCE", { detached: true })])))).toEqual(["EVIDENCE_NOT_ATTACHED"]);
  });
  it("dossierFault fails when the only evidence's version was withdrawn", () => {
    expect(codes(dossierFault(direct, dossier([row("DOSSIER_EVIDENCE", { withdrawn: true })])))).toEqual(["EVIDENCE_NOT_ATTACHED"]);
  });
  it("evidence on another purpose is not dossier evidence", () => {
    expect(codes(dossierFault(direct, dossier([row("COORDINATION_SCOPE")])))).toEqual(["EVIDENCE_NOT_ATTACHED"]);
  });
  it("the exercise's warning clears on one live attachment, and stays for detached or withdrawn", () => {
    const at = (rows: AttachmentFact[]) => codes(justificationFaults(direct, draft, SPEC_REASONS, day, exerciseEvidence(rows)));
    expect(at([row("DOSSIER_EVIDENCE")])).toEqual([]);
    expect(at([row("DOSSIER_EVIDENCE", { detached: true })])).toEqual(["EVIDENCE_NOT_ATTACHED"]);
    expect(at([row("DOSSIER_EVIDENCE", { withdrawn: true })])).toEqual(["EVIDENCE_NOT_ATTACHED"]);
  });
  it("an emergency's scope document shows attached on one live attachment; its record still gates on the trigger and date", () => {
    const at = (rows: AttachmentFact[]) => codes(justificationFaults(emergency, { ...draft, emergencyTrigger: "Main burst", coordinationMeetingOn: "2026-09-02" }, SPEC_REASONS, day, exerciseEvidence(rows)));
    expect(at([row("COORDINATION_SCOPE")])).toEqual([]);
    expect(at([row("COORDINATION_SCOPE", { withdrawn: true })])).toEqual(["SCOPE_DOCUMENT_NOT_ATTACHED"]);
  });
});

describe("a judged record keeps the pins it was judged on", () => {
  it("the snapshot holds every live pin with its purpose and the day", () => {
    const rows = [row("DOSSIER_EVIDENCE"), row("DOSSIER_EVIDENCE", { detached: true })];
    const s = evidenceSnapshot(rows, ["DOSSIER_EVIDENCE"], "2026-09-30");
    expect(s.pins.map((p) => p.versionId)).toEqual([rows[0].version.id]);
    expect(s.pins[0].purpose).toBe("DOSSIER_EVIDENCE");
    expect(isEvidenceSnapshot(JSON.parse(JSON.stringify(s)))).toBe(true);
    expect(isEvidenceSnapshot({ v: 2 })).toBe(false);
  });
  it("issue is refused where the record has no snapshot, or a pinned version was withdrawn since", () => {
    const rows = [row("DOSSIER_EVIDENCE"), row("DOSSIER_EVIDENCE")];
    const s = evidenceSnapshot(rows, ["DOSSIER_EVIDENCE"], "2026-09-30");
    expect(snapshotFaults(s, new Set(), true)).toEqual([]);
    expect(snapshotFaults(s, new Set([rows[1].version.id]), true)).toEqual([{ code: "EVIDENCE_WITHDRAWN_SINCE_JUDGED", level: "block", data: { title: rows[1].version.title, versionNo: 1 } }]);
    expect(codes(snapshotFaults(null, new Set(), true))).toEqual(["EVIDENCE_NOT_SNAPSHOTTED"]);
    // Where no evidence is required, nothing is asked of the snapshot.
    expect(snapshotFaults(null, new Set(), false)).toEqual([]);
  });
});
