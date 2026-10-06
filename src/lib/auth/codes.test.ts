import { describe, expect, it } from "vitest";

import { codeExpiry, codeVerdict, formatCode, generateCode, hashCode, normaliseCode } from "./codes";

describe("one-time codes", () => {
  it("is 128 random bits shown as 26 characters of base32 with no look-alike letters", () => {
    const code = generateCode();
    expect(code).toHaveLength(26);
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
    expect(generateCode()).not.toBe(code);
  });

  it("encodes the bytes it is given, so a code carries all 128 bits", () => {
    expect(generateCode(() => Buffer.alloc(16, 0))).toBe("0".repeat(26));
    const last = generateCode(() => Buffer.alloc(16, 0xff));
    expect(last.slice(0, 25)).toBe("Z".repeat(25));
    expect(last[25]).toBe("W"); // 128 bits fill 25 characters and 3 bits of the 26th, and the other two are zero
  });

  it("is shown in groups of four", () => {
    expect(formatCode("ABCDEFGHJKMNPQRSTVWXYZ0123")).toBe("ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-23");
  });

  it("reads back what was typed, in groups or not, in any case, with look-alikes as Crockford reads them", () => {
    const code = generateCode();
    expect(normaliseCode(formatCode(code))).toBe(code);
    expect(normaliseCode(formatCode(code).toLowerCase())).toBe(code);
    expect(normaliseCode(` ${formatCode(code)} `.replace(/-/g, " "))).toBe(code);
    expect(normaliseCode("O".repeat(26))).toBe("0".repeat(26));
    expect(normaliseCode("I".repeat(13) + "l".repeat(13))).toBe("1".repeat(26));
  });

  it("is null for anything that cannot be a code", () => {
    expect(normaliseCode("")).toBeNull();
    expect(normaliseCode("ABCD")).toBeNull();
    expect(normaliseCode("U".repeat(26))).toBeNull(); // U is not in the alphabet
    expect(normaliseCode("A".repeat(27))).toBeNull();
    expect(normaliseCode("!".repeat(26))).toBeNull();
  });

  it("is stored only as its SHA-256, the same for the same code however it was typed", () => {
    const code = generateCode();
    expect(hashCode(code)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCode(code)).not.toContain(code);
    expect(hashCode(normaliseCode(formatCode(code).toLowerCase())!)).toBe(hashCode(code));
    expect(hashCode(generateCode())).not.toBe(hashCode(code));
  });

  it("is valid once, until it expires", () => {
    const now = new Date("2026-10-06T09:00:00Z");
    const expiresAt = codeExpiry(now, 60);
    expect(expiresAt).toEqual(new Date("2026-10-06T10:00:00Z"));
    expect(codeVerdict({ usedAt: null, expiresAt }, new Date("2026-10-06T09:59:59Z"))).toBe("VALID");
    expect(codeVerdict({ usedAt: null, expiresAt }, expiresAt)).toBe("EXPIRED");
    expect(codeVerdict({ usedAt: now, expiresAt }, now)).toBe("USED");
  });
});
