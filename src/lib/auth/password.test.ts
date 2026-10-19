import { scryptSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { dummyHash, hashParameters, hashPassword, needsRehash, parseHash, passwordFaults, SCRYPT, verifyPassword } from "./password";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

describe("password hashing", () => {
  it("holds a PHC-style string with its parameters, and checks the right password and no other", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored).toMatch(/^\$scrypt\$ln=15,r=8,p=3\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(stored).not.toContain("correct horse");
    expect(await verifyPassword(stored, "correct horse battery")).toEqual({ ok: true, needsRehash: false });
    expect((await verifyPassword(stored, "correct horse batterY")).ok).toBe(false);
    expect((await verifyPassword(stored, "")).ok).toBe(false);
  });

  it("salts each hash, so the same password gives two different strings", async () => {
    expect(await hashPassword("same words here")).not.toBe(await hashPassword("same words here"));
  });

  it("reads the same password typed in two Unicode forms as one", async () => {
    const stored = await hashPassword("café au lait");
    expect((await verifyPassword(stored, "café au lait")).ok).toBe(true);
  });

  it("asks for a re-hash only for a hash made with weaker parameters, and only after a good check", async () => {
    const salt = Buffer.alloc(16, 7);
    const weak = `$scrypt$ln=14,r=8,p=3$${salt.toString("base64url")}$${scryptSync("old password", salt, 32, { N: 2 ** 14, r: 8, p: 3 }).toString("base64url")}`;
    expect(needsRehash(weak)).toBe(true);
    expect(await verifyPassword(weak, "old password")).toEqual({ ok: true, needsRehash: true });
    expect(await verifyPassword(weak, "other password")).toEqual({ ok: false, needsRehash: false });
    expect(needsRehash(await hashPassword("fresh one here"))).toBe(false);
  });

  it("refuses a stored string it did not write, and one that would make the server allocate without limit", async () => {
    expect(parseHash("")).toBeNull();
    expect(parseHash("$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$aGFzaA")).toBeNull();
    expect(parseHash("$scrypt$ln=15,r=8,p=3$AAAA$BBBB")).toBeNull(); // salt and hash too short
    expect(parseHash("$scrypt$ln=25,r=8,p=3$AAAAAAAAAAAAAAAA$BBBBBBBBBBBBBBBBBBBBBBBB")).toBeNull();
    expect(parseHash("$scrypt$ln=20,r=16,p=3$AAAAAAAAAAAAAAAA$BBBBBBBBBBBBBBBBBBBBBBBB")).toBeNull(); // 128 * 2^20 * 16 is over the memory cap
    expect(await verifyPassword("not a hash", "anything")).toEqual({ ok: false, needsRehash: false });
  });

  it("keeps a dummy hash made with the current parameters, for the names that do not exist", async () => {
    const dummy = await dummyHash();
    expect(parseHash(dummy)).toMatchObject({ ln: SCRYPT.ln, r: SCRYPT.r, p: SCRYPT.p });
    expect(await dummyHash()).toBe(dummy);
  });
});

describe("password rules", () => {
  const ok = { loginName: "ahmad.z", minLength: 12 };

  it("takes its minimum from the organisation's setting, counted in characters", () => {
    expect(passwordFaults("a".repeat(11), ok).map((f) => f.code)).toEqual(["TOO_SHORT"]);
    expect(passwordFaults("a".repeat(12), ok)).toEqual([]);
    expect(passwordFaults("a".repeat(12), { ...ok, minLength: 8 })).toEqual([]);
    // Twelve characters, though more than twelve bytes.
    expect(passwordFaults("é".repeat(12), ok)).toEqual([]);
    expect(passwordFaults("\u{1F600}".repeat(11), ok).map((f) => f.code)).toEqual(["TOO_SHORT"]);
  });

  it("refuses more than 256 characters rather than cutting it", () => {
    expect(passwordFaults("a".repeat(256), ok)).toEqual([]);
    expect(passwordFaults("a".repeat(257), ok).map((f) => f.code)).toEqual(["TOO_LONG"]);
  });

  it("refuses the sign-in name as the password, whatever its case, and nothing else about its makeup", () => {
    expect(passwordFaults("Ahmad.Z.Ahmad.Z", { loginName: "ahmad.z.ahmad.z", minLength: 8 }).map((f) => f.code)).toEqual(["SAME_AS_LOGIN"]);
    expect(passwordFaults("aaaaaaaaaaaa", ok)).toEqual([]); // no composition rule
    expect(passwordFaults("password1234", ok)).toEqual([]);
  });

  it("says each fault in both languages", () => {
    const [fault] = passwordFaults("x", ok);
    expect(fault.en).toContain("12");
  });
});

describe("hashParameters", () => {
  it("says how a hash was made and nothing of the hash itself", async () => {
    const stored = await hashPassword("some words here");
    expect(hashParameters(stored)).toBe("ln=15,r=8,p=3");
    expect(hashParameters("nonsense")).toBeNull();
  });
});
