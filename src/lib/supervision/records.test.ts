import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { BRANCH_OPENS, earlyActionFaults, handoverFaults, meetingFaults, onSiteFaults, partyFaults, progressFaults, retirePartyFaults, selfHelpFaults } from "./records";
import { EARLY_ACTION_BRANCHES } from "./types";

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

describe("the special meeting (FR-SUP-011)", () => {
  const m = { inDelay: true, heldOn: "2026-10-03", today: "2026-10-03", minutes: "Recovery plan agreed.", attendees: ["Aminah", "Ahmad (contractor)"] };
  it("follows an In Delay classification, with minutes and attendees", () => {
    expect(meetingFaults(m)).toEqual([]);
    expect(codes(meetingFaults({ ...m, inDelay: false, minutes: "", attendees: [] }))).toEqual(["NOT_IN_DELAY", "MINUTES_REQUIRED", "NO_ATTENDEES"]);
  });
});

describe("observations and directions (FR-SUP-014, 012)", () => {
  it("on site, dated, worded", () => {
    expect(onSiteFaults({ possessionOn: "2026-10-01", on: "2026-10-02", today: "2026-10-03", note: "No harness on the scaffold." })).toEqual([]);
    expect(codes(onSiteFaults({ possessionOn: null, on: "2026-10-04", today: "2026-10-03", note: "" }))).toEqual(["NOT_POSSESSED", "FUTURE_DATE", "NOTE_REQUIRED"]);
  });
});

describe("self-help on insurance (FR-SUP-013)", () => {
  const s = { policyOnContract: true, amount: parseSen("1200.00"), paidOn: "2026-10-02", today: "2026-10-03", extendedTo: "2027-04-30", periodEnd: "2026-10-31", note: "Contractor let the CAR policy lapse." };
  it("the contract's policy, a premium above nothing, the cover running on: a deduction waiting for the next interim", () => {
    expect(selfHelpFaults(s)).toEqual([]);
    expect(codes(selfHelpFaults({ ...s, policyOnContract: false, amount: 0n, extendedTo: "2026-10-31" }))).toEqual(["POLICY_NOT_ON_CONTRACT", "AMOUNT_NOT_POSITIVE", "EXTENDED_NOT_LATER"]);
  });
});

describe("the early-action decision (FR-SUP-015)", () => {
  it("one or more branches with the reason; every branch says where it opens", () => {
    expect(earlyActionFaults({ possessed: true, branches: ["IMPOSE_LAD", "EXTEND_TIME"], reason: "Two months behind.", on: "2026-10-03", today: "2026-10-03" })).toEqual([]);
    expect(codes(earlyActionFaults({ possessed: true, branches: [], reason: "", on: "2026-10-03", today: "2026-10-03" }))).toEqual(["NO_BRANCH", "REASON_REQUIRED"]);
    for (const b of EARLY_ACTION_BRANCHES) expect(["PART_B", "LAD_CHAIN"]).toContain(BRANCH_OPENS[b]);
  });
});

describe("handing over site records (FR-SUP-009)", () => {
  it("with a live version, to someone, received by someone", () => {
    const h = { possessed: true, set: "AS_BUILT" as const, liveVersions: 2, toLabel: "Implementing Department", receivedByName: "Lim", on: "2026-10-03", today: "2026-10-03" };
    expect(handoverFaults(h)).toEqual([]);
    expect(codes(handoverFaults({ ...h, liveVersions: 0, toLabel: "", receivedByName: "" }))).toEqual(["NO_LIVE_VERSION", "TO_REQUIRED", "RECEIVER_REQUIRED"]);
  });
});

describe("the contract's parties (B1, ADR 0025)", () => {
  it("named; sum and direct payment may stay unset; no duplicate of the same kind", () => {
    const p = { executed: true, kind: "NOMINATED_SUBCONTRACTOR" as const, name: "Contoh Pipes Sdn Bhd", sum: null, others: [] };
    expect(partyFaults(p)).toEqual([]);
    expect(codes(partyFaults({ ...p, executed: false, name: " ", sum: -1n }))).toEqual(["PARTY_BEFORE_EXECUTION", "NAME_REQUIRED", "SUM_NEGATIVE"]);
    expect(codes(partyFaults({ ...p, others: [{ kind: "NOMINATED_SUBCONTRACTOR", name: "contoh pipes sdn bhd", retired: false }] }))).toEqual(["DUPLICATE_NAME"]);
    expect(partyFaults({ ...p, others: [{ kind: "ASSIGNEE", name: "Contoh Pipes Sdn Bhd", retired: false }] })).toEqual([]);
  });
  it("retired once, with the reason, never deleted", () => {
    expect(codes(retirePartyFaults({ retired: true, reason: "" }))).toEqual(["RETIRED", "REASON_REQUIRED"]);
  });
});

describe("progress (FR-SUP-010)", () => {
  const p = { possessionOn: "2026-10-01", day: "2026-10-03", today: "2026-10-03", pct: "12.5", exists: false, earlier: { day: "2026-10-02", pct: 100000n }, later: null, parsed: 125000n };
  it("once a day, 0–100, cumulative", () => {
    expect(progressFaults(p)).toEqual([]);
    expect(codes(progressFaults({ ...p, parsed: 90000n }))).toEqual(["FALLS"]);
    expect(codes(progressFaults({ ...p, parsed: null }))).toEqual(["NOT_A_PERCENT"]);
    expect(codes(progressFaults({ ...p, exists: true }))).toEqual(["ALREADY_RECORDED"]);
  });
});
