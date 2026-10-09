import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseCertificateBody, parseDiaryBody, parseSubmitBody } from "./api";
import { boardOrder, publishFaults, withdrawFaults } from "./announcements";
import { certifiedAgainstPaid, contractorBlock, signBlockFaults } from "./certificates";
import { SERVICE_NOT_SET, serviceWords, SUBMISSION_KIND_WORDS, OUTCOME_WORDS } from "./labels";
import { answerFaults, disagreementFaults, dueDayOf, serviceState, submissionFaults, KIND_SHAPE, type SubmissionInput } from "./submission";
import { SUBMISSION_KINDS, SUBMISSION_OUTCOMES } from "./types";
import { supplierHoldsContract } from "./visibility";
import { hasProjectFaultText, projectFaultText } from "./words";

/**
 * My Projects' pure rules (Phase 4e): which contracts a supplier holds, what each kind of submission asks for, the due day against the service level, the officer's answer, the
 * contractor's block on a certificate, certified against paid, the announcements board, and the parsers of the three request bodies.
 */

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);
const SCHEMA = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
const enumValues = (name: string) => [...(new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(SCHEMA)?.[1] ?? "").matchAll(/^\s+([A-Z_]+)\s*$/gm)].map((m) => m[1]);

describe("the vocabulary mirrors the schema", () => {
  it("the kinds and the outcomes are the schema's enums, in order, and each has its words", () => {
    expect([...SUBMISSION_KINDS]).toEqual(enumValues("ContractorSubmissionKind"));
    expect([...SUBMISSION_OUTCOMES]).toEqual(enumValues("ContractorSubmissionOutcome"));
    for (const k of SUBMISSION_KINDS) {
      expect(SUBMISSION_KIND_WORDS[k].en.length).toBeGreaterThan(3);
      expect(SUBMISSION_KIND_WORDS[k].ms.length).toBeGreaterThan(3);
      expect(KIND_SHAPE[k]).toBeDefined();
    }
    for (const o of SUBMISSION_OUTCOMES) expect(OUTCOME_WORDS[o].en.length).toBeGreaterThan(3);
    expect(enumValues("AnnouncementCategory")).toEqual(["IMPORTANT", "POLICY", "NOTICE"]);
  });
});

describe("which contracts a supplier holds", () => {
  it("one whose award names the supplier and stands (issued or accepted)", () => {
    expect(supplierHoldsContract({ awardVendorId: "s1", awardStatus: "ISSUED", supplierId: "s1" })).toBe(true);
    expect(supplierHoldsContract({ awardVendorId: "s1", awardStatus: "ACCEPTED", supplierId: "s1" })).toBe(true);
  });
  it("not another supplier's, not one the office has not linked, not a draft, pending or cancelled award", () => {
    expect(supplierHoldsContract({ awardVendorId: "s2", awardStatus: "ISSUED", supplierId: "s1" })).toBe(false);
    expect(supplierHoldsContract({ awardVendorId: null, awardStatus: "ISSUED", supplierId: "s1" })).toBe(false);
    for (const status of ["DRAFT", "PENDING_APPROVAL", "APPROVED", "CANCELLED"]) expect(supplierHoldsContract({ awardVendorId: "s1", awardStatus: status, supplierId: "s1" }), status).toBe(false);
  });
});

describe("a submission's fields", () => {
  const base: SubmissionInput = { kind: "WORK_PROGRAMME", title: "Revision 2", body: "Sequence revised after the valve chambers.", amount: "", aboutDay: "", lines: [], signed: false, today: "2026-10-09" };
  it("a programme, a defects report: words only", () => {
    expect(submissionFaults(base)).toEqual([]);
    expect(submissionFaults({ ...base, kind: "DEFECTS_RECTIFIED" })).toEqual([]);
    expect(codes(submissionFaults({ ...base, title: " " }))).toEqual(["TITLE_REQUIRED"]);
    expect(codes(submissionFaults({ ...base, body: "" }))).toEqual(["BODY_REQUIRED"]);
    expect(codes(submissionFaults({ ...base, title: "x".repeat(201) }))).toEqual(["TITLE_TOO_LONG"]);
    expect(codes(submissionFaults({ ...base, amount: "1.00" }))).toEqual(["AMOUNT_NOT_ON_KIND"]);
    expect(codes(submissionFaults({ ...base, lines: [{ description: "a", quantity: "1", location: "x", value: "1.00" }] }))).toEqual(["LINES_NOT_ON_KIND"]);
  });
  it("an interim claim: the amount in ringgit and sen, and the day it is made up to, not in the future", () => {
    const claim: SubmissionInput = { ...base, kind: "INTERIM_CLAIM", amount: "12500.00", aboutDay: "2026-09-30" };
    expect(submissionFaults(claim)).toEqual([]);
    expect(codes(submissionFaults({ ...claim, amount: "" }))).toEqual(["AMOUNT_REQUIRED"]);
    expect(codes(submissionFaults({ ...claim, amount: "12,500" }))).toEqual(["AMOUNT_FORMAT"]);
    expect(codes(submissionFaults({ ...claim, aboutDay: "" }))).toEqual(["DAY_REQUIRED"]);
    expect(codes(submissionFaults({ ...claim, aboutDay: "30/09/2026" }))).toEqual(["DAY_FORMAT"]);
    expect(codes(submissionFaults({ ...claim, aboutDay: "2026-10-10" }))).toEqual(["DAY_IN_FUTURE"]);
  });
  it("a materials list: at least one complete item, each with a value in ringgit and sen, at most sixty", () => {
    const list: SubmissionInput = { ...base, kind: "MATERIALS_ON_SITE", aboutDay: "2026-10-01", lines: [{ description: "DI pipe 300 mm", quantity: "40 m", location: "Chainage 1+200", value: "18000.00" }] };
    expect(submissionFaults(list)).toEqual([]);
    expect(codes(submissionFaults({ ...list, lines: [] }))).toEqual(["LINES_REQUIRED"]);
    expect(codes(submissionFaults({ ...list, lines: [{ ...list.lines[0], location: "" }] }))).toEqual(["LINE_INCOMPLETE"]);
    expect(codes(submissionFaults({ ...list, lines: [{ ...list.lines[0], value: "lots" }] }))).toEqual(["LINE_VALUE_FORMAT"]);
    expect(codes(submissionFaults({ ...list, lines: Array.from({ length: 61 }, () => list.lines[0]) }))).toEqual(["TOO_MANY_LINES"]);
  });
  it("a delay notice names the day the cause arose; a statutory declaration is signed", () => {
    expect(submissionFaults({ ...base, kind: "DELAY_NOTICE", aboutDay: "2026-10-05" })).toEqual([]);
    expect(codes(submissionFaults({ ...base, kind: "DELAY_NOTICE" }))).toEqual(["DAY_REQUIRED"]);
    expect(codes(submissionFaults({ ...base, kind: "STATUTORY_DECLARATION" }))).toEqual(["PASSWORD_REQUIRED"]);
    expect(submissionFaults({ ...base, kind: "STATUTORY_DECLARATION", signed: true })).toEqual([]);
  });
  it("every fault has words in both languages", () => {
    for (const code of ["NOT_FOUND", "CONTRACT_NOT_ACTIVE", "TITLE_TOO_LONG", "LINE_INCOMPLETE", "BLOCK_NOT_NEXT", "REFUSAL_NOT_ALLOWED"] as const) {
      const t = projectFaultText({ code, data: { max: 200, line: 2, first: "Recommending officer" } });
      expect(t.en.length).toBeGreaterThan(5);
      expect(t.ms.length).toBeGreaterThan(5);
    }
    expect(hasProjectFaultText("NOT_FOUND")).toBe(true);
    expect(hasProjectFaultText("NOPE")).toBe(false);
  });
});

describe("the service level", () => {
  it("the due day is the day sent plus the service level in calendar days, and none where it is not set", () => {
    expect(dueDayOf("2026-10-09", 7)).toBe("2026-10-16");
    expect(dueDayOf("2026-12-30", 3)).toBe("2027-01-02");
    expect(dueDayOf("2026-10-09", null)).toBeNull();
    expect(dueDayOf("2026-10-09", 0)).toBeNull();
  });
  it("where a submission stands: not set, due, overdue, answered on time or late", () => {
    expect(serviceState({ dueOn: null, decidedOn: null, today: "2026-10-09" })).toEqual({ state: "NOT_SET" });
    expect(serviceState({ dueOn: "2026-10-12", decidedOn: null, today: "2026-10-09" })).toEqual({ state: "DUE", dueOn: "2026-10-12", daysLeft: 3 });
    expect(serviceState({ dueOn: "2026-10-09", decidedOn: null, today: "2026-10-09" })).toEqual({ state: "DUE", dueOn: "2026-10-09", daysLeft: 0 });
    expect(serviceState({ dueOn: "2026-10-07", decidedOn: null, today: "2026-10-09" })).toEqual({ state: "OVERDUE", dueOn: "2026-10-07", daysOver: 2 });
    expect(serviceState({ dueOn: "2026-10-12", decidedOn: "2026-10-10", today: "2026-10-20" })).toEqual({ state: "ANSWERED", dueOn: "2026-10-12", onTime: true });
    expect(serviceState({ dueOn: "2026-10-12", decidedOn: "2026-10-13", today: "2026-10-20" })).toEqual({ state: "ANSWERED", dueOn: "2026-10-12", onTime: false });
    expect(serviceState({ dueOn: null, decidedOn: "2026-10-13", today: "2026-10-20" })).toEqual({ state: "ANSWERED", dueOn: null, onTime: null });
  });
  it("says 'not set' in words, never a due day of nothing", () => {
    expect(serviceWords({ state: "NOT_SET" }).text).toContain(SERVICE_NOT_SET.en);
    expect(serviceWords({ state: "OVERDUE", dueOn: "2026-10-07", daysOver: 2 }).tone).toBe("err");
    expect(serviceWords({ state: "ANSWERED", dueOn: null, onTime: null }).text).toContain("no service level");
  });
});

describe("the officer's answer, and a disagreement on the diary", () => {
  it("once; a return needs a note", () => {
    expect(answerFaults({ outcome: "TAKEN_UP", note: "", alreadyAnswered: false })).toEqual([]);
    expect(codes(answerFaults({ outcome: "RETURNED", note: " ", alreadyAnswered: false }))).toEqual(["NOTE_REQUIRED"]);
    expect(codes(answerFaults({ outcome: "TAKEN_UP", note: "", alreadyAnswered: true }))).toEqual(["ALREADY_ANSWERED"]);
    expect(codes(answerFaults({ outcome: "RETURNED", note: "x".repeat(2001), alreadyAnswered: false }))).toEqual(["NOTE_TOO_LONG"]);
  });
  it("a disagreement is words, once", () => {
    expect(disagreementFaults({ disagreement: "The rain stopped work at noon, not at three.", existing: "" })).toEqual([]);
    expect(codes(disagreementFaults({ disagreement: "", existing: "" }))).toEqual(["DISAGREEMENT_REQUIRED"]);
    expect(codes(disagreementFaults({ disagreement: "x", existing: "already" }))).toEqual(["ALREADY_DISPUTED"]);
  });
});

describe("the contractor's block on a certificate", () => {
  const blocks = [
    { blockOrder: 1, blockKind: "RECOMMENDING", labelEn: "Recommending officer", refusalAllowed: false },
    { blockOrder: 2, blockKind: "AUTHORISING", labelEn: "Superintending Officer", refusalAllowed: false },
    { blockOrder: 3, blockKind: "CONTRACTOR", labelEn: "Contractor", refusalAllowed: true },
    { blockOrder: 4, blockKind: "WITNESS", labelEn: "Witness", refusalAllowed: false },
  ];
  it("is offered on a Variation Order Certificate or an adjustment certificate being signed, once the blocks before it are recorded", () => {
    expect(contractorBlock({ kind: "VARIATION", status: "SIGNING", blocks, signedOrders: [1, 2] })).toMatchObject({ state: "READY", block: { blockOrder: 3 } });
    expect(contractorBlock({ kind: "SUM_ADJUSTMENT", status: "SIGNING", blocks, signedOrders: [1, 2] })).toMatchObject({ state: "READY" });
    expect(contractorBlock({ kind: "VARIATION", status: "SIGNING", blocks, signedOrders: [1] })).toMatchObject({ state: "WAITING", first: "Superintending Officer" });
    expect(contractorBlock({ kind: "VARIATION", status: "SIGNING", blocks, signedOrders: [1, 2, 3] })).toEqual({ state: "NOT_OFFERED", why: "SIGNED" });
  });
  it("is not offered on another kind, before the certificate is being signed, or where the form has no contractor block or is not pinned", () => {
    expect(contractorBlock({ kind: "INTERIM_PAYMENT", status: "SIGNING", blocks, signedOrders: [1, 2] })).toEqual({ state: "NOT_OFFERED", why: "KIND" });
    expect(contractorBlock({ kind: "VARIATION", status: "IN_ROUTING", blocks, signedOrders: [] })).toEqual({ state: "NOT_OFFERED", why: "NOT_SIGNING" });
    expect(contractorBlock({ kind: "VARIATION", status: "SIGNING", blocks: blocks.filter((b) => b.blockKind !== "CONTRACTOR"), signedOrders: [1, 2] })).toEqual({ state: "NOT_OFFERED", why: "NO_BLOCK" });
    expect(contractorBlock({ kind: "VARIATION", status: "SIGNING", blocks: null, signedOrders: [] })).toEqual({ state: "NOT_OFFERED", why: "NO_BLOCK" });
  });
  it("a dispute is the refusal the form allows, with the reason; signing asks nothing more", () => {
    const ready = { kind: "VARIATION", status: "SIGNING", blocks, signedOrders: [1, 2] };
    expect(signBlockFaults({ ...ready, action: "sign", note: "" })).toEqual([]);
    expect(codes(signBlockFaults({ ...ready, action: "dispute", note: "" }))).toEqual(["REFUSAL_NOTE_REQUIRED"]);
    expect(signBlockFaults({ ...ready, action: "dispute", note: "The omission is overstated." })).toEqual([]);
    const noRefusal = blocks.map((b) => (b.blockKind === "CONTRACTOR" ? { ...b, refusalAllowed: false } : b));
    expect(codes(signBlockFaults({ ...ready, blocks: noRefusal, action: "dispute", note: "x" }))).toEqual(["REFUSAL_NOT_ALLOWED"]);
    expect(codes(signBlockFaults({ ...ready, signedOrders: [1], action: "sign", note: "" }))).toEqual(["BLOCK_NOT_NEXT"]);
    expect(codes(signBlockFaults({ ...ready, status: "ISSUED", action: "sign", note: "" }))).toEqual(["NOT_SIGNING"]);
    expect(codes(signBlockFaults({ ...ready, signedOrders: [1, 2, 3], action: "sign", note: "" }))).toEqual(["BLOCK_SIGNED"]);
    expect(codes(signBlockFaults({ ...ready, kind: "INTERIM_PAYMENT", action: "sign", note: "" }))).toEqual(["NO_CONTRACTOR_BLOCK"]);
  });
});

describe("certified against paid", () => {
  it("adds the recommended figures and what Finance paid, leaves out a certificate with no figure and says so", () => {
    const s = certifiedAgainstPaid([
      { certificateId: "a", sequence: 1, number: "IC/1", issuedOn: "2026-07-31", recommended: 100_000_00n, paid: { on: "2026-08-10", amount: 100_000_00n, batchNo: "PV/1" } },
      { certificateId: "b", sequence: 2, number: "IC/2", issuedOn: "2026-08-31", recommended: 250_500_50n, paid: null },
      { certificateId: "c", sequence: 3, number: null, issuedOn: null, recommended: null, paid: null },
    ]);
    expect(s).toEqual({ certified: 350_500_50n, paid: 100_000_00n, outstanding: 250_500_50n, unfigured: 1, awaitingPayment: 2 });
  });
});

describe("the announcements board", () => {
  it("a publication needs a title, a body and a category; a withdrawal a reason, once", () => {
    expect(publishFaults({ title: "Counter closed on Friday", body: "The tender counter is closed on 17 October.", category: "NOTICE" })).toEqual([]);
    expect(codes(publishFaults({ title: "", body: "", category: "OTHER" }))).toEqual(["TITLE_REQUIRED", "BODY_REQUIRED", "CATEGORY_REQUIRED"]);
    expect(codes(publishFaults({ title: "x".repeat(201), body: "y", category: "POLICY" }))).toEqual(["TITLE_TOO_LONG"]);
    expect(withdrawFaults({ withdrawn: false, reason: "Superseded." })).toEqual([]);
    expect(codes(withdrawFaults({ withdrawn: true, reason: "" }))).toEqual(["ALREADY_WITHDRAWN", "REASON_REQUIRED"]);
  });
  it("orders the standing ones pinned first, then newest first, and leaves out the withdrawn", () => {
    const t = (d: string) => new Date(d);
    const items = [
      { id: "old", category: "NOTICE" as const, pinned: false, publishedAt: t("2026-09-01T00:00:00Z"), withdrawnAt: null },
      { id: "gone", category: "NOTICE" as const, pinned: true, publishedAt: t("2026-09-05T00:00:00Z"), withdrawnAt: t("2026-09-06T00:00:00Z") },
      { id: "new", category: "POLICY" as const, pinned: false, publishedAt: t("2026-10-01T00:00:00Z"), withdrawnAt: null },
      { id: "pin", category: "IMPORTANT" as const, pinned: true, publishedAt: t("2026-08-01T00:00:00Z"), withdrawnAt: null },
    ];
    expect(boardOrder(items).map((a) => a.id)).toEqual(["pin", "new", "old"]);
  });
});

describe("the request bodies", () => {
  it("a submission: a contract, a kind and the fields; the items a list; nothing of a supplier or a day of sending", () => {
    const good = parseSubmitBody({ contractId: "contract_0001", kind: "INTERIM_CLAIM", title: "Claim 4", body: "Work to 30 September.", amount: "12500.00", aboutDay: "2026-09-30" });
    expect(good).toMatchObject({ ok: true, value: { kind: "INTERIM_CLAIM", amount: "12500.00", lines: [], password: "" } });
    expect(parseSubmitBody({ contractId: "x", kind: "INTERIM_CLAIM" }).ok).toBe(false);
    expect(parseSubmitBody({ contractId: "contract_0001", kind: "SOMETHING" }).ok).toBe(false);
    expect(parseSubmitBody({ contractId: "contract_0001", kind: "MATERIALS_ON_SITE", title: "t", body: "b", lines: "nope" }).ok).toBe(false);
    expect(parseSubmitBody({ contractId: "contract_0001", kind: "MATERIALS_ON_SITE", title: "t", body: "b", lines: [{ description: 1 }] }).ok).toBe(false);
    const list = parseSubmitBody({ contractId: "contract_0001", kind: "MATERIALS_ON_SITE", title: "t", body: "b", aboutDay: "2026-10-01", lines: [{ description: "pipe", quantity: "40 m", location: "ch 1+200", value: "18000.00" }] });
    expect(list.ok && list.value.lines).toHaveLength(1);
    const signed = parseSubmitBody({ contractId: "contract_0001", kind: "STATUTORY_DECLARATION", title: "t", body: "b", password: "pw" });
    expect(signed.ok && signed.value.password).toBe("pw");
    expect(JSON.stringify(parseSubmitBody({ contractId: "contract_0001", kind: "WORK_PROGRAMME", title: "t", body: "b", supplierId: "other", submittedOn: "2020-01-01" }))).not.toMatch(/other|2020-01-01/);
  });
  it("the diary and the certificate: an id each, an action, the words", () => {
    expect(parseDiaryBody({ contractId: "contract_0001", entryId: "entry_000001", action: "attest", password: "pw" })).toMatchObject({ ok: true, value: { action: "attest", disagreement: "", password: "pw" } });
    expect(parseDiaryBody({ contractId: "contract_0001", entryId: "entry_000001", action: "dispute", disagreement: "No." })).toMatchObject({ ok: true, value: { action: "dispute", disagreement: "No." } });
    expect(parseDiaryBody({ contractId: "contract_0001", entryId: "entry_000001", action: "sign" }).ok).toBe(false);
    expect(parseCertificateBody({ contractId: "contract_0001", certificateId: "cert_00000001", action: "dispute", note: "Overstated.", password: "pw" })).toMatchObject({ ok: true, value: { action: "dispute", note: "Overstated." } });
    expect(parseCertificateBody({ contractId: "contract_0001", certificateId: "c", action: "sign" }).ok).toBe(false);
  });
});
