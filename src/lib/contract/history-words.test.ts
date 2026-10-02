import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { historyValue } from "./history-words";

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
    expect(page).toMatch(/isSulitField\(field\) && value \? <SulitValue>/);
  });
});
