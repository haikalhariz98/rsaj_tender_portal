import { describe, expect, it } from "vitest";

import { honeypotTripped, portalApplicationFaults, portalCapacity, portalRefusal, PORTAL_FIELD_OF, validLimit, whatIsMissing, type PortalApplicationContext, type PortalApplicationInput } from "./apply";
import { APPLY } from "./labels";

const good: PortalApplicationInput = {
  registeredName: "Sampel Works Sdn Bhd",
  registrationNo: "202001000123",
  entityTypeCode: "sdn_bhd",
  countryCode: "my",
  registeredAddress: "1 Jalan Contoh, 50000 Kuala Lumpur",
  companyEmail: "office@sampel.example",
  contact: { name: "Aini", designation: "", email: "aini@sampel.example", phone: "" },
};
const ctx: PortalApplicationContext = { today: "2026-10-06", formatPattern: null, entityTypeCodes: ["sdn_bhd"], countryCodes: ["my"] };

const blocks = (i: PortalApplicationInput, c: PortalApplicationContext = ctx) => portalApplicationFaults(i, c).filter((f) => f.level === "block").map((f) => f.code);

describe("a public registration application", () => {
  it("passes with the identity and a contact, and asks for no receipt, channel or recorder", () => {
    expect(portalApplicationFaults(good, ctx)).toEqual([expect.objectContaining({ code: "FORMAT_NOT_CHECKED", level: "warn" })]);
    expect(portalRefusal(portalApplicationFaults(good, ctx))).toBeNull();
    const all = portalApplicationFaults({ ...good, registeredName: "" }, ctx).map((f) => f.code);
    for (const receipt of ["RECEIVED_ON_REQUIRED", "CHANNEL_REQUIRED", "RECORDER_REQUIRED", "DECLARATION_IN_FUTURE"]) expect(all).not.toContain(receipt);
  });

  it("an unchecked format never blocks, and a wrong one does", () => {
    expect(blocks(good)).toEqual([]);
    expect(blocks(good, { ...ctx, formatPattern: "^\\d{12}$" })).toEqual([]);
    expect(blocks({ ...good, registrationNo: "ABC" }, { ...ctx, formatPattern: "^\\d{12}$" })).toEqual(["FORMAT_MISMATCH"]);
  });

  it("an unset time zone blocks and closes the form", () => {
    const fs = portalApplicationFaults(good, { ...ctx, today: null });
    expect(fs.map((f) => f.code)).toEqual(["TIME_ZONE_UNSET"]);
    expect(portalRefusal(fs)).toEqual({ closed: true });
  });

  it("an unset list closes the form rather than blaming the applicant", () => {
    expect(portalRefusal(portalApplicationFaults(good, { ...ctx, entityTypeCodes: [] }))).toEqual({ closed: true });
    expect(portalRefusal(portalApplicationFaults(good, { ...ctx, countryCodes: [] }))).toEqual({ closed: true });
  });

  it("every fault an applicant can meet has plain words and a field, in both languages", () => {
    const met = new Set<string>();
    const tries: [PortalApplicationInput, Partial<PortalApplicationContext>][] = [
      [{ ...good, registeredName: "", registrationNo: "", entityTypeCode: null, countryCode: null, registeredAddress: "", companyEmail: "", contact: { name: "", designation: "", email: "", phone: "" } }, {}],
      [{ ...good, companyEmail: "nope", contact: { ...good.contact, email: "nope" } }, {}],
      [{ ...good, entityTypeCode: "elsewhere", countryCode: "elsewhere" }, {}],
      [{ ...good, registrationNo: "ABC" }, { formatPattern: "^\\d{12}$" }],
    ];
    for (const [i, c] of tries) for (const f of portalApplicationFaults(i, { ...ctx, ...c })) if (f.level === "block") met.add(f.code);
    expect([...met].sort()).toEqual(
      ["ADDRESS_REQUIRED", "CONTACT_EMAIL_NOT_VALID", "CONTACT_NAME_REQUIRED", "CONTACT_REACH_REQUIRED", "COUNTRY_NOT_LISTED", "COUNTRY_REQUIRED", "EMAIL_NOT_VALID", "EMAIL_REQUIRED", "ENTITY_TYPE_NOT_LISTED", "ENTITY_TYPE_REQUIRED", "FORMAT_MISMATCH", "NAME_REQUIRED", "REGISTRATION_NO_REQUIRED"].sort(),
    );
    for (const code of met) {
      expect(PORTAL_FIELD_OF[code as keyof typeof PORTAL_FIELD_OF], code).toBeTruthy();
      const words = (APPLY.faults as Record<string, { en: string; ms: string }>)[code];
      expect(words?.en, code).toBeTruthy();
      expect(words?.ms, code).toBeTruthy();
    }
  });

  it("never asks whether the number is on the register, so the form cannot be used to find out who is registered", () => {
    const fs = portalApplicationFaults(good, ctx);
    expect(fs.map((f) => f.code)).not.toContain("DUPLICATE");
    expect(Object.values(PORTAL_FIELD_OF)).toBeTruthy();
    expect(PORTAL_FIELD_OF).not.toHaveProperty("DUPLICATE");
    expect(APPLY.faults).not.toHaveProperty("DUPLICATE");
    // The one signature that decides the outcome has no place to pass the register in.
    expect(portalApplicationFaults.length).toBe(2);
    expect(Object.keys(ctx).sort()).toEqual(["countryCodes", "entityTypeCodes", "formatPattern", "today"]);
  });

  it("a blocking fault with no field to mark is still said, in a message of its own", () => {
    const r = portalRefusal([{ code: "SOMETHING_NEW" as never, level: "block" }]);
    expect(r).toEqual({ closed: false, errors: {}, message: APPLY.cantAccept.en });
    const placed = portalRefusal([{ code: "NAME_REQUIRED", level: "block" }]);
    expect(placed && !placed.closed && placed.message).toBe(APPLY.nothingSent.en);
  });

  it("one plain sentence per field, never a code", () => {
    const r = portalRefusal(portalApplicationFaults({ ...good, registeredName: " ", companyEmail: "x", contact: { name: "", designation: "", email: "", phone: "" } }, ctx));
    expect(r && !r.closed && Object.keys(r.errors).sort()).toEqual(["companyEmail", "contactEmail", "contactName", "registeredName"]);
    for (const text of Object.values(r && !r.closed ? r.errors : {})) expect(text).not.toMatch(/\b[A-Z]{2,}_[A-Z_]+\b/);
  });
});

describe("the bait field", () => {
  it("trips on anything typed, not on nothing", () => {
    expect(honeypotTripped("http://spam.example")).toBe(true);
    expect(honeypotTripped("  x ")).toBe(true);
    expect(honeypotTripped("")).toBe(false);
    expect(honeypotTripped("   ")).toBe(false);
    expect(honeypotTripped(null)).toBe(false);
  });
});

describe("what the register lacks", () => {
  const ready = { today: "2026-10-06", entityTypeCodes: ["a"], countryCodes: ["b"], numberingReady: true, noticeSet: true, limitsSet: true };
  it("is empty when it is ready, and names each missing piece in plain words", () => {
    expect(whatIsMissing(ready)).toEqual([]);
    const missing = whatIsMissing({ today: null, entityTypeCodes: [], countryCodes: [], numberingReady: false, noticeSet: false, limitsSet: false });
    expect(missing).toHaveLength(6);
    for (const m of missing) expect(m.en).not.toMatch(/Configuration|[A-Z]{2,}_/);
  });
  it("keeps the form closed until the notice about personal details and the limits are set", () => {
    expect(whatIsMissing({ ...ready, noticeSet: false })).toEqual([APPLY.missing.notice]);
    expect(whatIsMissing({ ...ready, limitsSet: false })).toEqual([APPLY.missing.limits]);
  });
});

describe("how many the form takes", () => {
  const limits = { daily: 50, perNumber: 3 };
  it("a limit not set means closed, never unlimited", () => {
    expect(portalCapacity({ lastDay: 0, forNumber: 0 }, { daily: null, perNumber: 3 })).toBe("NOT_SET");
    expect(portalCapacity({ lastDay: 0, forNumber: 0 }, { daily: 50, perNumber: null })).toBe("NOT_SET");
    expect(portalCapacity({ lastDay: 0, forNumber: 0 }, { daily: null, perNumber: null })).toBe("NOT_SET");
  });
  it("takes one more while under both limits, and stops at either", () => {
    expect(portalCapacity({ lastDay: 49, forNumber: 2 }, limits)).toBe("OPEN");
    expect(portalCapacity({ lastDay: 50, forNumber: 0 }, limits)).toBe("BUSY");
    expect(portalCapacity({ lastDay: 10, forNumber: 3 }, limits)).toBe("BUSY");
  });
  it("a limit is a whole number of at least one", () => {
    expect([0, -1, 1.5, Number.NaN, 100_001].map(validLimit)).toEqual([false, false, false, false, false]);
    expect([1, 50, 100_000].map(validLimit)).toEqual([true, true, true]);
  });
});
