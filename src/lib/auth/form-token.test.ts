import { describe, expect, it } from "vitest";

import { FORM_PURPOSES, FORM_SECRET_MIN_LENGTH, FORM_TOKEN_MAX_AGE_MS, FORM_TOKEN_SKEW_MS, signFormToken, verifyFormToken } from "./form-token";
import { checkFormToken, formSecret, issueFormToken } from "./form-secret";

const KEY = "k".repeat(FORM_SECRET_MIN_LENGTH);
const NOW = new Date("2026-10-12T08:00:00Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);

describe("the signed form token", () => {
  it("is accepted for its own form, signed with the deployment key, while it is fresh", () => {
    const t = signFormToken(KEY, "register", NOW);
    expect(verifyFormToken(KEY, "register", t, NOW)).toBe("OK");
    expect(verifyFormToken(KEY, "register", t, later(FORM_TOKEN_MAX_AGE_MS))).toBe("OK");
  });

  it("is refused for another form, whichever form it was made for", () => {
    for (const made of FORM_PURPOSES) {
      const t = signFormToken(KEY, made, NOW);
      for (const used of FORM_PURPOSES) expect(verifyFormToken(KEY, used, t, NOW), `${made} used at ${used}`).toBe(made === used ? "OK" : "BAD_SIGNATURE");
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
    const t = signFormToken(KEY, "register", NOW);
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
