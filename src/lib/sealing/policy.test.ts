import { describe, expect, it } from "vitest";

import { attestationFor, exercisesStillTakingBids, sealingModeWords, sealingPolicyFaults, stampFor } from "./policy";

const T0 = new Date("2026-10-01T00:00:00Z");
const NOW = new Date("2026-10-14T00:00:00Z");
const live = { cryptoReviewReference: "R", procedureAmendmentReference: "A", customerAcceptanceReference: "C", scannerConfigured: true, liveAllowedByDeployment: true, pepperConfigured: true, publicRoleAttestation: "x", deploymentHardeningAttestation: "y" };

describe("the stamp of a recorded reference", () => {
  it("a changed text takes now, an unchanged one keeps its stamp, a cleared one loses it", () => {
    expect(stampFor({ text: "", at: null }, "REF-1", NOW)).toEqual(NOW);
    expect(stampFor({ text: "REF-1", at: T0 }, " REF-1 ", NOW)).toEqual(T0);
    expect(stampFor({ text: "REF-1", at: T0 }, "REF-2", NOW)).toEqual(NOW);
    expect(stampFor({ text: "REF-1", at: T0 }, "   ", NOW)).toBeNull();
  });
  it("an attestation keeps who attested while it is unchanged and names the new person when it changes", () => {
    expect(attestationFor({ text: "ok", at: T0, byPersonId: "p1" }, "ok", NOW, "p2")).toEqual({ at: T0, byPersonId: "p1" });
    expect(attestationFor({ text: "ok", at: T0, byPersonId: "p1" }, "ok now", NOW, "p2")).toEqual({ at: NOW, byPersonId: "p2" });
    expect(attestationFor({ text: "ok", at: T0, byPersonId: "p1" }, "", NOW, "p2")).toEqual({ at: null, byPersonId: null });
  });
});

describe("saving the policy", () => {
  it("LIVE lists every missing condition; DEMONSTRATION and unset are never refused for them", () => {
    expect(sealingPolicyFaults({ mode: "LIVE", live: { ...live, scannerConfigured: false, pepperConfigured: false } })).toEqual(["SCANNER_NOT_CONFIGURED", "PEPPER_NOT_SET"]);
    expect(sealingPolicyFaults({ mode: "LIVE", live })).toEqual([]);
    expect(sealingPolicyFaults({ mode: "DEMONSTRATION", live: { ...live, scannerConfigured: false } })).toEqual([]);
    expect(sealingPolicyFaults({ mode: null, live: { ...live, scannerConfigured: false } })).toEqual([]);
  });
  it("an unset mode reads Not set in words", () => {
    expect(sealingModeWords(null)).toBe("Not set");
  });
});

describe("the exercises still taking bids", () => {
  it("published ONLINE exercises whose main opening has not started; never paper, cancelled or opened", () => {
    const rows = [
      { id: "a", status: "ADVERTISED", channel: "ONLINE", mainOpeningStarted: false },
      { id: "late", status: "ADVERTISED", channel: "ONLINE", mainOpeningStarted: false },
      { id: "paper", status: "ADVERTISED", channel: "PAPER", mainOpeningStarted: false },
      { id: "draft", status: "DRAFT", channel: "ONLINE", mainOpeningStarted: false },
      { id: "cancelled", status: "CANCELLED", channel: "ONLINE", mainOpeningStarted: false },
      { id: "opened", status: "OPENING_IN_PROGRESS", channel: "ONLINE", mainOpeningStarted: true },
    ];
    expect(exercisesStillTakingBids(rows).map((r) => r.id)).toEqual(["a", "late"]);
  });
});
