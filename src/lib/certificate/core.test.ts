import { describe, expect, it } from "vitest";

import { fieldsNamed } from "@/lib/templates/merge";

import { certificateDateOf, dateCorrectionFaults, earliestCorrectionDay } from "./date";
import { acknowledgeFaults, copiesFor, despatchFaults, distributionFaults, distributionState } from "./distribution";
import { ANY_CERTIFICATE_FIELD, certificateFieldValues, mergeFields } from "./fields";
import { FIVE_RECIPIENTS, INTERIM_BLOCKS, INTERIM_FIGURES, row } from "./fixture";
import { renderIssue } from "./issue";
import { applyOverrides } from "./override";
import { pinFaults, pinRevision, readRevision, type TemplateNow } from "./revision";
import { nextSequence } from "./sequence";
import { CERTIFICATE_TRANSITIONS, certificateTransition, figuresOpen } from "./status";
import { CERTIFICATE_STATUSES, type SignedBlock } from "./types";

const signed = (blockOrder: number, signedOn: string): SignedBlock => ({ blockOrder, personId: null, name: "x", signedOn, refused: false, decision: null });
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("the certificate's date (FR-CRT-005)", () => {
  it("is the day of the dating block's act, and not before", () => {
    expect(certificateDateOf(INTERIM_BLOCKS, [signed(1, "2026-09-28")])).toEqual({ state: "NOT_YET", block: "Superintending Officer" });
    expect(certificateDateOf(INTERIM_BLOCKS, [signed(1, "2026-09-28"), signed(2, "2026-09-30")])).toEqual({ state: "DATED", day: "2026-09-30", block: "Superintending Officer" });
  });
  it("a form with no dating block dates nothing, and says so", () => {
    expect(certificateDateOf(INTERIM_BLOCKS.map((b) => ({ ...b, datesCertificate: false })), [])).toEqual({ state: "NO_DATING_BLOCK" });
  });
  it("a correction (as 6.12 OD-1 A): earlier only, with a reason, never future, never before an earlier block", () => {
    const base = { current: "2026-09-30", proposed: "2026-09-29", reason: "Signed on paper the day before", today: "2026-10-02", earliestAllowed: "2026-09-28" };
    expect(dateCorrectionFaults(base)).toEqual([]);
    expect(codes(dateCorrectionFaults({ ...base, proposed: "2026-09-30" }))).toEqual(["NOT_EARLIER"]);
    expect(codes(dateCorrectionFaults({ ...base, proposed: "2026-09-27" }))).toEqual(["BEFORE_EARLIER"]);
    expect(codes(dateCorrectionFaults({ ...base, reason: " " }))).toEqual(["REASON_REQUIRED"]);
    expect(codes(dateCorrectionFaults({ ...base, current: null }))).toEqual(["NOT_DATED"]);
    expect(codes(dateCorrectionFaults({ ...base, current: "2026-10-05", proposed: "2026-10-03" }))).toEqual(["FUTURE_DATE"]);
    expect(earliestCorrectionDay(INTERIM_BLOCKS, [signed(1, "2026-09-28"), signed(2, "2026-09-30")])).toBe("2026-09-28");
  });
});

describe("distribution (FR-CRT-006)", () => {
  it("interim / VO-663 / CPC / CMGD style: the original and four copies, the guarantor's addressed to the bond's issuer (FR-VAR-023, FR-CMP-009)", () => {
    const p = copiesFor(FIVE_RECIPIENTS, { liveBond: { issuerName: "Demo Bank Berhad" }, consultingEngineer: false });
    expect(p.faults).toEqual([]);
    expect(p.copies.map((c) => [c.copyNo, c.distributionCode, c.isOriginal, c.addressedTo])).toEqual([
      [1, "contractor", true, "The contractor (original)"],
      [2, "finance", false, "Accounts and finance"],
      [3, "department", false, "The implementing department"],
      [4, "file", false, "Contract file"],
      [5, "guarantor", false, "Demo Bank Berhad"],
    ]);
  });
  it("the guarantor's row is skipped where the contract has no live bond", () => {
    const p = copiesFor(FIVE_RECIPIENTS, { liveBond: null, consultingEngineer: null });
    expect(p.copies.map((c) => c.distributionCode)).toEqual(["contractor", "finance", "department", "file"]);
    expect(p.skipped).toEqual([{ recipientName: "The guarantor", why: "NO_LIVE_BOND" }]);
  });
  it("the consulting engineer's row: refused while unanswered, skipped where none is engaged", () => {
    const rows = [row("ce", 1, { condition: "CONSULTANT_ENGAGED" })];
    expect(codes(copiesFor(rows, { liveBond: null, consultingEngineer: null }).faults)).toEqual(["CONSULTANT_NOT_ANSWERED"]);
    expect(copiesFor(rows, { liveBond: null, consultingEngineer: false }).skipped).toHaveLength(1);
    expect(copiesFor(rows, { liveBond: null, consultingEngineer: true }).copies).toHaveLength(1);
    expect(codes(copiesFor([], { liveBond: null, consultingEngineer: true }).faults)).toEqual(["NO_DISTRIBUTION_LIST"]);
  });
  it("a mandatory copy not gone blocks distributed", () => {
    const c = (despatchedOn: string | null, mandatory = true, ackRequired = false, acknowledgedOn: string | null = null) => ({ mandatory, ackRequired, despatchedOn, acknowledgedOn });
    expect(codes(distributionFaults([c("2026-09-30"), c(null)]))).toEqual(["NOT_DISTRIBUTED"]);
    expect(distributionFaults([c("2026-09-30"), c(null, false)])).toEqual([]);
    expect(distributionState([c("2026-09-30", true, true)])).toEqual({ distributed: true, undespatchedMandatory: 0, awaitingAck: 1 });
    expect(distributionState([])).toMatchObject({ distributed: false });
  });
  it("acknowledgement before despatch is refused; despatch not before issue or in the future", () => {
    const copy = { mandatory: true, ackRequired: true, despatchedOn: null, acknowledgedOn: null };
    expect(codes(acknowledgeFaults(copy, "2026-09-30", "2026-10-02"))).toEqual(["ACK_BEFORE_DESPATCH"]);
    expect(codes(acknowledgeFaults({ ...copy, despatchedOn: "2026-09-30" }, "2026-09-29", "2026-10-02"))).toEqual(["BEFORE_DESPATCH"]);
    expect(codes(acknowledgeFaults({ ...copy, despatchedOn: "2026-09-30", acknowledgedOn: "2026-10-01" }, "2026-10-01", "2026-10-02"))).toEqual(["ALREADY_ACKNOWLEDGED"]);
    expect(codes(despatchFaults(copy, "2026-09-29", "2026-10-02", "2026-09-30"))).toEqual(["BEFORE_ISSUE"]);
    expect(codes(despatchFaults(copy, "2026-10-03", "2026-10-02", "2026-09-30"))).toEqual(["FUTURE_DATE"]);
    expect(codes(despatchFaults({ ...copy, despatchedOn: "2026-10-01" }, "2026-10-02", "2026-10-02", "2026-09-30"))).toEqual(["ALREADY_DESPATCHED"]);
  });
});

describe("the per-contract sequence", () => {
  it("the third issued interim is 3; a voided draft leaves no gap; another kind, or another contract, starts at 1", () => {
    const issued = [
      { kind: "INTERIM_PAYMENT" as const, sequence: 1 },
      { kind: "INTERIM_PAYMENT" as const, sequence: 2 },
      { kind: "INTERIM_PAYMENT" as const, sequence: null }, // a draft voided before issue: never numbered
      { kind: "VARIATION" as const, sequence: 1 },
    ];
    expect(nextSequence(issued, "INTERIM_PAYMENT")).toBe(3);
    expect(nextSequence(issued, "ADVANCE_PAYMENT")).toBe(1);
    expect(nextSequence([], "INTERIM_PAYMENT")).toBe(1);
  });
});

describe("status", () => {
  it("every status has its moves (X-8), and nothing leaves ISSUED or VOID", () => {
    expect(Object.keys(CERTIFICATE_TRANSITIONS).sort()).toEqual([...CERTIFICATE_STATUSES].sort());
    expect(certificateTransition("DRAFT", "IN_ROUTING")).toBeNull();
    expect(certificateTransition("DRAFT", "SIGNING")).toBeNull();
    expect(certificateTransition("IN_ROUTING", "SIGNING")).toBeNull();
    expect(certificateTransition("SIGNING", "ISSUED")).toBeNull();
    expect(certificateTransition("SIGNING", "VOID")).toBeNull();
    expect(certificateTransition("ISSUED", "VOID")).toBe("ISSUED_IS_FINAL");
    expect(certificateTransition("VOID", "DRAFT")).toBe("VOID_IS_FINAL");
    expect(certificateTransition("IN_ROUTING", "DRAFT")).toBe("NOT_ALLOWED");
    expect(certificateTransition("DRAFT", "ISSUED")).toBe("NOT_ALLOWED");
  });
  it("figures move only in DRAFT", () => {
    expect(CERTIFICATE_STATUSES.filter(figuresOpen)).toEqual(["DRAFT"]);
  });
});

const FORM: TemplateNow = {
  id: "tpl",
  code: "interim",
  nameEn: "Interim certificate (fixture)",
  nameMs: null,
  formCode: "FX-1",
  revisionDate: "2025-06-01",
  bodyVersion: 3,
  bodyEn: "Certificate {{certificate.number}} for {{contract.number}}, dated {{certificate.date}}. Sum {{contract.sum}}.",
  bodyMs: null,
  blocks: [INTERIM_BLOCKS[1], INTERIM_BLOCKS[0]],
  distribution: FIVE_RECIPIENTS,
};

describe("the pinned revision (OD-2 A)", () => {
  it("pins blocks in printed order, the list, and the text, and is read back", () => {
    const r = pinRevision(FORM, "2026-09-28");
    expect(r.blocks.map((b) => b.blockOrder)).toEqual([1, 2]);
    expect(r.bodyVersion).toBe(3);
    expect(readRevision(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(readRevision({})).toBeNull();
  });
  it("a later edit to the form does not move what was pinned", () => {
    const form = { ...FORM, blocks: [...FORM.blocks] };
    const r = pinRevision(form, "2026-09-28");
    form.blocks.push({ ...INTERIM_BLOCKS[2] });
    expect(r.blocks).toHaveLength(2);
  });
  it("nothing undecided is pinned: no form, no blocks, an undecided delegation, no list, no text, an unknown field", () => {
    const ok = pinFaults(FORM, ANY_CERTIFICATE_FIELD, fieldsNamed);
    expect(ok).toEqual([]);
    expect(codes(pinFaults(null, ANY_CERTIFICATE_FIELD, fieldsNamed))).toEqual(["TEMPLATE_NOT_SET"]);
    expect(codes(pinFaults({ ...FORM, blocks: [] }, ANY_CERTIFICATE_FIELD, fieldsNamed))).toEqual(["NO_BLOCKS"]);
    expect(codes(pinFaults({ ...FORM, blocks: [{ ...INTERIM_BLOCKS[0], delegable: null }] }, ANY_CERTIFICATE_FIELD, fieldsNamed))).toEqual(["DELEGABLE_UNDECIDED"]);
    expect(codes(pinFaults({ ...FORM, distribution: [] }, ANY_CERTIFICATE_FIELD, fieldsNamed))).toEqual(["NO_DISTRIBUTION_LIST"]);
    expect(codes(pinFaults({ ...FORM, bodyEn: " " }, ANY_CERTIFICATE_FIELD, fieldsNamed))).toEqual(["TEMPLATE_BODY_EMPTY"]);
    expect(codes(pinFaults({ ...FORM, bodyEn: "{{award.value}}" }, ANY_CERTIFICATE_FIELD, fieldsNamed))).toEqual(["UNKNOWN_FIELDS"]);
  });
});

describe("merge fields (FR-CRT-002) and the frozen text", () => {
  const values = (lang: "EN" | "MS") =>
    certificateFieldValues({
      lang,
      organisationName: "Demo Utilities",
      contract: { number: "DEMO/C/1", title: "Pipe works", contractorName: "Demo Contractor" },
      baseline: { contractSum: "450000.00", contractDate: "2026-09-30", completionPeriod: 12, completionUnit: "MONTHS" },
      certificate: { kind: "INTERIM_PAYMENT", number: "DEMO/CERT/00231", sequence: 1, date: "2026-10-01" },
      figures: applyOverrides(INTERIM_FIGURES, []),
    });
  it("every field a certificate fills resolves from the frozen figures, the pinned baseline or the contract", () => {
    const v = values("EN");
    expect(v["contract.sum"]).toBe("RM450,000.00");
    expect(v["certificate.date"]).toBe("1 October 2026");
    expect(v["figure.amountDue"]).toBe("RM64,000.00");
    expect(v["figure.retentionPct"]).toBe("5%");
    expect(values("MS")["certificate.kind"]).toBe("Perakuan bayaran interim");
  });
  it("increment 1 lets no form name a figure (the owning module lists its keys)", () => {
    expect(mergeFields("INTERIM_PAYMENT").has("figure.amountDue")).toBe(false);
    expect(mergeFields("INTERIM_PAYMENT").has("certificate.date")).toBe(true);
  });
  it("renders the pinned text; a missing value or an unknown field refuses, named", () => {
    const rev = pinRevision(FORM, "2026-09-28");
    const ok = renderIssue(rev, "INTERIM_PAYMENT", values);
    expect(ok.faults).toEqual([]);
    expect(ok.texts).toEqual([{ language: "EN", text: "Certificate DEMO/CERT/00231 for DEMO/C/1, dated 1 October 2026. Sum RM450,000.00." }]);
    const missing = renderIssue(rev, "INTERIM_PAYMENT", (l) => ({ ...values(l), "certificate.date": "" }));
    expect(codes(missing.faults)).toEqual(["MISSING_FIELDS"]);
    expect(missing.faults[0].data).toEqual({ fields: "Certificate date" });
    const unknown = renderIssue({ ...rev, bodyEn: "{{figure.amountDue}}" }, "INTERIM_PAYMENT", values);
    expect(codes(unknown.faults)).toEqual(["UNKNOWN_FIELDS"]);
    expect(codes(renderIssue({ ...rev, bodyEn: null }, "INTERIM_PAYMENT", values).faults)).toEqual(["TEMPLATE_BODY_EMPTY"]);
  });
});
