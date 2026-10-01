import { describe, expect, it } from "vitest";

import { detailsFaults, displayName, normaliseDetails } from "./details";

const ok = { name: "Syarikat Contoh Sdn. Bhd." };

describe("organisation details", () => {
  it("needs only a legal name", () => {
    expect(detailsFaults(ok)).toEqual({});
    expect(detailsFaults({})).toEqual({ name: "Enter the legal name." });
    expect(detailsFaults({ name: "   " })).toEqual({ name: "Enter the legal name." });
    expect(detailsFaults({ name: "AB" }).name).toMatch(/at least 3/);
    expect(detailsFaults({ name: "x".repeat(161) }).name).toMatch(/at most 160/);
    expect(detailsFaults({ name: "x".repeat(160) })).toEqual({});
  });

  it("stores blank as null and trims, and never invents a value", () => {
    const v = normaliseDetails({ name: "  Contoh   Bhd ", shortName: "  ", phone: undefined });
    expect(v.name).toBe("Contoh Bhd");
    expect(v.shortName).toBeNull();
    expect(v.phone).toBeNull();
    expect(Object.values(normaliseDetails({ name: "Abc" })).filter((x) => x !== null)).toEqual(["Abc"]);
  });

  it("checks the registration number loosely", () => {
    expect(detailsFaults({ ...ok, registrationNo: "201901012345" })).toEqual({});
    expect(detailsFaults({ ...ok, registrationNo: "1234567-A" })).toEqual({});
    expect(detailsFaults({ ...ok, registrationNo: "PPM-001 (2020)/B" })).toEqual({});
    expect(detailsFaults({ ...ok, registrationNo: "12*34" }).registrationNo).toBeDefined();
    expect(detailsFaults({ ...ok, registrationNo: "1".repeat(41) }).registrationNo).toMatch(/at most 40/);
  });

  it("checks the tax identification number", () => {
    expect(detailsFaults({ ...ok, taxIdentificationNo: "C1234567890" })).toEqual({});
    expect(detailsFaults({ ...ok, taxIdentificationNo: "C 123" }).taxIdentificationNo).toBeDefined();
    expect(detailsFaults({ ...ok, taxIdentificationNo: "C".repeat(21) }).taxIdentificationNo).toMatch(/at most 20/);
  });

  it("does not pin a national format on the SST number or the postcode", () => {
    expect(detailsFaults({ ...ok, sstRegistrationNo: "W10-1808-32000123" })).toEqual({});
    expect(detailsFaults({ ...ok, postcode: "50450" })).toEqual({});
    expect(detailsFaults({ ...ok, postcode: "SW1A 1AA" })).toEqual({});
    expect(detailsFaults({ ...ok, postcode: "5045!" }).postcode).toBeDefined();
    expect(detailsFaults({ ...ok, postcode: "12345678901" }).postcode).toMatch(/at most 10/);
  });

  it("limits the address lines, city, state and country", () => {
    expect(detailsFaults({ ...ok, addressLine1: "a".repeat(121) }).addressLine1).toMatch(/at most 120/);
    expect(detailsFaults({ ...ok, addressLine2: "a".repeat(120) })).toEqual({});
    for (const f of ["city", "state", "country"] as const) expect(detailsFaults({ ...ok, [f]: "a".repeat(61) })[f]).toMatch(/at most 60/);
  });

  it("checks the telephone number", () => {
    expect(detailsFaults({ ...ok, phone: "+60 3-1234 5678" })).toEqual({});
    expect(detailsFaults({ ...ok, phone: "(03) 1234 5678" })).toEqual({});
    expect(detailsFaults({ ...ok, phone: "03-1234 ext 5" }).phone).toBeDefined();
    expect(detailsFaults({ ...ok, phone: "1".repeat(31) }).phone).toMatch(/at most 30/);
  });

  it("checks the email has the shape of one", () => {
    expect(detailsFaults({ ...ok, email: "procurement@example.com.my" })).toEqual({});
    for (const bad of ["procurement", "a@b", "a b@c.d", "@c.d", "a@@c.d", "a@c..d"]) {
      expect(detailsFaults({ ...ok, email: bad }).email, bad).toBeDefined();
    }
  });

  it("gives a bare domain https, and refuses anything else that is not an https address", () => {
    expect(normaliseDetails({ ...ok, website: "www.example.com.my" }).website).toBe("https://www.example.com.my");
    expect(detailsFaults({ ...ok, website: "www.example.com.my" })).toEqual({});
    expect(detailsFaults({ ...ok, website: "https://www.example.com.my/about" })).toEqual({});
    expect(detailsFaults({ ...ok, website: "http://www.example.com.my" }).website).toMatch(/https/);
    expect(detailsFaults({ ...ok, website: "ftp://example.com" }).website).toBeDefined();
    expect(detailsFaults({ ...ok, website: "javascript://example.com/%0Aalert(1)" }).website).toBeDefined();
    expect(detailsFaults({ ...ok, website: "https://user:pw@example.com" }).website).toBeDefined();
    expect(detailsFaults({ ...ok, website: "localhost" }).website).toBeDefined();
    expect(detailsFaults({ ...ok, website: "not a site" }).website).toBeDefined();
  });

  it("reports every fault at once", () => {
    expect(Object.keys(detailsFaults({ name: "", email: "x", phone: "abc" })).sort()).toEqual(["email", "name", "phone"]);
  });

  it("shows the short name where there is one, else the legal name", () => {
    expect(displayName({ name: "Syarikat Contoh Sdn. Bhd.", shortName: "Contoh" })).toBe("Contoh");
    expect(displayName({ name: "Syarikat Contoh Sdn. Bhd.", shortName: null })).toBe("Syarikat Contoh Sdn. Bhd.");
    expect(displayName({ name: "Syarikat Contoh", shortName: "  " })).toBe("Syarikat Contoh");
  });
});
