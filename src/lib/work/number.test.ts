import { describe, expect, it } from "vitest";

import { itemRefText, TYPE_SHORT } from "./labels";
import { itemRef, nextNumber, parseItemRef } from "./number";
import { WORK_ITEM_TYPES } from "./types";

/** Numbers per contract and type (WS-1, W-5), and the address form of a reference. */

describe("nextNumber", () => {
  it.each([
    [null, 1],
    [0, 1],
    [1, 2],
    [41, 42],
  ])("after %s comes %s", (max, next) => expect(nextNumber(max)).toBe(next));
});

describe("itemRef and parseItemRef", () => {
  it("every type round-trips through the address form, and reads as the screen shows it", () => {
    for (const type of WORK_ITEM_TYPES) {
      expect(parseItemRef(itemRef(type, 12))).toEqual({ type, number: 12 });
      expect(itemRefText(type, 12)).toBe(`${TYPE_SHORT[type]} 12`);
    }
    expect(itemRef("RFI", 12)).toBe("RFI-12");
    expect(itemRef("SITE_INSTRUCTION", 3)).toBe("SI-3");
    expect(itemRefText("INSPECTION", 7)).toBe("Insp 7");
  });

  it("the short words are unique and letters only, so each reads back to one type", () => {
    const shorts = WORK_ITEM_TYPES.map((t) => TYPE_SHORT[t]);
    expect(new Set(shorts).size).toBe(shorts.length);
    for (const s of shorts) expect(s).toMatch(/^[A-Za-z]+$/);
  });

  it.each(["rfi-12", "RFI-0", "RFI-012", "RFI-x", "RFI-", "RFI 12", "RFI-12 ", "SITE_INSTRUCTION-3", "Widget-4", "", "RFI-2147483648", "RFI-1.5", "RFI--1"])("%j names nothing", (s) =>
    expect(parseItemRef(s)).toBeNull(),
  );

  it("the largest Int is a reference; one past it is not", () => {
    expect(parseItemRef("RFI-2147483647")).toEqual({ type: "RFI", number: 2_147_483_647 });
  });
});
