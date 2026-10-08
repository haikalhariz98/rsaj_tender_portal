import { describe, expect, it } from "vitest";

import { composeAddress, mobileWithDialCode, stepOneFaults, typedDay, type StepOneContext, type StepOneInput } from "./step-one";

const good: StepOneInput = {
  address: { addressLine1: "1 Jalan Contoh", addressLine2: "", city: "Kota Kinabalu", postcode: "88000", stateCode: "sbh" },
  bumiputeraClaimCode: null,
  incorporatedOn: "2015-03-02",
};
const ctx: StepOneContext = { today: "2026-10-12", stateCodes: ["sbh", "sgr"], bumiputeraCodes: ["yes", "no"] };
const codes = (i: StepOneInput, c: StepOneContext = ctx) => stepOneFaults(i, c).map((f) => f.code);
const withAddress = (a: Partial<StepOneInput["address"]>): StepOneInput => ({ ...good, address: { ...good.address, ...a } });

describe("step one of the registration", () => {
  it("passes with the address in parts, a state on the list and a date incorporated", () => {
    expect(codes(good)).toEqual([]);
  });

  it("asks the street, the city and the postcode, and writes no postcode format", () => {
    expect(codes(withAddress({ addressLine1: " ", city: "", postcode: "" }))).toEqual(["ADDRESS_LINE_REQUIRED", "CITY_REQUIRED", "POSTCODE_REQUIRED"]);
    // A postcode's shape is a country's: whatever is typed is taken.
    expect(codes(withAddress({ postcode: "SW1A 1AA" }))).toEqual([]);
    expect(codes(withAddress({ addressLine2: "" }))).toEqual([]);
  });

  it("closes on an empty list of states, asks for one otherwise, and refuses one not on the list", () => {
    expect(codes(good, { ...ctx, stateCodes: [] })).toEqual(["STATES_NOT_SET"]);
    expect(codes(withAddress({ stateCode: null }))).toEqual(["ADDRESS_STATE_REQUIRED"]);
    expect(codes(withAddress({ stateCode: "elsewhere" }))).toEqual(["ADDRESS_STATE_NOT_LISTED"]);
  });

  it("requires the date incorporated: a real day, today allowed, tomorrow not", () => {
    expect(codes({ ...good, incorporatedOn: null })).toEqual(["INCORPORATED_ON_REQUIRED"]);
    expect(codes({ ...good, incorporatedOn: "  " })).toEqual(["INCORPORATED_ON_REQUIRED"]);
    expect(codes({ ...good, incorporatedOn: "2026-02-30" })).toEqual(["INCORPORATED_ON_NOT_A_DAY"]);
    expect(codes({ ...good, incorporatedOn: "02/03/2015" })).toEqual(["INCORPORATED_ON_NOT_A_DAY"]);
    expect(codes({ ...good, incorporatedOn: "2026-10-12" })).toEqual([]);
    expect(codes({ ...good, incorporatedOn: "2026-10-13" })).toEqual(["INCORPORATED_IN_FUTURE"]);
    expect(codes({ ...good, incorporatedOn: "2024-02-29" })).toEqual([]);
    expect(codes({ ...good, incorporatedOn: "2025-02-29" })).toEqual(["INCORPORATED_ON_NOT_A_DAY"]);
  });

  it("takes a Bumiputera claim only from the list, asks none when the list is empty, and never requires one", () => {
    expect(codes({ ...good, bumiputeraClaimCode: "yes" })).toEqual([]);
    expect(codes({ ...good, bumiputeraClaimCode: "maybe" })).toEqual(["BUMIPUTERA_NOT_LISTED"]);
    expect(codes(good, { ...ctx, bumiputeraCodes: [] })).toEqual([]);
    expect(codes({ ...good, bumiputeraClaimCode: "yes" }, { ...ctx, bumiputeraCodes: [] })).toEqual(["BUMIPUTERA_NOT_LISTED"]);
  });
});

describe("the address as one text", () => {
  it("is the parts in the order a letter is addressed, the postcode and city together, the state last", () => {
    expect(composeAddress(good.address, "Sabah")).toBe("1 Jalan Contoh\n88000 Kota Kinabalu\nSabah");
    expect(composeAddress({ ...good.address, addressLine2: "Taman  Contoh" }, "Sabah")).toBe("1 Jalan Contoh\nTaman Contoh\n88000 Kota Kinabalu\nSabah");
  });
  it("leaves out a state no longer listed rather than showing its code", () => {
    expect(composeAddress(good.address, null)).toBe("1 Jalan Contoh\n88000 Kota Kinabalu");
  });
  it("is empty when nothing was typed", () => {
    expect(composeAddress({ addressLine1: "", addressLine2: " ", city: "", postcode: "" }, null)).toBe("");
  });
});

describe("the mobile number with its country's dial code", () => {
  it("joins the dial code once and takes the number as typed otherwise", () => {
    expect(mobileWithDialCode("12-345 6789", "+60")).toBe("+60 12-345 6789");
    expect(mobileWithDialCode("  12   345 ", "+60")).toBe("+60 12 345");
  });
  it("keeps a number that is already international", () => {
    expect(mobileWithDialCode("+65 8123 4567", "+60")).toBe("+65 8123 4567");
    expect(mobileWithDialCode("0065 8123", "+60")).toBe("0065 8123");
  });
  it("adds nothing where no dial code is set, and drops no trunk digit", () => {
    expect(mobileWithDialCode("012-345 6789", null)).toBe("012-345 6789");
    expect(mobileWithDialCode("012-345 6789", "+60")).toBe("+60 012-345 6789");
    expect(mobileWithDialCode("", "+60")).toBe("");
    expect(mobileWithDialCode("   ", "+60")).toBe("");
  });
});

describe("a typed day", () => {
  it("is a real day or nothing", () => {
    expect(typedDay(" 2026-10-12 ")).toBe("2026-10-12");
    expect(typedDay("2026-13-01")).toBeNull();
    expect(typedDay(null)).toBeNull();
    expect(typedDay("")).toBeNull();
  });
});
