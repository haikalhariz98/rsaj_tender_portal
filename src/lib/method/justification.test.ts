import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SPEC_METHODS, SPEC_REASONS } from "./fixture";
import { findingText } from "./labels";
import { dossierEvidenceMissing, dossierFault, justificationFaults, reasonsFor, type JustificationDraft } from "./justification";

// The exercise's evidence as the document store counts it (scope ruling: a required input).
const none = { dossier: 0, scope: 0 };

const on = new Date("2026-09-30T00:00:00Z");
const m = (code: string) => SPEC_METHODS.find((x) => x.code === code)!;
const d = (x: Partial<JustificationDraft> = {}): JustificationDraft => ({ justificationReasonCode: null, evidenceNote: "", dossierReference: null, emergencyTrigger: "", coordinationMeetingOn: null, ...x });
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("the direct-appointment dossier (FR-MTD-009)", () => {
  it("a dossier method needs a reason code", () => {
    expect(codes(justificationFaults(m("selective_direct"), d(), SPEC_REASONS, on, none))).toEqual(["REASON_REQUIRED", "EVIDENCE_NOT_ATTACHED"]);
  });
  it("with no reasons configured the fault says where to set them", () => {
    const f = justificationFaults(m("selective_direct"), d(), [], on, none);
    expect(codes(f)).toContain("REASONS_NOT_SET");
    expect(findingText(f[0])).toMatch(/Reference data/);
  });
  it("evidence is never a pass: always 'not attached' while nothing is attached", () => {
    const f = justificationFaults(m("selective_direct"), d({ justificationReasonCode: "SOLE_DISTRIBUTOR", evidenceNote: "OEM letter on file" }), SPEC_REASONS, on, { dossier: 0, scope: 0 });
    expect(f).toEqual([{ code: "EVIDENCE_NOT_ATTACHED", level: "warn" }]);
    expect(findingText(f[0])).toMatch(/not attached/);
  });
  it("a reason for another method is not offered", () => {
    const other = [{ ...SPEC_REASONS[0], sourcingMethodCode: "specialist" }];
    expect(reasonsFor(other, "selective_direct", on)).toEqual([]);
  });
  it("6.11's gate: no reason, no reference, or no attachment each refuse approval", () => {
    expect(codes(dossierFault(m("selective_direct"), { justificationReasonCode: null, dossierReference: null, evidenceAttachments: 0 }))).toEqual(["REASON_REQUIRED", "DOSSIER_UNNUMBERED", "EVIDENCE_NOT_ATTACHED"]);
    expect(dossierFault(m("selective_direct"), { justificationReasonCode: "X", dossierReference: "DA/1", evidenceAttachments: 1 })).toEqual([]);
    expect(dossierFault(m("direct"), { justificationReasonCode: null, dossierReference: null, evidenceAttachments: 0 })).toEqual([]);
  });
});

describe("the emergency coordination record (FR-REQ-013)", () => {
  it("needs the trigger and the meeting date; the scope document is not attached", () => {
    expect(codes(justificationFaults(m("emergency"), d(), SPEC_REASONS, on, none))).toEqual(["COORDINATION_RECORD_REQUIRED", "SCOPE_DOCUMENT_NOT_ATTACHED"]);
    expect(codes(justificationFaults(m("emergency"), d({ emergencyTrigger: "Main burst", coordinationMeetingOn: "2026-09-02" }), SPEC_REASONS, on, none))).toEqual(["SCOPE_DOCUMENT_NOT_ATTACHED"]);
  });
});

describe("the dossier evidence note on the Award tab and the new-award form (review carry 7)", () => {
  const numbered = { justificationReasonCode: "X", dossierReference: "DA/1" };
  it("shows while dossierFault finds no live evidence, and not once one is attached", () => {
    expect(dossierEvidenceMissing(m("selective_direct"), { ...numbered, evidenceAttachments: 0 })).toBe(true);
    expect(dossierEvidenceMissing(m("selective_direct"), { ...numbered, evidenceAttachments: 1 })).toBe(false);
  });
  it("is the evidence finding only: a missing reason or reference does not raise it", () => {
    expect(dossierEvidenceMissing(m("selective_direct"), { justificationReasonCode: null, dossierReference: null, evidenceAttachments: 1 })).toBe(false);
  });
  it("never for a method without a dossier, or with no method", () => {
    expect(dossierEvidenceMissing(m("direct"), { ...numbered, evidenceAttachments: 0 })).toBe(false);
    expect(dossierEvidenceMissing(null, { ...numbered, evidenceAttachments: 0 })).toBe(false);
  });
  it("both screens ask it, never a count of their own (source scan)", () => {
    for (const p of ["src/app/sourcing/[id]/page.tsx", "src/app/awards/new/page.tsx"]) {
      const text = readFileSync(join(process.cwd(), p), "utf8");
      expect(text, p).toMatch(/dossier=\{dossierEvidenceMissing\(/);
      expect(text, p).not.toMatch(/dossier=\{[^}]*=== 0\}/);
    }
  });
});
