import { describe, expect, it } from "vitest";

import { channelSettingFaults, TAKE_CHANNEL_WORDS, takeChannelFaults, DEMONSTRATION_WORDS, LIVE_ISSUE_WORDS, liveIssueFaults, ONLINE_SUBMISSION_WORDS, onlineSubmissionAllowed } from "./switch";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

const BOTH = { demoAllowed: true, liveAllowed: true };
const NONE = { demoAllowed: false, liveAllowed: false };

describe("the switch, at publication and at submission (D1, 20i)", () => {
  it("unset refuses, in either moment, whatever the deployment allows", () => {
    for (const at of ["PUBLISH", "SUBMIT"] as const) expect(onlineSubmissionAllowed(null, BOTH, at)).toEqual({ allowed: false, demonstration: false, fault: "ONLINE_NOT_SET" });
  });

  it("DEMONSTRATION needs the deployment's demonstration flag, read live, at publication and at submission alike", () => {
    for (const at of ["PUBLISH", "SUBMIT"] as const) {
      expect(onlineSubmissionAllowed("DEMONSTRATION", { demoAllowed: true, liveAllowed: false }, at)).toEqual({ allowed: true, demonstration: true, fault: null });
      expect(onlineSubmissionAllowed("DEMONSTRATION", { demoAllowed: false, liveAllowed: true }, at)).toEqual({ allowed: false, demonstration: true, fault: "ONLINE_NOT_ALLOWED" });
    }
  });

  it("LIVE needs the deployment's LIVE flag to publish; a published LIVE exercise keeps taking bids when the flag is cleared (20i, G1)", () => {
    expect(onlineSubmissionAllowed("LIVE", { demoAllowed: false, liveAllowed: true }, "PUBLISH")).toEqual({ allowed: true, demonstration: false, fault: null });
    expect(onlineSubmissionAllowed("LIVE", { demoAllowed: true, liveAllowed: false }, "PUBLISH")).toEqual({ allowed: false, demonstration: false, fault: "ONLINE_NOT_ALLOWED" });
    expect(onlineSubmissionAllowed("LIVE", NONE, "SUBMIT")).toEqual({ allowed: true, demonstration: false, fault: null });
  });
});

describe("issuing LIVE (20o, 20v)", () => {
  const all = { cryptoReviewReference: "CR-2026/1", procedureAmendmentReference: "SK002 rev 3", customerAcceptanceReference: "Letter 12/2026", scannerConfigured: true, liveAllowedByDeployment: true, pepperConfigured: true, publicRoleAttestation: "Role checked 1 Nov", deploymentHardeningAttestation: "Hardened 1 Nov" };

  it("lists nothing when every condition is recorded", () => expect(liveIssueFaults(all)).toEqual([]));

  it("lists every missing condition, in one list", () => {
    expect(
      liveIssueFaults({ cryptoReviewReference: "", procedureAmendmentReference: " ", customerAcceptanceReference: "", scannerConfigured: false, liveAllowedByDeployment: false, pepperConfigured: false, publicRoleAttestation: "", deploymentHardeningAttestation: "\t" }),
    ).toEqual(["REVIEW_NOT_RECORDED", "AMENDMENT_NOT_RECORDED", "ACCEPTANCE_NOT_RECORDED", "SCANNER_NOT_CONFIGURED", "LIVE_NOT_ALLOWED_BY_DEPLOYMENT", "PEPPER_NOT_SET", "PUBLIC_ROLE_NOT_ATTESTED", "HARDENING_NOT_ATTESTED"]);
  });

  it.each([
    ["cryptoReviewReference", "", "REVIEW_NOT_RECORDED"],
    ["procedureAmendmentReference", "", "AMENDMENT_NOT_RECORDED"],
    ["customerAcceptanceReference", "", "ACCEPTANCE_NOT_RECORDED"],
    ["scannerConfigured", false, "SCANNER_NOT_CONFIGURED"],
    ["liveAllowedByDeployment", false, "LIVE_NOT_ALLOWED_BY_DEPLOYMENT"],
    ["pepperConfigured", false, "PEPPER_NOT_SET"],
    ["publicRoleAttestation", "", "PUBLIC_ROLE_NOT_ATTESTED"],
    ["deploymentHardeningAttestation", "", "HARDENING_NOT_ATTESTED"],
  ] as const)("each alone: %s missing gives %s", (field, value, fault) => {
    expect(liveIssueFaults({ ...all, [field]: value })).toEqual([fault]);
  });

  it("each has words, the attestations saying they are not checked by the portal, and none names a setting by its code", () => {
    for (const [k, w] of Object.entries(LIVE_ISSUE_WORDS)) {
      expect(w.length, k).toBeGreaterThan(20);
      expect(w, k).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
    }
    expect(LIVE_ISSUE_WORDS.PUBLIC_ROLE_NOT_ATTESTED).toMatch(/attested, not checked by the portal/);
    // Review N2: the customer's document codes are configuration, never product words.
    for (const [k, w] of Object.entries(LIVE_ISSUE_WORDS)) expect(w, k).not.toMatch(/SK0\d\d/);
    expect(LIVE_ISSUE_WORDS.AMENDMENT_NOT_RECORDED).toMatch(/the organisation's bid procedure/);
    expect(LIVE_ISSUE_WORDS.HARDENING_NOT_ATTESTED).toMatch(/attested, not checked by the portal/);
    for (const w of Object.values(ONLINE_SUBMISSION_WORDS)) expect(w).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
    // Step 11 (ruling 20ab): the banner is `Words`, in both languages; a staff screen reads `.en`.
    expect(DEMONSTRATION_WORDS).toEqual({ en: "Demonstration — not for real tenders" });
  });
});

describe("the organisation's channel (ruling 13)", () => {
  it("is not set to ONLINE while online submission is not allowed; PAPER and unset are always fine", () => {
    const refused = onlineSubmissionAllowed(null, BOTH, "PUBLISH");
    const allowed = onlineSubmissionAllowed("DEMONSTRATION", BOTH, "PUBLISH");
    expect(channelSettingFaults("ONLINE", refused)).toEqual(["ONLINE_NOT_ALLOWED"]);
    expect(channelSettingFaults("ONLINE", allowed)).toEqual([]);
    expect(channelSettingFaults("PAPER", refused)).toEqual([]);
    expect(channelSettingFaults(null, refused)).toEqual([]);
  });
});

describe("taking the organisation's channel (20z, 12e)", () => {
  const base = { status: "DRAFT" as const, published: false, pin: null, setting: "ONLINE" as const };
  const codes = (i: Parameters<typeof takeChannelFaults>[0]) => takeChannelFaults(i).map((f) => f.code);

  it("is allowed while the pin is unset, before publication, with the setting set", () => {
    expect(codes(base)).toEqual([]);
    expect(codes({ ...base, setting: "PAPER" })).toEqual([]);
  });
  it("is refused on a cancelled exercise, after publication, with a pin set, and with no setting", () => {
    expect(codes({ ...base, status: "CANCELLED" })).toEqual(["EXERCISE_CANCELLED"]);
    expect(codes({ ...base, published: true })).toEqual(["ALREADY_PUBLISHED"]);
    expect(codes({ ...base, pin: "PAPER" })).toEqual(["NOTHING_TO_TAKE"]);
    expect(codes({ ...base, setting: null })).toEqual(["SETTING_NOT_SET"]);
  });
  it("says where the setting is made, and that two people make it, with no code on show", () => {
    expect(TAKE_CHANNEL_WORDS.SETTING_NOT_SET).toMatch(/Configuration, Invitation/);
    expect(TAKE_CHANNEL_WORDS.SETTING_NOT_SET).toMatch(/two people/i);
    for (const w of Object.values(TAKE_CHANNEL_WORDS)) expect(w).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
  });
});
