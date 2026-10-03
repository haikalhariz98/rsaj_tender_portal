import { describe, expect, it } from "vitest";

import { fieldsNamed } from "@/lib/templates/merge";

import { dateAtIssue, dateCorrectionFaults, earliestCorrectionDay, type DateCorrection } from "./date";
import { certificateFieldValues } from "./fields";
import { FIVE_RECIPIENTS, INTERIM_BLOCKS } from "./fixture";
import { renderIssue } from "./issue";
import { pinRevision } from "./revision";
import { allSigned, signFaults, type SignContext, type SignInput } from "./signature";
import { CERTIFICATE_STATUSES, type SignedBlock } from "./types";

/**
 * 6.14 inc 1 fix round: the certificate's date.
 * - M-1: a date corrected while the certificate is being signed is the date it is issued with: in its frozen
 *   text, its fields and its issue snapshot (all read from one `certificateDate`), never the dating
 *   signature's day.
 * - R-9: a correction is made only while it is being signed: issued, the date is final (ADR 0022 §3); void,
 *   it stays as it was; before the dating block there is nothing to correct.
 * - R-10: an outsider's day (the contractor, a witness) has a floor: never before the certificate was opened,
 *   never before its route was approved where it has one. The correction has the same floor.
 */

const codes = (fs: readonly { code: string }[] | { faults: readonly { code: string }[] }) => ("faults" in fs ? fs.faults : fs).map((f) => f.code);
const signed = (blockOrder: number, signedOn: string, personId: string | null = null): SignedBlock => ({ blockOrder, personId, name: "x", signedOn, refused: false, decision: null });
const correction = (over: Partial<DateCorrection> = {}): DateCorrection => ({ status: "SIGNING", current: "2026-10-03", proposed: "2026-10-02", reason: "Signed on paper the day before", today: "2026-10-03", earliestAllowed: "2026-10-02", openedOn: "2026-10-01", approvedOn: null, ...over });

describe("M-1: a date corrected before issue is the date it is issued with (a demo_hct4-like path)", () => {
  // demo_hct4: an advance payment certificate on the interim form, its first block recorded on 2 October.
  const blocks = INTERIM_BLOCKS;
  const ro = signed(1, "2026-10-02", "p-ro");
  const so = signed(2, "2026-10-03", "p-so"); // dates the certificate: 3 October
  it("the dating block dates it 3 October; corrected while signing to 2 October; the contractor and the witness sign; it issues dated 2 October", () => {
    // The correction: SIGNING, earlier, with a reason, not before the recommending block's day.
    expect(earliestCorrectionDay(blocks, [ro, so])).toBe("2026-10-02");
    expect(dateCorrectionFaults(correction())).toEqual([]);
    const stored = "2026-10-02"; // the column after the correction, read under the lock by the next act
    // The contractor signs on 3 October (not the dating block), then the witness: the last signature issues.
    const after = [ro, so, signed(3, "2026-10-03"), signed(4, "2026-10-03")];
    expect(allSigned(blocks, after)).toBe(true);
    const issuedWith = dateAtIssue(null, stored);
    expect(issuedWith).toBe("2026-10-02");
    // The frozen text and the fields carry it.
    const rev = pinRevision({ id: "t", code: "c", nameEn: "Interim", nameMs: null, formCode: "", revisionDate: null, bodyVersion: 1, bodyEn: "Dated {{certificate.date}}.", bodyMs: null, blocks, distribution: FIVE_RECIPIENTS }, "2026-10-02");
    const values = (lang: "EN" | "MS") => certificateFieldValues({ lang, organisationName: "O", contract: { number: "C/1", title: "T", contractorName: "K" }, baseline: { contractSum: "1.00", contractDate: "2026-09-30", completionPeriod: 1, completionUnit: "MONTHS" }, certificate: { kind: "ADVANCE_PAYMENT", number: "N/1", sequence: 1, date: issuedWith }, figures: { lines: [], totals: [] } });
    expect(renderIssue(rev, "ADVANCE_PAYMENT", values).texts).toEqual([{ language: "EN", text: "Dated 2 October 2026." }]);
    expect(values("EN")["certificate.date"]).toBe("2 October 2026");
    expect(fieldsNamed(rev.bodyEn!)).toEqual(["certificate.date"]);
  });
  it("where the last act is the dating block's own, it issues with that act's day", () => {
    expect(dateAtIssue("2026-10-03", null)).toBe("2026-10-03");
  });
  it("a form with no dating block issues undated (and its text cannot print a date: M-2 refuses it at the pin)", () => {
    expect(dateAtIssue(null, null)).toBeNull();
  });
});

describe("R-9: the date is corrected only while the certificate is being signed", () => {
  it("issued: final; void: as it was; draft or on its routing sheet: not dated yet", () => {
    expect(codes(dateCorrectionFaults(correction({ status: "ISSUED" })))).toEqual(["ISSUED_DATE_FINAL"]);
    expect(codes(dateCorrectionFaults(correction({ status: "VOID" })))).toEqual(["VOID_IS_FINAL"]);
    expect(codes(dateCorrectionFaults(correction({ status: "DRAFT" })))).toEqual(["NOT_DATED"]);
    expect(codes(dateCorrectionFaults(correction({ status: "IN_ROUTING" })))).toEqual(["NOT_DATED"]);
    expect(codes(dateCorrectionFaults(correction({ status: "SIGNING" })))).toEqual([]);
  });
  it("every status has an answer", () => {
    for (const s of CERTIFICATE_STATUSES) expect(Array.isArray(dateCorrectionFaults(correction({ status: s }))), s).toBe(true);
  });
  it("never before the day it was opened or its route approved; the day itself is allowed", () => {
    expect(codes(dateCorrectionFaults(correction({ earliestAllowed: null, openedOn: "2026-10-02" })))).toEqual([]);
    expect(codes(dateCorrectionFaults(correction({ earliestAllowed: null, openedOn: "2026-10-03" })))).toEqual(["BEFORE_OPENED"]);
    expect(codes(dateCorrectionFaults(correction({ earliestAllowed: null, approvedOn: "2026-10-02" })))).toEqual([]);
    expect(codes(dateCorrectionFaults(correction({ earliestAllowed: null, current: "2026-10-04", today: "2026-10-04", proposed: "2026-10-02", approvedOn: "2026-10-03" })))).toEqual(["BEFORE_APPROVED"]);
  });
});

describe("R-10: an outsider's signature day has a floor", () => {
  const TODAY = "2026-10-05";
  const ctx = (over: Partial<SignContext> = {}): SignContext => ({ status: "SIGNING", today: TODAY, person: null, holders: null, valueBearing: true, openedOn: "2026-10-01", approvedOn: null, ...over });
  const contractor = (signedOn: string): SignInput => ({ blockOrder: 3, name: "Contractor's signatory", icNumber: "", signedOn, refused: false, refusalNote: "", decision: null, decisionCap: null });
  const before = [signed(1, "2026-09-20", "p-ro"), signed(2, "2026-09-20", "p-so")];
  it("not before the certificate was opened (the earlier blocks' days notwithstanding); the opening day itself is allowed", () => {
    expect(codes(signFaults(INTERIM_BLOCKS, before, contractor("2026-09-30"), ctx()))).toEqual(["BEFORE_OPENED"]);
    expect(codes(signFaults(INTERIM_BLOCKS, before, contractor("2026-10-01"), ctx()))).toEqual([]);
  });
  it("not before its route was approved; the approved day itself is allowed", () => {
    expect(codes(signFaults(INTERIM_BLOCKS, before, contractor("2026-10-02"), ctx({ approvedOn: "2026-10-03" })))).toEqual(["BEFORE_APPROVED"]);
    expect(codes(signFaults(INTERIM_BLOCKS, before, contractor("2026-10-03"), ctx({ approvedOn: "2026-10-03" })))).toEqual([]);
  });
  it("a witness, and an outsider's dating block, are held the same way", () => {
    const blocks = INTERIM_BLOCKS.map((b) => (b.blockOrder === 3 ? { ...b, datesCertificate: true } : b.blockOrder === 2 ? { ...b, datesCertificate: false } : b));
    expect(codes(signFaults(blocks, before, contractor("2026-09-25"), ctx()))).toEqual(["BEFORE_OPENED"]);
    const witness: SignInput = { ...contractor("2026-09-25"), blockOrder: 4, name: "Witness" };
    expect(codes(signFaults(INTERIM_BLOCKS, [...before, signed(3, "2026-09-20")], witness, ctx()))).toEqual(["BEFORE_OPENED"]);
  });
});
