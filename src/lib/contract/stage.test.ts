import { describe, expect, it } from "vitest";

import { contractStage, NO_STAGE_FACTS, NOT_SET_WORDS, POST_ACTIVE_STAGES, STAGE_WORDS, type Stage } from "./stage";
import { CONTRACT_STATUSES } from "./types";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/**
 * BD-613-98 (6.13 Part B run 1a, ADR 0031 §2–3): `contractStage` maps every §7.3.3 state after Active to stored (one of
 * the five statuses), derived in words from the records, or not built (Suspended: no FR defines the act; a departure
 * from §7.3.3 on the founder's list). Terminated — account settled is derived, never stored.
 */

/// §7.3.3's states after Active, as the specification lists them (rows "In Delay" to "Closed").
const SPEC_AFTER_ACTIVE = ["In Delay", "Suspended", "Notice of Intention Issued", "Terminated", "Terminated Account Settled", "Practically Complete", "Partially Occupied", "In Defects Liability", "Defects Rectification", "Third-Party Rectification", "Making Good Complete", "Pending Final Account", "Blocked — Statutory Declaration", "Final Certificate Issued", "Closed"];

describe("every §7.3.3 state after Active, once", () => {
  it("each is listed once, by the specification's own name", () => {
    expect(Object.values(POST_ACTIVE_STAGES).map((s) => s.spec).sort()).toEqual([...SPEC_AFTER_ACTIVE].sort());
  });
  it("five are stored, and each is a status; Suspended alone is not built; the rest are derived", () => {
    const by = (k: string) => (Object.keys(POST_ACTIVE_STAGES) as Stage[]).filter((s) => POST_ACTIVE_STAGES[s].kind === k).sort();
    expect(by("STORED")).toEqual(["CLOSED", "FINAL_CERTIFICATE_ISSUED", "MAKING_GOOD_COMPLETE", "PRACTICALLY_COMPLETE", "TERMINATED"]);
    for (const s of by("STORED")) expect(CONTRACT_STATUSES).toContain(s);
    expect(by("NOT_BUILT")).toEqual(["SUSPENDED"]);
    expect(by("DERIVED")).toEqual(["BLOCKED_STATUTORY_DECLARATION", "DEFECTS_RECTIFICATION", "IN_DEFECTS_LIABILITY", "IN_DELAY", "NOTICE_OF_INTENTION_ISSUED", "PARTIALLY_OCCUPIED", "PENDING_FINAL_ACCOUNT", "TERMINATED_ACCOUNT_SETTLED", "THIRD_PARTY_RECTIFICATION"]);
    expect(CONTRACT_STATUSES).not.toContain("TERMINATED_ACCOUNT_SETTLED");
    expect(CONTRACT_STATUSES).not.toContain("SUSPENDED");
  });
  it("each has words in English and Malay; Suspended's say it is not built", () => {
    for (const s of Object.keys(POST_ACTIVE_STAGES) as Stage[]) {
      expect(STAGE_WORDS[s].en, s).toMatch(/^[A-Z]/);
    }
    expect(STAGE_WORDS.SUSPENDED.en).toMatch(/not built/);
    expect(STAGE_WORDS.TERMINATED_ACCOUNT_SETTLED).toEqual({ en: "Terminated — account settled" });
  });
});

describe("the stage read from the status and the records", () => {
  it("before Active: none; stored states read as themselves", () => {
    // Run 1a fix round (review S8, faithful): the result also says which facts are not set (none here).
    expect(contractStage({ status: "STAMPED" }, NO_STAGE_FACTS)).toEqual({ status: "STAMPED", derived: [], notSet: [] });
    expect(contractStage({ status: "CLOSED" }, { ...NO_STAGE_FACTS, terminatedAccountSettled: true })).toEqual({ status: "CLOSED", derived: [], notSet: [] });
  });
  it("Active: in delay, a notice of intention not remedied, a part occupied", () => {
    expect(contractStage({ status: "ACTIVE" }, { ...NO_STAGE_FACTS, inDelay: true, noticeOfIntention: true, partiallyOccupied: true }).derived).toEqual(["IN_DELAY", "NOTICE_OF_INTENTION_ISSUED", "PARTIALLY_OCCUPIED"]);
  });
  it("practically complete: the DLP, the schedule of defects, third-party rectification; with no DLP, straight to the final account", () => {
    expect(contractStage({ status: "PRACTICALLY_COMPLETE" }, { ...NO_STAGE_FACTS, dlp: "RUNNING" }).derived).toEqual(["IN_DEFECTS_LIABILITY"]);
    expect(contractStage({ status: "PRACTICALLY_COMPLETE" }, { ...NO_STAGE_FACTS, dlp: "ENDED", scheduleOfDefectsOpen: true }).derived).toEqual(["DEFECTS_RECTIFICATION"]);
    expect(contractStage({ status: "PRACTICALLY_COMPLETE" }, { ...NO_STAGE_FACTS, dlp: "ENDED", scheduleOfDefectsOpen: true, thirdPartyRectification: true }).derived).toEqual(["DEFECTS_RECTIFICATION", "THIRD_PARTY_RECTIFICATION"]);
    expect(contractStage({ status: "PRACTICALLY_COMPLETE" }, { ...NO_STAGE_FACTS, dlp: "NOT_APPLICABLE", obligationsDischarged: true }).derived).toEqual(["PENDING_FINAL_ACCOUNT"]);
  });
  it("the DLP's applying not known: no defects stage is claimed", () => {
    expect(contractStage({ status: "PRACTICALLY_COMPLETE" }, { ...NO_STAGE_FACTS, dlp: "NOT_SET", obligationsDischarged: true }).derived).toEqual([]);
  });
  it("making good complete: pending the final account once every obligation is discharged; blocked on a statutory declaration", () => {
    expect(contractStage({ status: "MAKING_GOOD_COMPLETE" }, NO_STAGE_FACTS).derived).toEqual([]);
    expect(contractStage({ status: "MAKING_GOOD_COMPLETE" }, { ...NO_STAGE_FACTS, obligationsDischarged: true }).derived).toEqual(["PENDING_FINAL_ACCOUNT"]);
    expect(contractStage({ status: "MAKING_GOOD_COMPLETE" }, { ...NO_STAGE_FACTS, obligationsDischarged: true, declarationBlocking: true }).derived).toEqual(["PENDING_FINAL_ACCOUNT", "BLOCKED_STATUTORY_DECLARATION"]);
  });
  it("terminated: the account settled is derived from the terminated account's final certificate issued and demanded or paid", () => {
    expect(contractStage({ status: "TERMINATED" }, NO_STAGE_FACTS).derived).toEqual([]);
    expect(contractStage({ status: "TERMINATED" }, { ...NO_STAGE_FACTS, terminatedAccountSettled: true }).derived).toEqual(["TERMINATED_ACCOUNT_SETTLED"]);
  });
  it("Suspended is never derived: no act enters it", () => {
    for (const status of CONTRACT_STATUSES) expect(contractStage({ status }, { ...NO_STAGE_FACTS, inDelay: true, dlp: "RUNNING", obligationsDischarged: true, terminatedAccountSettled: true }).derived).not.toContain("SUSPENDED");
  });
});

describe("S8 (Run 1a fix round): an unset defects liability period is said to be not set, never read as not applicable", () => {
  it("practically complete with the DLP not set: no stage claimed, and the DLP named as not set", () => {
    expect(contractStage({ status: "PRACTICALLY_COMPLETE" }, { ...NO_STAGE_FACTS, dlp: "NOT_SET", obligationsDischarged: true })).toEqual({ status: "PRACTICALLY_COMPLETE", derived: [], notSet: ["DLP"] });
  });
  it("not applicable is a fact, not a gap: nothing is not set, and the chain is bypassed (FR-CMP-001)", () => {
    expect(contractStage({ status: "PRACTICALLY_COMPLETE" }, { ...NO_STAGE_FACTS, dlp: "NOT_APPLICABLE" })).toEqual({ status: "PRACTICALLY_COMPLETE", derived: [], notSet: [] });
    expect(contractStage({ status: "PRACTICALLY_COMPLETE" }, { ...NO_STAGE_FACTS, dlp: "NOT_APPLICABLE", obligationsDischarged: true }).notSet).toEqual([]);
  });
  it("running or ended, nothing is not set", () => {
    for (const dlp of ["RUNNING", "ENDED"] as const) expect(contractStage({ status: "PRACTICALLY_COMPLETE" }, { ...NO_STAGE_FACTS, dlp }).notSet, dlp).toEqual([]);
  });
  it("the DLP is asked only where the stage turns on it: practically complete, not before or after", () => {
    for (const status of CONTRACT_STATUSES.filter((s) => s !== "PRACTICALLY_COMPLETE")) expect(contractStage({ status }, NO_STAGE_FACTS).notSet, status).toEqual([]);
  });
  it("the not-set words, in English and Malay, say what is not known and never claim a stage", () => {
    expect(NOT_SET_WORDS.DLP.en).toBe("The defects liability period is not set for this contract, so whether it is in defects liability or goes straight to its final account is not known.");
  });
});
