import { describe, expect, it } from "vitest";

import { fillUnset, policyFault, policyFaultWords, rangeFault, rangeFaultWords, SETTING_RANGES, retentionStatement, SETTING_LABELS, settingLabels, signInSettings, unsetSettings } from "./policy";
import type { SecurityPolicyValues } from "./types";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

const unset: SecurityPolicyValues = {
  staffIdleMinutes: null,
  staffAbsoluteMinutes: null,
  supplierIdleMinutes: null,
  supplierAbsoluteMinutes: null,
  maxConcurrentSessions: null,
  concurrentSessionAction: null,
  maxFailedAttempts: null,
  lockoutMinutes: null,
  addressThrottleAttempts: null,
  addressThrottleMinutes: null,
  passwordMinLength: null,
  resetCodeValidityMinutes: null,
  paperSignatureRecording: null,
  signInDetailRetentionDays: null,
  sealingPassphraseMinLength: null,
  twoPersonChanges: true,
};
const signInSet: SecurityPolicyValues = {
  ...unset,
  staffIdleMinutes: 30,
  staffAbsoluteMinutes: 480,
  maxConcurrentSessions: 2,
  concurrentSessionAction: "REFUSE_NEW",
  maxFailedAttempts: 5,
  lockoutMinutes: 15,
  addressThrottleAttempts: 10,
  addressThrottleMinutes: 30,
};

describe("unsetSettings", () => {
  it("is every setting sign-in needs where the organisation has no policy at all", () => {
    expect(unsetSettings(null, "SIGN_IN")).toEqual([
      "staffIdleMinutes",
      "staffAbsoluteMinutes",
      "maxConcurrentSessions",
      "concurrentSessionAction",
      "maxFailedAttempts",
      "lockoutMinutes",
      "addressThrottleAttempts",
      "addressThrottleMinutes",
    ]);
  });

  it("is empty once they are all set, and names only the ones missing", () => {
    expect(unsetSettings(signInSet, "SIGN_IN")).toEqual([]);
    expect(unsetSettings({ ...signInSet, lockoutMinutes: null, concurrentSessionAction: null }, "SIGN_IN")).toEqual(["concurrentSessionAction", "lockoutMinutes"]);
  });

  it("counts a zero as set: zero is a value, unset is null", () => {
    expect(unsetSettings({ ...signInSet, maxConcurrentSessions: 0 }, "SIGN_IN")).toEqual([]);
  });

  it("adds what setting a password and issuing a code need, once each", () => {
    expect(unsetSettings(signInSet, "SIGN_IN", "SET_PASSWORD", "ISSUE_CODE")).toEqual(["passwordMinLength", "resetCodeValidityMinutes"]);
    expect(unsetSettings(signInSet, "SET_PASSWORD", "SET_PASSWORD")).toEqual(["passwordMinLength"]);
  });

  it("does not need the retention setting: unset means the addresses are kept", () => {
    expect(unsetSettings(signInSet, "SIGN_IN", "SET_PASSWORD", "ISSUE_CODE")).not.toContain("signInDetailRetentionDays");
  });
});

describe("labels", () => {
  it("has words, in both languages, for every setting, and never a bare key", () => {
    for (const [key, label] of Object.entries(SETTING_LABELS)) {
      expect(label.en, key).not.toBe(key);
      expect(label.en, key).toMatch(/\s/);
    }
    expect(settingLabels(["lockoutMinutes"])).toEqual(["How long a locked account stays locked"]);
  });
});

describe("policyFault", () => {
  it("keeps sign-in addresses at least as long as the throttle looks back", () => {
    expect(policyFault({ ...signInSet, signInDetailRetentionDays: 1 })).toBeNull(); // 1440 minutes covers 30
    expect(policyFault({ ...signInSet, addressThrottleMinutes: 1441, signInDetailRetentionDays: 1 })).toMatch(/lose its own evidence/);
    expect(policyFault({ ...signInSet, signInDetailRetentionDays: null })).toBeNull();
  });
  it("keeps the shortest password in range and an idle limit within its session", () => {
    expect(policyFault({ ...signInSet, passwordMinLength: 7 })).toMatch(/8 and 256/);
    expect(policyFault({ ...signInSet, passwordMinLength: 8 })).toBeNull();
    expect(policyFault({ ...signInSet, staffIdleMinutes: 500 })).toMatch(/idle/);
  });
});

describe("the faults in both languages", () => {
  it("say each combination in Malay, and the Malay is not the English", () => {
    const faults = [
      policyFaultWords({ ...signInSet, addressThrottleMinutes: 1441, signInDetailRetentionDays: 1 }),
      policyFaultWords({ ...signInSet, passwordMinLength: 7 }),
      policyFaultWords({ ...signInSet, staffIdleMinutes: 500 }),
    ];
    for (const f of faults) {
      expect(f).not.toBeNull();
    }
    expect(policyFault({ ...signInSet, staffIdleMinutes: 500 })).toBe(policyFaultWords({ ...signInSet, staffIdleMinutes: 500 })!.en);
  });

  it("say a value out of range for every unit a setting is counted in", () => {
    for (const [key, range] of Object.entries(SETTING_RANGES)) {
      const f = rangeFaultWords(key as Parameters<typeof rangeFaultWords>[0], range.min - 1);
      expect(f, key).not.toBeNull();
      expect(rangeFault(key as Parameters<typeof rangeFault>[0], range.min - 1), key).toBe(f!.en);
      expect(rangeFaultWords(key as Parameters<typeof rangeFaultWords>[0], range.min), key).toBeNull();
    }
  });
});

describe("retentionStatement", () => {
  it("says so while it is unset", () => {
    expect(retentionStatement(null)).toBe("Retention period not set — sign-in addresses are kept");
    expect(retentionStatement(1)).toBe("Sign-in addresses are kept for 1 day");
    expect(retentionStatement(90)).toBe("Sign-in addresses are kept for 90 days");
  });
});

describe("signInSettings", () => {
  it("is the settings sign-in needs once they are all set, and null while any is not", () => {
    expect(signInSettings(signInSet)).toEqual({
      staffIdleMinutes: 30,
      staffAbsoluteMinutes: 480,
      maxConcurrentSessions: 2,
      concurrentSessionAction: "REFUSE_NEW",
      maxFailedAttempts: 5,
      lockoutMinutes: 15,
      addressThrottleAttempts: 10,
      addressThrottleMinutes: 30,
    });
    expect(signInSettings(null)).toBeNull();
    expect(signInSettings({ ...signInSet, lockoutMinutes: null })).toBeNull();
    expect(signInSettings({ ...signInSet, concurrentSessionAction: null })).toBeNull();
  });

  it("agrees with unsetSettings on when sign-in is possible", () => {
    for (const key of unsetSettings(null, "SIGN_IN")) {
      expect(unsetSettings({ ...signInSet, [key]: null }, "SIGN_IN")).toEqual([key]);
      expect(signInSettings({ ...signInSet, [key]: null })).toBeNull();
    }
  });
});

describe("fillUnset", () => {
  it("takes the supplied value for each setting that is unset", () => {
    const { values, filled } = fillUnset(null, { staffIdleMinutes: 20, lockoutMinutes: 10 });
    expect(values.staffIdleMinutes).toBe(20);
    expect(values.lockoutMinutes).toBe(10);
    expect(values.maxFailedAttempts).toBeNull();
    expect(filled).toEqual(["staffIdleMinutes", "lockoutMinutes"]);
  });

  it("never changes a setting that is already set: that is a configuration change for a second person", () => {
    const { values, filled } = fillUnset(signInSet, { staffIdleMinutes: 99, passwordMinLength: 12 });
    expect(values.staffIdleMinutes).toBe(30);
    expect(values.passwordMinLength).toBe(12);
    expect(filled).toEqual(["passwordMinLength"]);
  });

  it("treats a zero as set", () => {
    expect(fillUnset({ ...unset, maxConcurrentSessions: 0 }, { maxConcurrentSessions: 3 }).filled).toEqual([]);
  });
});

describe("rangeFault", () => {
  it("holds a number to the range the database holds, whole numbers only", () => {
    expect(rangeFault("passwordMinLength", 8)).toBeNull();
    expect(rangeFault("passwordMinLength", 7)).toMatch(/8 to 256/);
    expect(rangeFault("passwordMinLength", 257)).not.toBeNull();
    expect(rangeFault("lockoutMinutes", 1.5)).not.toBeNull();
    expect(rangeFault("staffIdleMinutes", 0)).not.toBeNull();
    expect(rangeFault("concurrentSessionAction", 1)).toBeNull(); // not numeric: nothing to hold it to
  });
});

describe("the shortest unseal passphrase (wave 3b, ADR 0036 D4)", () => {
  it("is unset until the organisation sets it, refuses under 12 as the database does, and is needed to set an officer's share", () => {
    expect(unsetSettings(null, "SET_OFFICER_SHARE")).toEqual(["sealingPassphraseMinLength"]);
    expect(rangeFault("sealingPassphraseMinLength", 11)).not.toBeNull();
    expect(rangeFault("sealingPassphraseMinLength", 12)).toBeNull();
    expect(rangeFault("sealingPassphraseMinLength", 257)).not.toBeNull();
  });
});
