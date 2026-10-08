import { describe, expect, it } from "vitest";

import { bumiputeraNeedsAttention, bumiputeraReading, bumiputeraWords } from "./bumiputera";

const stb = (verification: "NOT_CHECKED" | "VERIFIED" | "NOT_IN_ORDER") => ({ reference: "STB-9912", verification });
const CLAIM = "Bumiputera company";

describe("Bumiputera status is read as declared, never as fact", () => {
  it("is not set while the organisation has not said which document evidences it", () => {
    expect(bumiputeraReading(CLAIM, false, null, "REGISTER").kind).toBe("NOT_SET");
    expect(bumiputeraReading(null, false, stb("VERIFIED"), "REGISTER").kind).toBe("NOT_SET");
    expect(bumiputeraWords(bumiputeraReading(CLAIM, false, null, "REGISTER")).en).toBe("Declared: Bumiputera company · what evidences it is not set");
  });

  it("makes no claim of its own: no claim is no claim, whatever is lodged", () => {
    expect(bumiputeraReading(null, true, null, "APPLICATION").kind).toBe("NO_CLAIM");
    expect(bumiputeraReading(null, true, stb("VERIFIED"), "REGISTER").kind).toBe("NO_CLAIM");
    expect(bumiputeraWords(bumiputeraReading(null, true, null, "REGISTER")).en).toBe("No claim made");
  });

  it("at the application stage a claim has nothing to be checked against yet", () => {
    const r = bumiputeraReading(CLAIM, true, null, "APPLICATION");
    expect(r.kind).toBe("DECLARED_ONLY");
    expect(bumiputeraWords(r).en).toBe("Declared: Bumiputera company · nothing lodged to check it yet");
    expect(bumiputeraNeedsAttention(r)).toBe(false);
  });

  it("on the register a claim with no evidence document is flagged to the reviewer", () => {
    const r = bumiputeraReading(CLAIM, true, null, "REGISTER");
    expect(r.kind).toBe("CLAIM_WITHOUT_DOCUMENT");
    expect(bumiputeraNeedsAttention(r)).toBe(true);
    expect(bumiputeraWords(r).ms).toMatch(/tiada dokumen bukti/);
  });

  it("a claim with its document lodged reads as not verified until the document is verified", () => {
    for (const v of ["NOT_CHECKED", "NOT_IN_ORDER"] as const) {
      const r = bumiputeraReading(CLAIM, true, stb(v), "REGISTER");
      expect(r.kind).toBe("DECLARED_EVIDENCE_PENDING");
      expect(bumiputeraNeedsAttention(r)).toBe(false);
    }
    expect(bumiputeraWords(bumiputeraReading(CLAIM, true, stb("NOT_CHECKED"), "REGISTER")).en).toBe("Declared: Bumiputera company · STB-9912 · not verified");
    expect(bumiputeraWords(bumiputeraReading(CLAIM, true, stb("NOT_IN_ORDER"), "REGISTER")).en).toBe("Declared: Bumiputera company · STB-9912 · found not in order");
    const verified = bumiputeraReading(CLAIM, true, stb("VERIFIED"), "REGISTER");
    expect(verified.kind).toBe("DECLARED_VERIFIED");
    expect(bumiputeraWords(verified).en).toBe("Declared: Bumiputera company · STB-9912 · verified");
  });

  it("every reading with a claim says Declared, in both languages, and never shows a code", () => {
    for (const claim of [CLAIM, null]) {
      for (const stage of ["APPLICATION", "REGISTER"] as const) {
        for (const doc of [null, stb("NOT_CHECKED"), stb("VERIFIED")]) {
          for (const set of [true, false]) {
            const w = bumiputeraWords(bumiputeraReading(claim, set, doc, stage));
            if (claim) {
              expect(w.en).toMatch(/^Declared: /);
              expect(w.ms).toMatch(/^Diisytiharkan: /);
            }
            expect(w.en).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
          }
        }
      }
    }
  });
});
