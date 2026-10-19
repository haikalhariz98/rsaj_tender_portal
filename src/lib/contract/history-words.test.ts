import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { baselineKeyListWords, historyFieldLabel, historyValue } from "./history-words";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/**
 * 6.12 review: the contract's History hid every all-capitals value as "—", so an LHDN reference or an
 * item "PS" vanished. Now only a code without words is withheld; known codes read in words; values show.
 */

const day = (d: string) => `day ${d}`;

describe("the contract's History reads a stored value", () => {
  it("real values in capitals are shown as they are", () => {
    expect(historyValue("stampingRef", "LHDN", day)).toBe("LHDN");
    expect(historyValue("itemRef", "PS", day)).toBe("PS");
    expect(historyValue("recipient", "JKR", day)).toBe("JKR");
    expect(historyValue("stampingRef", "DEMO-STAMP-2026-0001", day)).toBe("DEMO-STAMP-2026-0001");
  });
  it("known codes read in words", () => {
    expect(historyValue("status", "IN_PREPARATION", day)).toBe("In preparation");
    expect(historyValue("status", "AWAITING_CONDITIONS", day)).toBe("Awaiting conditions precedent");
    expect(historyValue("direction", "OUT", day)).toBe("Checked out");
    expect(historyValue("reason", "CORRECTION", day, "ContractBaseline")).toBe("Corrected");
    expect(historyValue("method", "REGISTERED_POST", day)).toBe("Registered post");
    expect(historyValue("kind", "WORKMENS_COMPENSATION", day)).toBe("Workmen's compensation insurance");
  });
  it("the number's source, written by the award's issue act, reads in words (one word, but a code)", () => {
    expect(historyValue("numberSource", "SERIES", day)).toBe("The contract type's series");
    expect(historyValue("numberSource", "INDENT_NUMBER", day)).toBe("The indent's own number");
  });
  it("an unmapped code in a code field is withheld, never shown raw (6.12 re-review), one word or several", () => {
    expect(historyValue("status", "SOME_NEW_CODE", day)).toBe("—");
    expect(historyValue("kind", "NEWKIND", day)).toBe("—");
    expect(historyValue("reason", "SOMETHING", day, "ContractBaseline")).toBe("—");
  });
  it("outside a code field, a value is the officer's or the act's words and is shown as written", () => {
    expect(historyValue("reason", "PS RATE EXTENDED WRONGLY", day, "ArithmeticCorrection")).toBe("PS RATE EXTENDED WRONGLY");
    expect(historyValue("description", "VALVE_CHAMBER", day)).toBe("VALVE_CHAMBER");
  });
  it("days, yes and no, and empty", () => {
    expect(historyValue("on", "2026-09-30", day)).toBe("day 2026-09-30");
    expect(historyValue("x", "true", day)).toBe("Yes");
    expect(historyValue("x", "no", day)).toBe("No");
    expect(historyValue("x", null, day)).toBe("—");
    expect(historyValue("x", "", day)).toBe("—");
  });
  it("the contract's History panel reads values through it, and chips SULIT fields like its siblings", () => {
    const page = readFileSync(path.join(__dirname, "../../app/projects/[id]/page.tsx"), "utf8");
    expect(page).toContain("historyValue(");
    expect(page).not.toMatch(/\/\^\[A-Z\]\[A-Z_\]\+\$\//);
    // Phase 3b, a deliberate change to this test (logged): a registered SULIT field is judged by the contract's one answer (`sulitHistoryValue`), never the children form.
    expect(page).toMatch(/sulitHistoryValue\(field, "contract", sulit, read\(field, value, entity\)\)/);
    expect(page).not.toMatch(/<SulitValue>/);
  });
});

/**
 * 6.12 residual review S-1 (AGENTS.md rule 5): the baseline's `changed` and `entered` fields store value
 * keys, and History printed them ("contractDate"; "sums, buildersWorksValue, firstInterim"; "all"). They
 * read through the Baseline tab's labels, in both languages; an unmapped key is withheld.
 */
describe("the baseline's key lists read as the Baseline tab names them", () => {
  it("a single group", () => {
    expect(historyValue("changed", "contractDate", day, "ContractBaseline")).toBe("Contract Date");
    expect(baselineKeyListWords("sums")).toEqual({ en: "Prime cost and provisional sums" });
  });
  it("a list", () => {
    expect(historyValue("changed", "sums, buildersWorksValue, firstInterim", day, "ContractBaseline")).toBe("Prime cost and provisional sums, Builder's works value, First interim certificate minimum");
    expect(historyValue("entered", "sums, subsequentInterim, sectional", day, "ContractBaseline")).toBe("Prime cost and provisional sums, Subsequent interim certificate minimum, Sectional completion");
  });
  it('"all" and "nothing"', () => {
    expect(historyValue("changed", "all", day, "ContractBaseline")).toBe("Every value");
    expect(historyValue("changed", "nothing", day, "ContractBaseline")).toBe("Nothing");
  });
  it("an unknown key is withheld, never shown", () => {
    expect(historyValue("changed", "someNewKey", day, "ContractBaseline")).toBe("—");
    expect(historyValue("changed", "sums, someNewKey", day, "ContractBaseline")).toBe("Prime cost and provisional sums, —");
    expect(historyValue("changed", "someNewKey", day, "ContractBaseline")).not.toContain("someNewKey");
  });
  it("a keyed or corrected group's field reads by its label on the baseline's rows", () => {
    expect(historyFieldLabel("honourDays", "ContractBaseline")).toBe("Days to honour a certificate");
    expect(historyFieldLabel("sums", "ContractBaseline")).toBe("Prime cost and provisional sums");
    expect(historyFieldLabel("changed", "ContractBaseline")).toBe("Changed");
  });
  it("the page reads field names through historyFieldLabel", () => {
    const page = readFileSync(path.join(__dirname, "../../app/projects/[id]/page.tsx"), "utf8");
    expect(page).toContain("historyFieldLabel(ch.field, e.entity)");
  });
});

