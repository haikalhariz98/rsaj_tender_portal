import { describe, expect, it } from "vitest";

import { applicantDownloadRefusal, asksBeforeOpening } from "./applicant-scan";

describe("a file sent by someone not signed in, opened by staff (RSEC-2)", () => {
  it("is refused on a threat, stored or found now, and on a failed scan", () => {
    expect(applicantDownloadRefusal({ stored: "THREAT", fresh: "CLEAN", scannerConfigured: true, confirmed: true })).toBe("THREAT");
    expect(applicantDownloadRefusal({ stored: "NOT_SCANNED", fresh: "THREAT", scannerConfigured: true, confirmed: true })).toBe("THREAT");
    expect(applicantDownloadRefusal({ stored: "NOT_SCANNED", fresh: "ERROR", scannerConfigured: true, confirmed: true })).toBe("SCAN_ERROR");
  });
  it("once a scanner is configured, is refused unless it checked the file", () => {
    expect(applicantDownloadRefusal({ stored: "NOT_SCANNED", fresh: "NOT_SCANNED", scannerConfigured: true, confirmed: true })).toBe("NOT_SCANNED");
    expect(applicantDownloadRefusal({ stored: "NOT_SCANNED", fresh: "CLEAN", scannerConfigured: true, confirmed: false })).toBeNull();
  });
  it("with no scanner, is served only once the question is answered", () => {
    expect(applicantDownloadRefusal({ stored: "NOT_SCANNED", fresh: "NOT_SCANNED", scannerConfigured: false, confirmed: false })).toBe("UNCONFIRMED");
    expect(applicantDownloadRefusal({ stored: "NOT_SCANNED", fresh: "NOT_SCANNED", scannerConfigured: false, confirmed: true })).toBeNull();
    expect(asksBeforeOpening({ recordedByPortalApplicationId: "pa-1" }, false)).toBe(true);
    expect(asksBeforeOpening({ recordedByPortalApplicationId: "pa-1" }, true)).toBe(false);
    expect(asksBeforeOpening({ recordedByPortalApplicationId: null }, false)).toBe(false);
  });
});
