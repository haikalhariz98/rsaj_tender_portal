import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { randomId } from "@/lib/test-db/auth-fixtures";

import { SETTING_RANGES } from "./policy";
import type { SecurityPolicyKey } from "./types";

/// The ranges the code says in words are the ranges the database holds: the two cannot drift apart without this failing.
let organisationId: string;
beforeAll(async () => {
  organisationId = (await db.organisation.create({ data: { code: `POL_${randomId()}`, name: "Policy range test" } })).id;
});

const write = (data: Record<string, unknown>) => db.securityPolicy.upsert({ where: { organisationId }, create: { organisationId, ...data }, update: data });

describe("SecurityPolicy ranges", () => {
  for (const [key, range] of Object.entries(SETTING_RANGES) as [SecurityPolicyKey, { min: number; max: number }][]) {
    it(`${key}: accepts ${range.min} and ${range.max}, refuses either side`, async () => {
      // The pairs that must agree with one another are kept clear of each other.
      const clear = { staffIdleMinutes: null, staffAbsoluteMinutes: null, supplierIdleMinutes: null, supplierAbsoluteMinutes: null, addressThrottleMinutes: null, signInDetailRetentionDays: null };
      await expect(write({ ...clear, [key]: range.min })).resolves.toBeTruthy();
      await expect(write({ ...clear, [key]: range.max })).resolves.toBeTruthy();
      await expect(write({ ...clear, [key]: range.min - 1 })).rejects.toThrow();
      await expect(write({ ...clear, [key]: range.max + 1 })).rejects.toThrow();
    });
  }

  it("keeps an idle limit within its absolute limit, and sign-in addresses at least as long as the throttle looks back", async () => {
    await expect(write({ staffIdleMinutes: 61, staffAbsoluteMinutes: 60 })).rejects.toThrow();
    await expect(write({ staffIdleMinutes: 60, staffAbsoluteMinutes: 60 })).resolves.toBeTruthy();
    await expect(write({ addressThrottleMinutes: 1441, signInDetailRetentionDays: 1 })).rejects.toThrow();
    await expect(write({ addressThrottleMinutes: 1440, signInDetailRetentionDays: 1 })).resolves.toBeTruthy();
  });
});
