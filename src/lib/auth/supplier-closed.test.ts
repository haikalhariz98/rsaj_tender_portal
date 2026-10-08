import { describe, expect, it } from "vitest";

import { supplierClosedReason } from "./supplier-closed";

const open = { publicCopy: true, organisationSet: true, unset: [], formKeySet: true } as const;

describe("why a supplier cannot sign in yet", () => {
  it("says nothing when everything is set", () => {
    expect(supplierClosedReason(open)).toBeNull();
  });

  it("says the staff copy does not sign suppliers in, first of all", () => {
    expect(supplierClosedReason({ ...open, publicCopy: false, unset: ["supplierIdleMinutes"] })?.title).toBe("Supplier sign-in is on the public portal");
  });

  it("names a missing organisation, then the form key, then each unset setting in words", () => {
    expect(supplierClosedReason({ ...open, organisationSet: false })?.title).toBe("Not set up");
    expect(supplierClosedReason({ ...open, formKeySet: false })?.title).toBe("The portal's forms are closed");
    const unset = supplierClosedReason({ ...open, unset: ["supplierIdleMinutes", "supplierAbsoluteMinutes", "passwordMinLength"] });
    expect(unset?.body).toContain("Supplier idle time before a session ends");
    expect(unset?.body).toContain("Shortest password");
    // Words, never the keys.
    expect(unset?.body).not.toMatch(/supplierIdleMinutes|passwordMinLength/);
  });
});
