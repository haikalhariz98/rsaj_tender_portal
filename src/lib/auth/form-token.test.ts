import { describe, expect, it } from "vitest";

import { FORM_PURPOSES, FORM_SECRET_MIN_LENGTH, FORM_TOKEN_MAX_AGE_MS, FORM_TOKEN_SKEW_MS, formTokenIssuedAt, NONCE_PURPOSES, signFormToken, verifyFormToken, type FormPurpose } from "./form-token";
import { checkFormToken, formSecret, issueFormToken } from "./form-secret";

const KEY = "k".repeat(FORM_SECRET_MIN_LENGTH);
const NOW = new Date("2026-10-12T08:00:00Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);
/// A nonce as `issueFormToken` makes one: 16 bytes in base64url.
const NONCE = "AAAAAAAAAAAAAAAAAAAAAA";
const sign = (purpose: FormPurpose, at: Date = NOW, key = KEY) => (NONCE_PURPOSES.includes(purpose) ? signFormToken(key, purpose, at, NONCE) : signFormToken(key, purpose, at));

describe("the signed form token", () => {
  it("is accepted for its own form, signed with the deployment key, while it is fresh", () => {
    const t = sign("register");
    expect(verifyFormToken(KEY, "register", t, NOW)).toBe("OK");
    expect(verifyFormToken(KEY, "register", t, later(FORM_TOKEN_MAX_AGE_MS))).toBe("OK");
  });

  it("is refused for another form, whichever form it was made for", () => {
    // ADR 0041 D8: a token with a nonce and one without are not even of the same shape, so one used at the other's form is malformed rather than mis-signed.
    for (const made of FORM_PURPOSES) {
      const t = sign(made);
      for (const used of FORM_PURPOSES) {
        const sameShape = NONCE_PURPOSES.includes(made) === NONCE_PURPOSES.includes(used);
        expect(verifyFormToken(KEY, used, t, NOW), `${made} used at ${used}`).toBe(made === used ? "OK" : sameShape ? "BAD_SIGNATURE" : "MALFORMED");
      }
    }
  });

  it("is refused when it is missing, malformed, signed with another key, tampered with in time, expired or from the future", () => {
    const t = signFormToken(KEY, "sign-in", NOW);
    expect(verifyFormToken(KEY, "sign-in", undefined, NOW)).toBe("MISSING");
    expect(verifyFormToken(KEY, "sign-in", "", NOW)).toBe("MISSING");
    expect(verifyFormToken(KEY, "sign-in", "nonsense", NOW)).toBe("MALFORMED");
    expect(verifyFormToken(KEY, "sign-in", t.replace(/^\d+/, "12"), NOW)).toBe("BAD_SIGNATURE");
    expect(verifyFormToken("z".repeat(FORM_SECRET_MIN_LENGTH), "sign-in", t, NOW)).toBe("BAD_SIGNATURE");
    expect(verifyFormToken(KEY, "sign-in", t, later(FORM_TOKEN_MAX_AGE_MS + 1))).toBe("EXPIRED");
    expect(verifyFormToken(KEY, "sign-in", t, later(-FORM_TOKEN_SKEW_MS - 1))).toBe("FROM_THE_FUTURE");
    expect(verifyFormToken(KEY, "sign-in", t, later(-FORM_TOKEN_SKEW_MS))).toBe("OK");
  });

  it("is never judged against a key that is not set or too short: nothing is signed with a default", () => {
    const t = sign("register");
    expect(verifyFormToken(null, "register", t, NOW)).toBe("KEY_NOT_SET");
    expect(verifyFormToken("short", "register", t, NOW)).toBe("KEY_NOT_SET");
    expect(formSecret({})).toBeNull();
    expect(formSecret({ PORTAL_FORM_SECRET: "short" })).toBeNull();
    expect(formSecret({ PORTAL_FORM_SECRET: KEY })).toBe(KEY);
    expect(issueFormToken("register", NOW, null)).toBeNull();
    expect(checkFormToken("register", t, NOW, null)).toBe("KEY_NOT_SET");
    expect(checkFormToken("register", issueFormToken("register", NOW, KEY), NOW, KEY)).toBe("OK");
  });
});

describe("the register token's nonce (ADR 0041 D8)", () => {
  it("is carried and signed: issuedAt.nonce.mac", () => {
    const t = issueFormToken("register", NOW, KEY)!;
    expect(t).toMatch(/^\d+\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
    expect(checkFormToken("register", t, NOW, KEY)).toBe("OK");
    // Another nonce under the same signature is a forgery.
    const [at, , sig] = t.split(".");
    expect(checkFormToken("register", `${at}.${"B".repeat(22)}.${sig}`, NOW, KEY)).toBe("BAD_SIGNATURE");
  });

  it("makes two tokens issued in the same millisecond differ", () => {
    const a = issueFormToken("register", NOW, KEY);
    const b = issueFormToken("register", NOW, KEY);
    expect(a).not.toBe(b);
    expect(checkFormToken("register", a, NOW, KEY)).toBe("OK");
    expect(checkFormToken("register", b, NOW, KEY)).toBe("OK");
  });

  it("is required: a register token without one is malformed, and none is signed without one", () => {
    const nonceless = `${NOW.getTime()}.${signFormToken(KEY, "sign-in", NOW).split(".")[1]}`;
    expect(verifyFormToken(KEY, "register", nonceless, NOW)).toBe("MALFORMED");
    expect(() => signFormToken(KEY, "register", NOW)).toThrow();
    expect(() => signFormToken(KEY, "register", NOW, "short")).toThrow();
  });

  it("leaves every other form's token as it was: no nonce, and none accepted", () => {
    for (const p of FORM_PURPOSES.filter((x) => !NONCE_PURPOSES.includes(x))) {
      expect(issueFormToken(p, NOW, KEY)).toBe(signFormToken(KEY, p, NOW));
      expect(issueFormToken(p, NOW, KEY)).toMatch(/^\d+\.[A-Za-z0-9_-]{43}$/);
      expect(() => signFormToken(KEY, p, NOW, NONCE)).toThrow();
    }
    expect(NONCE_PURPOSES).toEqual(["register"]);
  });

  it("says when it was made, for the record of a spent token", () => {
    expect(formTokenIssuedAt("register", sign("register"))).toEqual(NOW);
    expect(formTokenIssuedAt("register", sign("sign-in"))).toBeNull();
    expect(formTokenIssuedAt("sign-in", sign("sign-in"))).toEqual(NOW);
  });
});
