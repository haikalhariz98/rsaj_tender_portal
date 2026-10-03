import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { amountInWords, englishWords, malayWords } from "./words";

/** An amount in words, English and Malay (FR-PAD-002). */

describe("amountInWords", () => {
  it("3,437,773.67 (the §8.8 revised sum), both languages", () => {
    expect(amountInWords(parseSen("3437773.67"), "en")).toBe("Ringgit Malaysia three million four hundred and thirty-seven thousand seven hundred and seventy-three and sen sixty-seven only");
    expect(amountInWords(parseSen("3437773.67"), "ms")).toBe("Ringgit Malaysia tiga juta empat ratus tiga puluh tujuh ribu tujuh ratus tujuh puluh tiga dan sen enam puluh tujuh sahaja");
  });
  it("whole ringgit say no sen; the sign is the direction's to say, not the words'", () => {
    expect(amountInWords(parseSen("57773.00"), "en")).toBe("Ringgit Malaysia fifty-seven thousand seven hundred and seventy-three only");
    expect(amountInWords(parseSen("-1000.00"), "ms")).toBe("Ringgit Malaysia seribu sahaja");
  });
  it("Malay's own forms: seratus, seribu, sejuta, sepuluh, sebelas, belas", () => {
    expect(malayWords(100n)).toBe("seratus");
    expect(malayWords(1_000_000n)).toBe("sejuta");
    expect(malayWords(1_110n)).toBe("seribu seratus sepuluh");
    expect(malayWords(11n)).toBe("sebelas");
    expect(malayWords(219n)).toBe("dua ratus sembilan belas");
    expect(malayWords(0n)).toBe("kosong");
  });
  it("English: and before the tens of a hundred and of a trailing group", () => {
    expect(englishWords(1_000_005n)).toBe("one million and five");
    expect(englishWords(120n)).toBe("one hundred and twenty");
    expect(englishWords(2_000_000_000n)).toBe("two billion");
  });
});
