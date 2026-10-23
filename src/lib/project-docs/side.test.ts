import { describe, expect, it } from "vitest";

import type { DelegationFacts, SoOffice } from "@/lib/supervision/authority";

import { mayActForOrganisation, noSoResolved, organisationSide } from "./side";

/** The organisation's side on a day (PW-5, PW-16): holders, acting holders and representatives in force, each once, and who may act. */

const DAY = "2026-10-23";
const so: SoOffice = { roleLabel: "Superintending Officer", holderIds: ["h"], actingIds: ["act"] };
const rep = (o: Partial<DelegationFacts> = {}): DelegationFacts => ({ id: "d1", kind: "PRINCIPAL", delegatePersonId: "eng", letterIssuedOn: "2026-10-01", revokedOn: null, scope: ["CONTRACTOR_COMMUNICATION"], ...o });

describe("mayActForOrganisation (PW-5)", () => {
  it("a holder of the S.O. office, or someone acting in it, may", () => {
    expect(mayActForOrganisation("h", so, [], DAY)).toBe(true);
    expect(mayActForOrganisation("act", so, [], DAY)).toBe(true);
  });
  it("a representative in force whose letter lists contractor communication may", () => {
    expect(mayActForOrganisation("eng", so, [rep()], DAY)).toBe(true);
  });
  it("a representative whose letter omits it may not; nor one whose letter is not issued yet, or revoked by the day", () => {
    expect(mayActForOrganisation("eng", so, [rep({ scope: ["DIARY"] })], DAY)).toBe(false);
    expect(mayActForOrganisation("eng", so, [rep({ letterIssuedOn: null })], DAY)).toBe(false);
    expect(mayActForOrganisation("eng", so, [rep({ letterIssuedOn: "2026-10-24" })], DAY)).toBe(false);
    expect(mayActForOrganisation("eng", so, [rep({ revokedOn: DAY })], DAY)).toBe(false);
    expect(mayActForOrganisation("eng", so, [rep({ revokedOn: "2026-10-24" })], DAY)).toBe(true);
  });
  it("a staff member with no office and no delegation may not: other staff read only (recorderFaultToday alone would let them through)", () => {
    expect(mayActForOrganisation("clerk", so, [rep()], DAY)).toBe(false);
  });
  it("with no S.O. resolved on the day, nobody may", () => {
    expect(mayActForOrganisation("eng", null, [rep()], DAY)).toBe(false);
  });
});

describe("organisationSide (PW-16)", () => {
  it("holders, then acting holders, then representatives in force, each once, with the office in words", () => {
    const side = organisationSide(so, [rep(), rep({ id: "d2", delegatePersonId: "qs", kind: "SPECIALIST_QS", scope: ["VALUATION"] }), rep({ id: "d3", delegatePersonId: "old", revokedOn: "2026-10-20" })], DAY);
    expect(side).toEqual([
      { personId: "h", capacity: "SO", officeLabel: "Superintending Officer", mayAct: true },
      { personId: "act", capacity: "ACTING", officeLabel: "Superintending Officer", mayAct: true },
      { personId: "eng", capacity: "REPRESENTATIVE", officeLabel: "Principal Representative", mayAct: true },
      { personId: "qs", capacity: "REPRESENTATIVE", officeLabel: "Specialist Representative (Quantity Surveyor)", mayAct: false },
    ]);
  });
  it("a holder who is also a representative, or also acting, is listed once, as the holder", () => {
    const side = organisationSide({ ...so, actingIds: ["h"] }, [rep({ delegatePersonId: "h" })], DAY);
    expect(side).toEqual([{ personId: "h", capacity: "SO", officeLabel: "Superintending Officer", mayAct: true }]);
  });
  it("a representative with several letters is labelled by the one that lets them act", () => {
    const side = organisationSide(so, [rep({ id: "a", kind: "SPECIALIST", scope: ["DIARY"] }), rep({ id: "b", kind: "PRINCIPAL" })], DAY);
    expect(side.filter((m) => m.personId === "eng")).toEqual([{ personId: "eng", capacity: "REPRESENTATIVE", officeLabel: "Principal Representative", mayAct: true }]);
  });
  it("with no S.O. resolved, the representatives in force are listed and none may act", () => {
    expect(organisationSide(null, [rep()], DAY)).toEqual([{ personId: "eng", capacity: "REPRESENTATIVE", officeLabel: "Principal Representative", mayAct: false }]);
  });
});

describe("PW-48: no S.O. resolved is a fact the Documents card shows, never a refusal", () => {
  it("is true only where no S.O. office is resolved on the day", () => {
    expect(noSoResolved(null)).toBe(true);
    expect(noSoResolved({ roleLabel: "S.O.", holderIds: ["so"], actingIds: [] })).toBe(false);
  });
});
