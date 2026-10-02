import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { windowFields } from "./audit-view";

// 6.15a (flagged against accepted 6.5, new test only): the notice's special-permission offer (FR-ADV-017).
describe("the window's special-permission offer", () => {
  const base = { closingTimeReason: "", purchaseFromDay: null, purchaseCloseDay: null, inspectionPlace: "", purchasePlace: "", inspectionHours: "", feeAmount: null, feePaymentMethods: "", submissionPlace: "" };

  it("the trail words it in three states, never a bare null", () => {
    expect(windowFields({ ...base, specialPermissionOffered: true }).specialPermission).toBe("Offered");
    expect(windowFields({ ...base, specialPermissionOffered: false }).specialPermission).toBe("Not offered");
    expect(windowFields({ ...base, specialPermissionOffered: null }).specialPermission).toBe("Not stated");
  });

  it("an act that does not carry it writes nothing about it (the trail of every earlier act is unchanged)", () => {
    expect("specialPermission" in windowFields(base)).toBe(false);
  });

  it("the save reads not stated as null, never as offered", () => {
    const src = readFileSync("src/app/sourcing/[id]/window/actions.ts", "utf8");
    expect(src).toMatch(/const specialPermissionOffered = offer === "yes" \? true : offer === "no" \? false : null;/);
  });
});
