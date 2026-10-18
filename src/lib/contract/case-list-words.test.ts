import { describe, expect, it } from "vitest";

import { AWARD_STATUSES } from "@/lib/award/types";

import { CASE_STAGES, caseStage } from "./case-stage";
import { awardChips, CASE_ENDED_WORDS, CASE_STAGE_WORDS, standingWords } from "./case-list-words";

describe("the case list's words", () => {
  it("every stage and every ended kind has English and Malay words, and none is a code", () => {
    for (const s of CASE_STAGES) {
      expect(CASE_STAGE_WORDS[s].en).not.toMatch(/_|^[A-Z]+$/);
      expect(CASE_STAGE_WORDS[s].ms).not.toBe("");
    }
    for (const e of Object.values(CASE_ENDED_WORDS)) expect(e.en).not.toMatch(/_/);
  });
  it("a standing reads as its stage, and every ended kind as the sixth view", () => {
    expect(standingWords(caseStage({ award: { status: "DRAFT", instrumentKind: "LETTER_OF_ACCEPTANCE" }, contract: null, commencement: { commencedOn: null } })).en).toBe("Awarding");
    expect(standingWords({ kind: "ENDED", ended: "TERMINATED" }).en).toBe("Cancelled or terminated");
  });
});

describe("awardChips (the Awards list's, carried over)", () => {
  const base = { returned: false, toVerify: 0, registered: 0, hasCommitmentNo: true, indentExpired: false };
  it("a draft, an approved and a pending award say where they are and nothing about return or securities", () => {
    expect(awardChips({ ...base, status: "DRAFT" }).map((c) => c.text)).toEqual(["Being prepared"]);
    expect(awardChips({ ...base, status: "PENDING_APPROVAL" }).map((c) => c.text)).toEqual(["With the approvers"]);
    expect(awardChips({ ...base, status: "APPROVED" }).map((c) => c.text)).toEqual(["To issue"]);
  });
  it("an issued award shows its return, its securities and a missing commitment number", () => {
    expect(awardChips({ ...base, status: "ISSUED", hasCommitmentNo: false }).map((c) => c.text)).toEqual(["Awaiting return", "No securities lodged", "No commitment number"]);
    expect(awardChips({ ...base, status: "ACCEPTED", returned: true, registered: 2, toVerify: 1 }).map((c) => c.text)).toEqual(["Returned", "1 to verify"]);
    expect(awardChips({ ...base, status: "ACCEPTED", returned: true, registered: 2 }).map((c) => c.text)).toEqual(["Returned", "Securities verified"]);
  });
  it("a cancelled award has no chip, and an expired indent shows on any award", () => {
    expect(awardChips({ ...base, status: "CANCELLED" })).toEqual([]);
    expect(awardChips({ ...base, status: "DRAFT", indentExpired: true }).map((c) => c.text)).toEqual(["Indent expired", "Being prepared"]);
  });
  it("every award status gives chips without throwing", () => {
    for (const status of AWARD_STATUSES) expect(() => awardChips({ ...base, status })).not.toThrow();
  });
});
