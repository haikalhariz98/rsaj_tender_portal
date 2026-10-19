import { describe, expect, it } from "vitest";

import { PRICE_NOT_READ_WORDS, PriceNotReadError, priceOrWords, priceRead } from "./price";

describe("the price as read, which an online bid has only from the finalise (ADR 0036 D10, ruling 20)", () => {
  it("a read price is returned as it is, zero included", () => {
    expect(priceRead({ priceAsRead: "125000.00", listingNo: 1 })).toBe("125000.00");
    expect(priceRead({ priceAsRead: 0, listingNo: 2 })).toBe(0);
  });

  it("an unread price is refused by name, never read as nothing", () => {
    expect(() => priceRead({ priceAsRead: null, listingNo: 3 })).toThrow(PriceNotReadError);
    try {
      priceRead({ priceAsRead: null, listingNo: 3 });
    } catch (e) {
      expect((e as PriceNotReadError).code).toBe("PRICE_NOT_READ");
      expect((e as PriceNotReadError).listingNo).toBe(3);
      expect((e as Error).message).toMatch(/bid 3 not read/);
      expect((e as Error).message).toMatch(/finalising/);
    }
    expect(() => priceRead({ priceAsRead: undefined as unknown as null })).toThrow(/unnumbered/);
  });

  it("a screen shows the read price formatted, or the words, never a figure for an unread one", () => {
    expect(priceOrWords("10.00", (p) => `RM ${p}`)).toBe("RM 10.00");
    expect(priceOrWords(null, (p: string) => `RM ${p}`)).toBe(PRICE_NOT_READ_WORDS);
    expect(PRICE_NOT_READ_WORDS).not.toMatch(/\d/);
  });
});
