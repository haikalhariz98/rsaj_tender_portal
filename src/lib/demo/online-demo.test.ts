import { describe, expect, it } from "vitest";

import { channelSettingFaults, onlineSubmissionAllowed } from "@/lib/sealing/switch";

import { closingAfter, DEMO_UNSEAL_PASSPHRASES, NEEDS_FLAG_WORDS, NEEDS_MODE_WORDS, NEEDS_PASSPHRASE_WORDS, NEEDS_PEPPER_WORDS, NEEDS_STORE_WORDS, NEEDS_WORKING_DAY_WORDS, onlineDemoDecision, unsetOnlineSettings, type OnlineDemoFacts } from "./online-demo";

const ready: OnlineDemoFacts = { channelFaults: [], blobStoreReady: true, pepperFault: null, closingDayFaults: [], existingMode: null, passphraseMinLength: null };

describe("whether the demonstration can be made online (wave 3b step 18, ruling 20z)", () => {
  it("is online only when the product's own channel rule allows it and the pieces it stands on are there", () => {
    expect(onlineDemoDecision(ready)).toEqual({ online: true });
  });

  it("falls back, naming the flag, where the deployment does not allow demonstration bids", () => {
    const faults = channelSettingFaults("ONLINE", onlineSubmissionAllowed("DEMONSTRATION", { demoAllowed: false, liveAllowed: true }, "PUBLISH"));
    expect(faults.length).toBeGreaterThan(0);
    const d = onlineDemoDecision({ ...ready, channelFaults: faults });
    expect(d).toEqual({ online: false, reasons: [NEEDS_FLAG_WORDS] });
    expect(NEEDS_FLAG_WORDS).toContain("SEALED_BIDS_DEMONSTRATION_ALLOWED");
  });

  it("is online where the flag allows it, by the same rule", () => {
    expect(channelSettingFaults("ONLINE", onlineSubmissionAllowed("DEMONSTRATION", { demoAllowed: true, liveAllowed: false }, "PUBLISH"))).toEqual([]);
  });

  it("lists every reason it cannot, and a missing store or a wrong pepper is a reason on its own", () => {
    expect(onlineDemoDecision({ ...ready, blobStoreReady: false })).toEqual({ online: false, reasons: [NEEDS_STORE_WORDS] });
    expect(onlineDemoDecision({ ...ready, pepperFault: "PEPPER_INVALID" })).toEqual({ online: false, reasons: [NEEDS_PEPPER_WORDS] });
    expect(onlineDemoDecision({ ...ready, channelFaults: ["ONLINE_NOT_ALLOWED"], blobStoreReady: false, pepperFault: "PEPPER_INVALID" })).toEqual({ online: false, reasons: [NEEDS_FLAG_WORDS, NEEDS_STORE_WORDS, NEEDS_PEPPER_WORDS] });
  });

  it("falls back on a day the calendar will not close on, and says which rule, so a weekend load completes instead of stopping at the publication", () => {
    const d = onlineDemoDecision({ ...ready, closingDayFaults: ["A closing cannot fall on a Saturday."] });
    expect(d).toEqual({ online: false, reasons: [`${NEEDS_WORKING_DAY_WORDS} A closing cannot fall on a Saturday.`] });
  });

  it("never changes a setting that is already set: a live mode, or a longer passphrase minimum than the demonstration's, is a reason to fall back", () => {
    expect(onlineDemoDecision({ ...ready, existingMode: "DEMONSTRATION" })).toEqual({ online: true });
    expect(onlineDemoDecision({ ...ready, existingMode: "LIVE" })).toEqual({ online: false, reasons: [NEEDS_MODE_WORDS] });
    expect(onlineDemoDecision({ ...ready, passphraseMinLength: 12 })).toEqual({ online: true });
    expect(onlineDemoDecision({ ...ready, passphraseMinLength: 64 })).toEqual({ online: false, reasons: [NEEDS_PASSPHRASE_WORDS] });
  });
});

describe("the settings a re-run names (ruling 12c: it writes nothing)", () => {
  const set = { documentSaleMode: "COUNTER" as const, submissionChannel: "ONLINE" as const, onlineSubmission: "DEMONSTRATION" as const, sealingPassphraseMinLength: 12, onlineBidFileClassSet: true };

  it("says nothing where every setting is set", () => {
    expect(unsetOnlineSettings(set)).toEqual([]);
  });

  it("names each setting that is not set, in words, and never reads an unset one as paper or off", () => {
    const lines = unsetOnlineSettings({ documentSaleMode: null, submissionChannel: null, onlineSubmission: null, sealingPassphraseMinLength: null, onlineBidFileClassSet: false });
    expect(lines).toHaveLength(5);
    expect(lines.join(" ")).toMatch(/How the documents are sold/);
    expect(lines.join(" ")).toMatch(/How bids are submitted/);
    expect(lines.join(" ")).toMatch(/refuses an exercise made while it is unset/);
    expect(lines.join(" ")).not.toMatch(/\bPAPER\b|as paper|is off/);
  });

  it("names the founder's database's two (the channel and the sale mode) when they are the only ones missing", () => {
    expect(unsetOnlineSettings({ ...set, documentSaleMode: null, submissionChannel: null })).toHaveLength(2);
  });
});

describe("the demonstration's passphrases", () => {
  it("are at least the policy's twelve characters, distinct, and one for each officer the committee can name", () => {
    expect(new Set(DEMO_UNSEAL_PASSPHRASES).size).toBe(DEMO_UNSEAL_PASSPHRASES.length);
    for (const p of DEMO_UNSEAL_PASSPHRASES) expect(p.length).toBeGreaterThanOrEqual(12);
    expect(DEMO_UNSEAL_PASSPHRASES.length).toBeGreaterThanOrEqual(2);
  });
});

describe("the closing a few minutes ahead", () => {
  it("falls on a whole minute after the asked time, in the organisation's zone", () => {
    const r = closingAfter(new Date("2026-10-16T02:00:30.000Z"), 4, "Asia/Kuala_Lumpur");
    expect(r.instant.toISOString()).toBe("2026-10-16T02:05:00.000Z");
    expect(r).toMatchObject({ day: "2026-10-16", time: "10:05" });
  });

  it("carries the day over midnight in the zone, not in UTC", () => {
    const r = closingAfter(new Date("2026-10-16T15:58:00.000Z"), 4, "Asia/Kuala_Lumpur");
    expect(r).toMatchObject({ day: "2026-10-17", time: "00:02" });
  });
});
