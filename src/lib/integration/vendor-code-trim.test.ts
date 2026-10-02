import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { FormReader } from "@/lib/validate";

import { manualVendorMaster, normaliseVendorCode } from "./vendor-master";

/**
 * 6.15a fix R-11: the finance system's vendor code is trimmed once, at the boundary, and that one value is
 * checked, looked up for a duplicate and stored. (The form reader already trimmed; the action no longer
 * relies on it.)
 */

describe("the vendor code is one normalised value (fix R-11)", () => {
  it("surrounding spaces are not part of the code", () => {
    expect(normaliseVendorCode("  V-000123 \t")).toBe("V-000123");
    expect(normaliseVendorCode("V 1")).toBe("V 1");
    expect(normaliseVendorCode("   ")).toBe("");
  });

  it("checked as stored: a padded code passes the format the bare code passes, and blank is required", () => {
    const ctx = { pattern: "^V-\\d{6}$", taken: false, registered: true };
    expect(manualVendorMaster.check(normaliseVendorCode(" V-000123 "), ctx)).toEqual([]);
    expect(manualVendorMaster.check(normaliseVendorCode("  "), ctx)).toEqual(["CODE_REQUIRED"]);
  });

  it("the form reader hands the action a trimmed value too", () => {
    const f = new FormData();
    f.set("erpVendorCode", "  V-000123  ");
    expect(new FormReader(f).text("erpVendorCode", "Vendor code")).toBe("V-000123");
  });

  it("the action normalises before the check, the duplicate lookup and the write (source)", () => {
    const text = readFileSync("src/app/suppliers/actions.ts", "utf8");
    const body = text.slice(text.indexOf("export async function setErpVendorCode"));
    expect(body).toMatch(/const code = normaliseVendorCode\(r\.text\("erpVendorCode"/);
    expect(body).toMatch(/erpVendorCode: code, NOT: \{ id: supplierId \}/);
    expect(body).toMatch(/data: \{ erpVendorCode: code, erpSyncedAt: now \}/);
  });
});
