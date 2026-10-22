import { describe, expect, it } from "vitest";

import { HONEYPOT_FIELD, honeypotTripped, portalApplicationFaults, portalCapacity, portalRefusal, PORTAL_FIELD_OF, validLimit, whatIsMissing, type PortalApplicationContext, type RegisterReadiness, type PortalApplicationInput } from "./apply";
import { APPLY } from "./labels";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

const good: PortalApplicationInput = {
  registeredName: "Sampel Works Sdn Bhd",
  registrationNo: "202001000123",
  entityTypeCode: "sdn_bhd",
  countryCode: "my",
  address: { addressLine1: "1 Jalan Contoh", addressLine2: "", city: "Kuala Lumpur", postcode: "50000", stateCode: "kl" },
  bumiputeraClaimCode: null,
  incorporatedOn: "2015-03-02",
  companyEmail: "office@sampel.example",
  contact: { name: "Aini", designation: "", email: "aini@sampel.example", phone: "" },
};
const ctx: PortalApplicationContext = {
  today: "2026-10-06",
  formatPattern: null,
  entityTypeCodes: ["sdn_bhd"],
  countryCodes: ["my"],
  stateCodes: ["kl"],
  bumiputeraCodes: ["declared_yes"],
  contactNeedsEmailAndPhone: null,
};

const blocks = (i: PortalApplicationInput, c: PortalApplicationContext = ctx) => portalApplicationFaults(i, c).filter((f) => f.level === "block").map((f) => f.code);

describe("a public registration application", () => {
  it("passes with the identity and a contact, and asks for no receipt, channel or recorder", () => {
    expect(portalApplicationFaults(good, ctx)).toEqual([expect.objectContaining({ code: "FORMAT_NOT_CHECKED", level: "warn" })]);
    expect(portalRefusal(portalApplicationFaults(good, ctx))).toBeNull();
    const all = portalApplicationFaults({ ...good, registeredName: "" }, ctx).map((f) => f.code);
    for (const receipt of ["RECEIVED_ON_REQUIRED", "CHANNEL_REQUIRED", "RECORDER_REQUIRED", "DECLARATION_IN_FUTURE"]) expect(all).not.toContain(receipt);
    // The address is judged by its parts alone: the identity rule's own "address required" is never added to theirs.
    expect(portalApplicationFaults({ ...good, address: { ...good.address, addressLine1: "", city: "", postcode: "" } }, ctx).map((f) => f.code)).not.toContain("ADDRESS_REQUIRED");
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
    expect(portalRefusal(portalApplicationFaults(good, { ...ctx, stateCodes: [] }))).toEqual({ closed: true });
  });

  it("an empty list of Bumiputera statuses asks nothing and blocks nothing", () => {
    expect(blocks(good, { ...ctx, bumiputeraCodes: [] })).toEqual([]);
    expect(blocks({ ...good, bumiputeraClaimCode: "declared_yes" })).toEqual([]);
    expect(blocks({ ...good, bumiputeraClaimCode: "made_up" })).toEqual(["BUMIPUTERA_NOT_LISTED"]);
  });

  it("the date incorporated is required, a real day, and not after the day it is sent", () => {
    expect(blocks({ ...good, incorporatedOn: null })).toEqual(["INCORPORATED_ON_REQUIRED"]);
    expect(blocks({ ...good, incorporatedOn: "2026-10-07" })).toEqual(["INCORPORATED_IN_FUTURE"]);
    expect(blocks({ ...good, incorporatedOn: "2026-10-06" })).toEqual([]);
    expect(blocks({ ...good, incorporatedOn: "2026-02-31" })).toEqual(["INCORPORATED_ON_NOT_A_DAY"]);
  });

  it("the contact rule is the customer's: unset keeps an email or a telephone, true asks for both", () => {
    const emailOnly = { ...good, contact: { ...good.contact, email: "aini@sampel.example", phone: "" } };
    const phoneOnly = { ...good, contact: { ...good.contact, email: "", phone: "+60 12 345 6789" } };
    expect(blocks(emailOnly)).toEqual([]);
    expect(blocks(phoneOnly)).toEqual([]);
    expect(blocks(emailOnly, { ...ctx, contactNeedsEmailAndPhone: false })).toEqual([]);
    expect(blocks(emailOnly, { ...ctx, contactNeedsEmailAndPhone: true })).toEqual(["CONTACT_PHONE_REQUIRED"]);
    expect(blocks(phoneOnly, { ...ctx, contactNeedsEmailAndPhone: true })).toEqual(["CONTACT_EMAIL_REQUIRED"]);
    expect(blocks({ ...good, contact: { ...good.contact, email: "", phone: "" } }, { ...ctx, contactNeedsEmailAndPhone: true })).toEqual(["CONTACT_EMAIL_REQUIRED", "CONTACT_PHONE_REQUIRED"]);
    expect(blocks({ ...good, contact: { ...good.contact, email: "", phone: "" } })).toEqual(["CONTACT_REACH_REQUIRED"]);
  });

  it("every fault an applicant can meet has plain words and a field, in both languages", () => {
    const met = new Set<string>();
    const tries: [PortalApplicationInput, Partial<PortalApplicationContext>][] = [
      [{ ...good, registeredName: "", registrationNo: "", entityTypeCode: null, countryCode: null, address: { addressLine1: "", addressLine2: "", city: "", postcode: "", stateCode: null }, incorporatedOn: null, companyEmail: "", contact: { name: "", designation: "", email: "", phone: "" } }, {}],
      [{ ...good, address: { ...good.address, stateCode: "elsewhere" }, bumiputeraClaimCode: "made_up", incorporatedOn: "2026-02-31" }, {}],
      [{ ...good, incorporatedOn: "2099-01-01" }, {}],
      [{ ...good, contact: { name: "Aini", designation: "", email: "", phone: "" } }, { contactNeedsEmailAndPhone: true }],
      [{ ...good, companyEmail: "nope", contact: { ...good.contact, email: "nope" } }, {}],
      [{ ...good, entityTypeCode: "elsewhere", countryCode: "elsewhere" }, {}],
      [{ ...good, registrationNo: "ABC" }, { formatPattern: "^\\d{12}$" }],
    ];
    // The reach faults need the contact rule both ways: the first try has neither an email nor a telephone and no rule, so it meets CONTACT_REACH_REQUIRED.
    for (const [i, c] of tries) for (const f of portalApplicationFaults(i, { ...ctx, ...c })) if (f.level === "block") met.add(f.code);
    for (const f of portalApplicationFaults({ ...good, contact: { name: "Aini", designation: "", email: "", phone: "" } }, { ...ctx, contactNeedsEmailAndPhone: true })) if (f.level === "block") met.add(f.code);
    for (const f of portalApplicationFaults({ ...good, contact: { name: "Aini", designation: "", email: "x@y.example", phone: "" } }, { ...ctx, contactNeedsEmailAndPhone: true })) if (f.level === "block") met.add(f.code);
    expect([...met].sort()).toEqual(
      [
        "ADDRESS_LINE_REQUIRED",
        "BUMIPUTERA_NOT_LISTED",
        "CITY_REQUIRED",
        "CONTACT_EMAIL_NOT_VALID",
        "CONTACT_EMAIL_REQUIRED",
        "CONTACT_NAME_REQUIRED",
        "CONTACT_PHONE_REQUIRED",
        "CONTACT_REACH_REQUIRED",
        "COUNTRY_NOT_LISTED",
        "COUNTRY_REQUIRED",
        "EMAIL_NOT_VALID",
        "EMAIL_REQUIRED",
        "ENTITY_TYPE_NOT_LISTED",
        "ENTITY_TYPE_REQUIRED",
        "FORMAT_MISMATCH",
        "INCORPORATED_IN_FUTURE",
        "INCORPORATED_ON_NOT_A_DAY",
        "INCORPORATED_ON_REQUIRED",
        "NAME_REQUIRED",
        "POSTCODE_REQUIRED",
        "REGISTRATION_NO_REQUIRED",
        "ADDRESS_STATE_NOT_LISTED",
        "ADDRESS_STATE_REQUIRED",
      ].sort(),
    );
    for (const code of met) {
      expect(PORTAL_FIELD_OF[code as keyof typeof PORTAL_FIELD_OF], code).toBeTruthy();
      const words = (APPLY.faults as Record<string, { en: string;  }>)[code];
      expect(words?.en, code).toBeTruthy();
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
    expect(Object.keys(ctx).sort()).toEqual(["bumiputeraCodes", "contactNeedsEmailAndPhone", "countryCodes", "entityTypeCodes", "formatPattern", "stateCodes", "today"]);
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
  it("is not named for a field a person is asked to fill (Phase 4a: a real Fax field is coming)", () => {
    expect(HONEYPOT_FIELD).not.toBe("faxNumber");
    expect(HONEYPOT_FIELD).not.toMatch(/fax|phone|tel|email|name|address/i);
  });
  it("trips on anything typed, not on nothing", () => {
    expect(honeypotTripped("http://spam.example")).toBe(true);
    expect(honeypotTripped("  x ")).toBe(true);
    expect(honeypotTripped("")).toBe(false);
    expect(honeypotTripped("   ")).toBe(false);
    expect(honeypotTripped(null)).toBe(false);
  });
});

describe("what the register lacks (plan section 5, RSEC-1 and audit M1: each of the 24 named)", () => {
  const ready: RegisterReadiness = {
    today: "2026-10-06",
    entityTypeCodes: ["a"],
    countryCodes: ["b"],
    stateCodes: ["c"],
    numberingReady: true,
    noticeSet: true,
    termsTextSet: true,
    falseDeclarationTextSet: true,
    giroTextSet: true,
    verificationNoticeSet: true,
    documentTypesSet: true,
    banksSet: true,
    accountTypesSet: true,
    storeRulesSet: true,
    ceilingSet: true,
    documentClassSet: true,
    statementClassSet: true,
    quotasSet: true,
    limitsSet: true,
    onlineDeclarationAccepted: true,
    storeDriverSet: true,
    formKeySet: true,
    addressLimitSet: true,
    bodyCapSet: true,
  };
  const nothing: RegisterReadiness = Object.fromEntries(Object.entries(ready).map(([k, v]) => [k, Array.isArray(v) ? [] : typeof v === "boolean" ? false : null])) as unknown as RegisterReadiness;

  it("is empty when everything is set", () => {
    expect(whatIsMissing(ready)).toEqual([]);
  });

  it("names all 24 in the order a person would set them, in plain words", () => {
    const missing = whatIsMissing(nothing);
    expect(missing).toHaveLength(24);
    expect(missing).toEqual([
      APPLY.missing.timeZone, APPLY.missing.entityTypes, APPLY.missing.countries, APPLY.missing.states, APPLY.missing.numbering, APPLY.missing.notice, APPLY.missing.termsText,
      APPLY.missing.falseDeclarationText, APPLY.missing.giroText, APPLY.missing.verificationNotice, APPLY.missing.documentTypes, APPLY.missing.banks, APPLY.missing.accountTypes,
      APPLY.missing.storeRules, APPLY.missing.ceiling, APPLY.missing.documentClass, APPLY.missing.statementClass, APPLY.missing.quotas, APPLY.missing.limits,
      APPLY.missing.addressLimit, APPLY.missing.onlineDeclaration, APPLY.missing.storeDriver, APPLY.missing.formKey, APPLY.missing.bodyCap,
    ]);
    expect(new Set(missing.map((m) => m.en)).size).toBe(24);
    for (const m of missing) expect(m.en).not.toMatch(/Configuration|[A-Z]{2,}_|[a-z][A-Z]/);
  });

  it.each([
    ["the time zone", { today: null }, "timeZone"],
    ["the entity types", { entityTypeCodes: [] }, "entityTypes"],
    ["the countries", { countryCodes: [] }, "countries"],
    ["the states", { stateCodes: [] }, "states"],
    ["the numbering", { numberingReady: false }, "numbering"],
    ["the Personal Data Notice", { noticeSet: false }, "notice"],
    ["the Terms and Conditions text", { termsTextSet: false }, "termsText"],
    ["the false-declaration text", { falseDeclarationTextSet: false }, "falseDeclarationText"],
    ["the GIRO text", { giroTextSet: false }, "giroText"],
    ["the verification notice", { verificationNoticeSet: false }, "verificationNotice"],
    ["a live document type", { documentTypesSet: false }, "documentTypes"],
    ["the banks", { banksSet: false }, "banks"],
    ["the account types", { accountTypesSet: false }, "accountTypes"],
    ["the store's file types and size", { storeRulesSet: false }, "storeRules"],
    ["the deployment ceiling", { ceilingSet: false }, "ceiling"],
    ["the class for certificates", { documentClassSet: false }, "documentClass"],
    ["a SULIT class for bank statements", { statementClassSet: false }, "statementClass"],
    ["the file and byte quotas", { quotasSet: false }, "quotas"],
    ["the daily and per-number limits", { limitsSet: false }, "limits"],
    ["the online declaration accepted in place of paper (O-8)", { onlineDeclarationAccepted: false }, "onlineDeclaration"],
    ["the document store driver", { storeDriverSet: false }, "storeDriver"],
    ["the form key", { formKeySet: false }, "formKey"],
    ["the per-address limit (RSEC-1)", { addressLimitSet: false }, "addressLimit"],
    ["the deployment's cap on one application (security audit M1)", { bodyCapSet: false }, "bodyCap"],
  ] as const)("keeps the register closed until %s is set, and names only that", (_name, unset, key) => {
    expect(whatIsMissing({ ...ready, ...unset } as RegisterReadiness)).toEqual([APPLY.missing[key]]);
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
