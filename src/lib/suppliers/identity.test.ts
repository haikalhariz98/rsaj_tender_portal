import { describe, expect, it } from "vitest";

import { applicationFaults, contactFaults, identityFaults, normaliseRegistrationNo, receiptFaults, type ApplicationInput, type IdentityContext } from "./identity";

const ok: ApplicationInput = {
  registeredName: "Syarikat Contoh Sdn Bhd",
  registrationNo: "201901012345",
  entityTypeCode: "sdn_bhd",
  countryCode: "MY",
  registeredAddress: "1 Jalan Contoh, 80000 Johor Bahru",
  companyEmail: "tender@contoh.example",
  contact: { name: "Aminah Binti Ali", designation: "Director", email: "aminah@contoh.example", phone: "" },
  receivedOn: "2026-09-30",
  channel: "COUNTER",
  declarationSignedOn: "2026-09-29",
  recorderActive: true,
};
const ctx: IdentityContext = { today: "2026-10-01", formatPattern: "\\d{12}", entityTypeCodes: ["sdn_bhd", "enterprise"], countryCodes: ["MY"], duplicate: null };
const codes = (fs: { code: string; level: string }[], level?: string) => fs.filter((f) => !level || f.level === level).map((f) => f.code);

describe("recording a paper application (FR-VND-001)", () => {
  it("a complete application in the configured format records with nothing to say", () => {
    expect(applicationFaults(ok, ctx)).toEqual([]);
  });

  it.each([
    ["registeredName", "NAME_REQUIRED"],
    ["registrationNo", "REGISTRATION_NO_REQUIRED"],
    ["registeredAddress", "ADDRESS_REQUIRED"],
    ["companyEmail", "EMAIL_REQUIRED"],
  ] as const)("each mandatory field left empty is named: %s", (field, code) => {
    expect(codes(applicationFaults({ ...ok, [field]: "  " }, ctx), "block")).toEqual([code]);
  });

  it("an address taken in parts is judged by them: the single text is not asked for as well (Phase 4a)", () => {
    expect(codes(identityFaults({ ...ok, registeredAddress: "" }, { ...ctx, addressJudgedByParts: true }))).toEqual([]);
    expect(codes(identityFaults({ ...ok, registeredAddress: "" }, ctx))).toEqual(["ADDRESS_REQUIRED"]);
  });

  it("the entity type and the country must be chosen from the lists in force", () => {
    expect(codes(identityFaults({ ...ok, entityTypeCode: null }, ctx))).toEqual(["ENTITY_TYPE_REQUIRED"]);
    expect(codes(identityFaults({ ...ok, entityTypeCode: "llp" }, ctx))).toEqual(["ENTITY_TYPE_NOT_LISTED"]);
    expect(codes(identityFaults({ ...ok, countryCode: null }, ctx))).toEqual(["COUNTRY_REQUIRED"]);
    expect(codes(identityFaults({ ...ok, countryCode: "SG" }, ctx))).toEqual(["COUNTRY_NOT_LISTED"]);
  });

  it("an unset list blocks, naming the list (unset is not 'anything goes')", () => {
    expect(codes(identityFaults(ok, { ...ctx, entityTypeCodes: [] }))).toEqual(["ENTITY_TYPES_NOT_SET"]);
    expect(codes(identityFaults(ok, { ...ctx, countryCodes: [] }))).toEqual(["COUNTRIES_NOT_SET"]);
  });

  it("a number that does not match the configured format is refused", () => {
    const fs = identityFaults({ ...ok, registrationNo: "1234567-A" }, ctx);
    expect(fs).toEqual([{ code: "FORMAT_MISMATCH", level: "block", data: { number: "1234567-A" } }]);
  });

  it("with no format set, the number is 'format not checked' — a warning, never a pass", () => {
    const fs = identityFaults({ ...ok, registrationNo: "anything at all" }, { ...ctx, formatPattern: null });
    expect(fs).toEqual([{ code: "FORMAT_NOT_CHECKED", level: "warn" }]);
  });

  it("a pattern that is not a valid expression is not a pass either", () => {
    expect(codes(identityFaults(ok, { ...ctx, formatPattern: "([" }), "warn")).toEqual(["FORMAT_NOT_CHECKED"]);
  });

  it("a number already on the register is refused, naming the supplier holding it", () => {
    const fs = identityFaults(ok, { ...ctx, duplicate: { reference: "SUP/0001", name: "Another Sdn Bhd" } });
    expect(fs).toEqual([{ code: "DUPLICATE", level: "block", data: { number: "201901012345", reference: "SUP/0001", name: "Another Sdn Bhd" } }]);
  });

  it("duplicates are compared with spaces collapsed and letters in capitals", () => {
    expect(normaliseRegistrationNo("  1234567-a ")).toBe(normaliseRegistrationNo("1234567-A"));
    expect(normaliseRegistrationNo("AB  12")).toBe("AB 12");
  });

  it("a malformed company email is refused", () => {
    expect(codes(identityFaults({ ...ok, companyEmail: "tender at contoh" }, ctx))).toEqual(["EMAIL_NOT_VALID"]);
  });
});

describe("the primary contact (FR-VND-001; a SupplierContact, never a Person)", () => {
  it("needs a name and a way to reach them", () => {
    expect(codes(contactFaults({ name: "", designation: "", email: "", phone: "" }))).toEqual(["CONTACT_NAME_REQUIRED", "CONTACT_REACH_REQUIRED"]);
    expect(contactFaults({ name: "A", designation: "", email: "", phone: "07-1234567" })).toEqual([]);
    expect(codes(contactFaults({ name: "A", designation: "", email: "a@", phone: "" }))).toEqual(["CONTACT_EMAIL_NOT_VALID"]);
    // Phase 4a: the switch is the customer's. Not set (null) and false keep "an email or a telephone", true asks for both.
    const emailOnly = { name: "A", designation: "", email: "a@b.example", phone: "" };
    const phoneOnly = { name: "A", designation: "", email: "", phone: "07-1234567" };
    for (const rule of [null, false] as const) {
      expect(contactFaults(emailOnly, rule)).toEqual([]);
      expect(contactFaults(phoneOnly, rule)).toEqual([]);
    }
    expect(codes(contactFaults(emailOnly, true))).toEqual(["CONTACT_PHONE_REQUIRED"]);
    expect(codes(contactFaults(phoneOnly, true))).toEqual(["CONTACT_EMAIL_REQUIRED"]);
    expect(codes(contactFaults({ ...emailOnly, phone: "07-1234567" }, true))).toEqual([]);
    expect(codes(contactFaults({ name: "", designation: "", email: "", phone: "" }, true))).toEqual(["CONTACT_NAME_REQUIRED", "CONTACT_EMAIL_REQUIRED", "CONTACT_PHONE_REQUIRED"]);
  });
});

describe("the receipt", () => {
  it("is refused with no organisation day (an unset zone is not UTC)", () => {
    expect(codes(receiptFaults(ok, null))).toEqual(["TIME_ZONE_UNSET"]);
  });

  it("received today is allowed; tomorrow is not", () => {
    expect(receiptFaults({ ...ok, receivedOn: "2026-10-01" }, "2026-10-01")).toEqual([]);
    expect(codes(receiptFaults({ ...ok, receivedOn: "2026-10-02", declarationSignedOn: null }, "2026-10-01"))).toEqual(["RECEIVED_IN_FUTURE"]);
  });

  it("the declaration is signed on or before the day received, never after it", () => {
    expect(receiptFaults({ ...ok, declarationSignedOn: "2026-09-30" }, "2026-10-01")).toEqual([]);
    expect(codes(receiptFaults({ ...ok, receivedOn: "2026-09-29", declarationSignedOn: "2026-09-30" }, "2026-10-01"))).toEqual(["DECLARATION_AFTER_RECEIPT"]);
  });

  it("names the channel and an active recording officer", () => {
    expect(codes(receiptFaults({ ...ok, channel: null, recorderActive: false }, "2026-10-01"))).toEqual(["CHANNEL_REQUIRED", "RECORDER_REQUIRED"]);
  });

  it("an impossible received day is not a day", () => {
    expect(codes(receiptFaults({ ...ok, receivedOn: "2026-02-30", declarationSignedOn: null }, "2026-10-01"))).toEqual(["RECEIVED_ON_REQUIRED"]);
  });
});
