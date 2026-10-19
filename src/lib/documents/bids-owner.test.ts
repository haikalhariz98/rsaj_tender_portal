import { describe, expect, it } from "vitest";

import { attachFault, detachFault, ownerState, purposeFits, reliedOn, type OwnerFacts } from "./attach";
import { EXIT_TEXT, documentFaultText } from "./labels";
import { extensionFacts, withdrawalFacts } from "./owner-facts";
import { ownerHref } from "./targets";

/**
 * 6.6 (X-6, X-11, FR-BID-004, 010): a withdrawal keeps its letter, held SULIT, and stands on it;
 * a validity extension keeps the tenderer's consent while it is not applied, and stands on it
 * once applied. Both are frozen with a cancelled exercise.
 */

const sulit = { version: { withdrawnAt: null }, documentClass: { classification: "SULIT" as const } };
const internal = { version: { withdrawnAt: null }, documentClass: { classification: "INTERNAL" as const } };
const withdrawal = (status: "ADVERTISED" | "CANCELLED" = "ADVERTISED"): OwnerFacts => withdrawalFacts({ exercise: { status } });
const extension = (applied: boolean, status: "ADVERTISED" | "CANCELLED" = "ADVERTISED"): OwnerFacts => extensionFacts({ appliedAt: applied ? new Date() : null, exercise: { status } });

describe("a bid withdrawal as an attachment owner", () => {
  it("takes only its letter, and only as SULIT", () => {
    expect(purposeFits("WITHDRAWAL_LETTER", withdrawal())).toBe(true);
    expect(purposeFits("VALIDITY_CONSENT", withdrawal())).toBe(false);
    expect(attachFault({ purpose: "WITHDRAWAL_LETTER", owner: withdrawal(), ...sulit })).toEqual([]);
    const below = attachFault({ purpose: "WITHDRAWAL_LETTER", owner: withdrawal(), ...internal });
    expect(below.map((f) => f.code)).toEqual(["CLASSIFICATION_BELOW_PURPOSE"]);
  });
  it("stands on its last live letter: replaced by a new version, never simply taken off", () => {
    expect(reliedOn("WITHDRAWAL_LETTER", withdrawal(), 1)).toBe("WITHDRAWN_ON_IT");
    expect(reliedOn("WITHDRAWAL_LETTER", withdrawal(), 2)).toBeNull();
    const f = detachFault({ purpose: "WITHDRAWAL_LETTER", owner: withdrawal(), reason: "wrong scan", reliedOn: "WITHDRAWN_ON_IT" });
    expect(f.map((x) => x.code)).toEqual(["RELIED_ON"]);
    expect(documentFaultText(f[0])).toMatch(/Withdrawal recorded on this letter/);
  });
  it("is frozen with a cancelled exercise", () => {
    expect(ownerState("WITHDRAWAL_LETTER", withdrawal("CANCELLED"))).toEqual({ state: "FROZEN", exit: "EXERCISE_CANCELLED" });
  });
});

describe("a validity extension as an attachment owner", () => {
  it("takes the consent while not applied", () => {
    expect(purposeFits("VALIDITY_CONSENT", extension(false))).toBe(true);
    expect(attachFault({ purpose: "VALIDITY_CONSENT", owner: extension(false), ...internal })).toEqual([]);
  });
  it("stands as applied on its consent, saying why", () => {
    expect(ownerState("VALIDITY_CONSENT", extension(true))).toEqual({ state: "FROZEN", exit: "EXTENSION_APPLIED" });
    expect(EXIT_TEXT.EXTENSION_APPLIED).toMatch(/another one/);
    expect(ownerState("VALIDITY_CONSENT", extension(false, "CANCELLED"))).toEqual({ state: "FROZEN", exit: "EXERCISE_CANCELLED" });
  });
  it("both link to the exercise's Bids received tab", () => {
    expect(ownerHref("bidWithdrawal", "w1", "x1")).toBe("/sourcing/x1?tab=bids");
    expect(ownerHref("validityExtension", "v1", "x1")).toBe("/sourcing/x1?tab=bids");
  });
});
