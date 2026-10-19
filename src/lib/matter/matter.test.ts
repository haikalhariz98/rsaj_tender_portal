import { describe, expect, it } from "vitest";

import { ACT_STATUS, CONTRACT_ACTS } from "@/lib/contract/act-status";
import { CERTIFICATE_KINDS } from "@/lib/certificate/types";
import { parseSen } from "@/lib/money";

import { approvalOfRecord, CONTRACT_MATTER_KINDS, MATTER_DOMAIN, MATTER_FAMILY, MATTER_ROUTED_ON, matterApproved, matterSigning, MATTER_SIGNED_KINDS, sendFaults, type MatterFacts } from "./matter";
import { MATTER_FAULT_WORDS, matterFaultWords } from "./labels";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/**
 * 6.13 Part B run 1b (ADR 0029; plan B5 matter/matter.ts; BD-613-73, BD-613-121). Pure.
 */

const facts = (o: Partial<MatterFacts> = {}): MatterFacts => ({ kind: "EOT", reference: null, closed: null, seriesSet: true, routes: [], approvedRouteId: null, ...o });
const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

describe("the matter's kinds, families and domains", () => {
  it("every kind reads a family of the one table (MATTER_FAMILY, exhaustive) and routes on its own domain", () => {
    expect([...CONTRACT_MATTER_KINDS].sort()).toEqual(["EOT", "LAD_WAIVER", "LOSS_EXPENSE", "NOMINATED_INCREASE", "NOMINATION", "PERIOD_EXTENSION", "TERMINATION"]);
    for (const k of CONTRACT_MATTER_KINDS) {
      expect(CONTRACT_ACTS, k).toContain(MATTER_FAMILY[k]);
      expect(ACT_STATUS[MATTER_FAMILY[k]].ACTIVE, k).toBe("ALLOWED");
    }
    expect(MATTER_FAMILY).toEqual({ EOT: "EOT", PERIOD_EXTENSION: "PERIOD_EXTENSION", LAD_WAIVER: "LAD_WAIVER", TERMINATION: "TERMINATION_CASE", NOMINATED_INCREASE: "NOMINATED_INCREASE", NOMINATION: "NOMINATED", LOSS_EXPENSE: "LOSS_EXPENSE" });
    // BD-613-117 and BD-613-133: the domains the plan names (contract_period_extension, not the prototype's key).
    expect(MATTER_DOMAIN).toEqual({ EOT: "eot", PERIOD_EXTENSION: "contract_period_extension", LAD_WAIVER: "lad_waiver", TERMINATION: "termination", NOMINATED_INCREASE: "nominated_increase", NOMINATION: "nomination", LOSS_EXPENSE: "loss_expense" });
    expect(new Set(Object.values(MATTER_DOMAIN)).size).toBe(CONTRACT_MATTER_KINDS.length);
  });

  it("what each kind is routed on: the EOT on its condition, the waiver on its ratio, the rest on a value (the period extension's only where it has one)", () => {
    expect(MATTER_ROUTED_ON).toEqual({ EOT: "COND", PERIOD_EXTENSION: "VALUE_IF_ANY", LAD_WAIVER: "RATIO", TERMINATION: "VALUE_IF_ANY", NOMINATED_INCREASE: "VALUE", NOMINATION: "VALUE", LOSS_EXPENSE: "VALUE" });
  });
});

describe("sending a matter (sendFaults)", () => {
  const q = { value: null, ratio: null, cond: "financial_not_authority" };
  it("a first send needs the contract_matter series; a later one keeps its reference", () => {
    expect(codes(sendFaults(facts({ seriesSet: false }), q))).toEqual(["MATTER_SERIES_NOT_SET"]);
    expect(sendFaults(facts({ seriesSet: false, reference: "CM/1", routes: [{ id: "r1", status: "REJECTED" }] }), q)).toEqual([]);
  });

  it("a closed matter, a route waiting and an approved matter refuse, each naming why", () => {
    expect(codes(sendFaults(facts({ closed: { reason: "Not entitled: the cause was the contractor's." } }), q))).toEqual(["MATTER_CLOSED"]);
    expect(codes(sendFaults(facts({ routes: [{ id: "r1", status: "PENDING" }] }), q))).toEqual(["ROUTE_WAITING"]);
    expect(codes(sendFaults(facts({ routes: [{ id: "r1", status: "APPROVED" }], approvedRouteId: "r1" }), q))).toEqual(["ALREADY_APPROVED"]);
  });

  it("a refused or recalled route may be sent again", () => {
    for (const status of ["REJECTED", "RECALLED"]) expect(sendFaults(facts({ reference: "CM/1", routes: [{ id: "r1", status }] }), q), status).toEqual([]);
  });

  it("the domain's value, ratio or condition is required as the kind is routed", () => {
    expect(codes(sendFaults(facts(), { value: null, ratio: null, cond: null }))).toEqual(["COND_REQUIRED"]);
    expect(codes(sendFaults(facts({ kind: "LOSS_EXPENSE" }), { value: null, ratio: null, cond: null }))).toEqual(["VALUE_REQUIRED"]);
    expect(sendFaults(facts({ kind: "LOSS_EXPENSE" }), { value: 0n, ratio: null, cond: null })).toEqual([]);
    expect(codes(sendFaults(facts({ kind: "LAD_WAIVER" }), { value: null, ratio: null, cond: null }))).toEqual(["RATIO_REQUIRED"]);
    expect(codes(sendFaults(facts({ kind: "LAD_WAIVER" }), { value: null, ratio: { num: parseSen("1.00"), den: 0n }, cond: null }))).toEqual(["RATIO_REQUIRED"]);
    expect(sendFaults(facts({ kind: "LAD_WAIVER" }), { value: null, ratio: { num: parseSen("2020.35"), den: parseSen("8081.40") }, cond: null })).toEqual([]);
    expect(sendFaults(facts({ kind: "PERIOD_EXTENSION" }), { value: null, ratio: null, cond: null })).toEqual([]);
  });
});

describe("the approval of record", () => {
  it("only an APPROVED latest route is the approval of record", () => {
    expect(approvalOfRecord([])).toBeNull();
    expect(approvalOfRecord([{ id: "r1", status: "PENDING" }])).toBeNull();
    expect(approvalOfRecord([{ id: "r1", status: "REJECTED" }, { id: "r2", status: "APPROVED" }])).toBe("r2");
    expect(approvalOfRecord([{ id: "r1", status: "APPROVED" }, { id: "r2", status: "PENDING" }])).toBeNull();
  });

  it("a matter is approved only where its written approval of record is that latest approved route, and it is open", () => {
    expect(matterApproved(facts({ routes: [{ id: "r1", status: "APPROVED" }], approvedRouteId: "r1" }))).toBe(true);
    expect(matterApproved(facts({ routes: [{ id: "r1", status: "APPROVED" }], approvedRouteId: null }))).toBe(false);
    expect(matterApproved(facts({ routes: [{ id: "r1", status: "APPROVED" }], approvedRouteId: "r0" }))).toBe(false);
    expect(matterApproved(facts({ routes: [{ id: "r1", status: "APPROVED" }], approvedRouteId: "r1", closed: { reason: "ended" } }))).toBe(false);
  });
});

describe("BD-613-121: the matter hook answers for the kinds approved on a contract matter, per kind", () => {
  const approved = facts({ routes: [{ id: "r1", status: "APPROVED" }], approvedRouteId: "r1" });
  it("the three matter-approved kinds", () => {
    expect([...MATTER_SIGNED_KINDS].sort()).toEqual(["CONTRACT_PERIOD_AGREEMENT", "EOT", "TERMINATION"]);
  });
  it("EOT: approved signs; not approved, or no matter found, refuses MATTER_NOT_APPROVED", () => {
    expect(matterSigning("EOT", approved)).toEqual([]);
    expect(codes(matterSigning("EOT", facts({ routes: [{ id: "r1", status: "PENDING" }] })))).toEqual(["MATTER_NOT_APPROVED"]);
    expect(codes(matterSigning("EOT", null))).toEqual(["MATTER_NOT_APPROVED"]);
  });
  it("CONTRACT_PERIOD_AGREEMENT: likewise", () => {
    expect(matterSigning("CONTRACT_PERIOD_AGREEMENT", { ...approved, kind: "PERIOD_EXTENSION" })).toEqual([]);
    expect(codes(matterSigning("CONTRACT_PERIOD_AGREEMENT", facts({ kind: "PERIOD_EXTENSION" })))).toEqual(["MATTER_NOT_APPROVED"]);
  });
  it("TERMINATION: no termination case before run 4, so the hook finds no matter and stays refused", () => {
    expect(codes(matterSigning("TERMINATION", null))).toEqual(["MATTER_NOT_APPROVED"]);
  });
  it("a matter of another kind never approves a certificate (an EOT certificate on a waiver's matter)", () => {
    expect(codes(matterSigning("EOT", { ...approved, kind: "LAD_WAIVER" }))).toEqual(["MATTER_NOT_APPROVED"]);
  });
  it("every other kind is not the hook's: nothing said", () => {
    for (const k of CERTIFICATE_KINDS) if (!(MATTER_SIGNED_KINDS as readonly string[]).includes(k)) expect(matterSigning(k, null), k).toEqual([]);
  });
});

describe("the words", () => {
  it("every code is worded in English and Malay, and names no code", () => {
    for (const [code, f] of Object.entries(MATTER_FAULT_WORDS)) {
      const w = f({ reason: "r", day: "2026-09-14", domain: "eot", matrix: "Issue 1" });
      expect(w.en.length, code).toBeGreaterThan(10);
      expect(w.en, code).not.toMatch(/\b[A-Z]{2,}_[A-Z_]+\b/);
    }
    expect(matterFaultWords({ code: "MATTER_SERIES_NOT_SET", level: "block" }).en).toMatch(/Configuration › Numbering/);
  });
});
