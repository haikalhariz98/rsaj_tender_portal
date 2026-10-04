import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CONTRACT_TABLED_WORDS, MATTER_KINDS, RECORD_TABLED_MATTER_KINDS, recordTabledText, SITTING_TABLED_MATTER_KINDS } from "./labels";
import { MATTER_AMOUNT_SULIT, matterAmountIsSulit, SULIT_AMOUNT_KINDS } from "./matter-amount";

/**
 * 6.13 Part B run 1a (ADR 0029 §3 and §5, BD-613-73): a CONTRACT matter is tabled only from its own record (its route's
 * committee step, through tablingOf), never at a sitting: a decision tabled at a sitting would name no contract matter and
 * discharge nothing. Its amount stays "not decided" whether SULIT, so it is read as SULIT and chipped wherever shown (a
 * question to RSAJ).
 */

describe("a contract matter is tabled from its record, never at a sitting", () => {
  it("CONTRACT is a record-tabled kind; the sitting's drawer neither offers nor accepts it", () => {
    expect(RECORD_TABLED_MATTER_KINDS).toContain("CONTRACT");
    expect(SITTING_TABLED_MATTER_KINDS).not.toContain("CONTRACT");
    expect(MATTER_KINDS).toContain("CONTRACT");
  });
  it("asked at a sitting, it says where it is tabled, in English and Malay", () => {
    expect(recordTabledText("CONTRACT")).toBe(CONTRACT_TABLED_WORDS.en);
    expect(CONTRACT_TABLED_WORDS).toEqual({
      en: "A contract matter (an extension of time, a period extension, a waiver of damages, a termination, a nomination, a nominated-sum increase or a loss-and-expense claim) is tabled from the matter itself, on its contract, which names the matter and the step the committee decides on.",
      ms: "Perkara kontrak (lanjutan masa, lanjutan tempoh, pengecualian ganti rugi, penamatan, penamaan, pertambahan jumlah dinamakan atau tuntutan kerugian dan perbelanjaan) dibentangkan daripada perkara itu sendiri, pada kontraknya, yang menamakan perkara dan langkah yang diputuskan oleh jawatankuasa.",
    });
  });
  it("the sitting's act takes the kind from SITTING_TABLED_MATTER_KINDS, so a CONTRACT matter is refused there", () => {
    const acts = readFileSync("src/app/committees/actions.ts", "utf8");
    expect(acts).toMatch(/r\.choice\("matterKind", "Record kind", SITTING_TABLED_MATTER_KINDS\)/);
  });
});

describe("a contract matter's amount: not decided, so read as SULIT (BD-613-73)", () => {
  it("not decided, read as SULIT, and chipped with every kind that may be", () => {
    expect(MATTER_AMOUNT_SULIT.CONTRACT.sulit).toBeNull();
    expect(MATTER_AMOUNT_SULIT.CONTRACT.why).toMatch(/question to RSAJ/);
    expect(matterAmountIsSulit("CONTRACT")).toBe(true);
    expect(SULIT_AMOUNT_KINDS).toContain("CONTRACT");
  });
});
