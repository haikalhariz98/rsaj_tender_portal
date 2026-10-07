import { describe, expect, it } from "vitest";

import type { OrgUnit } from "@/lib/organisation/types";

import { eligibleEndorsers, endorsementEntryFault, endorsementFaults, endorsersFor } from "./endorsement";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const unit = (code: string, kind: OrgUnit["kind"], parentCode: string | null, headPersonId: string | null, from = "2024-01-01", to: string | null = null): OrgUnit => ({
  code, nameEn: code, nameMs: null, kind, parentCode, costCentreCode: null, headPersonId, registrationNumber: null,
  taxReference: null, telephone: null, financialYearStart: null, address: "", operatingLicence: null, governingSource: "",
  provenance: "STATED", notes: "", sortOrder: 0, effectiveFrom: d(from), effectiveTo: to ? d(to) : null,
});

const UNITS = [
  unit("CO", "COMPANY", null, "ceo"),
  unit("DIV", "DIVISION", "CO", null),
  unit("DEPT", "DEPARTMENT", "DIV", "hod", "2024-01-01", "2026-07-01"),
  unit("DEPT", "DEPARTMENT", "DIV", "hod2", "2026-07-01"),
  unit("SEC", "SECTION", "DEPT", "sh"),
];
const today = "2026-09-30";

describe("who endorses (FR-REQ-003)", () => {
  it("takes each tier's head from the unit of that kind on the path", () => {
    const e = endorsersFor("SEC", ["SECTION", "DEPARTMENT"], UNITS, d(today));
    expect(e.map((x) => [x.tier, x.headPersonId, x.fault])).toEqual([["SECTION", "sh", null], ["DEPARTMENT", "hod2", null]]);
  });

  it("faults a tier with no unit on the path, and a unit with no head", () => {
    expect(endorsersFor("DEPT", ["SECTION"], UNITS, d(today))[0].fault).toBe("TIER_NOT_ON_PATH");
    expect(endorsersFor("SEC", ["DIVISION"], UNITS, d(today))[0].fault).toBe("NO_HEAD");
  });
});

describe("whether the endorsements are complete", () => {
  const good = [
    { tier: "SECTION" as const, unitCode: "SEC", personId: "sh", endorsedOn: "2026-09-10" },
    { tier: "DEPARTMENT" as const, unitCode: "DEPT", personId: "hod2", endorsedOn: "2026-09-11" },
  ];

  it("is complete when every tier is endorsed by its head", () => {
    expect(endorsementFaults("SEC", ["SECTION", "DEPARTMENT"], good, UNITS, today)).toEqual([]);
  });

  it("blocks when no tiers are set, rather than passing vacuously (OD-3)", () => {
    expect(endorsementFaults("SEC", [], good, UNITS, today)).toEqual([{ code: "NOT_SET" }]);
  });

  it("names a missing tier, and a tier with no unit on the path", () => {
    expect(endorsementFaults("SEC", ["SECTION", "DEPARTMENT"], [good[0]], UNITS, today)).toEqual([{ code: "MISSING", tier: "DEPARTMENT" }]);
    expect(endorsementFaults("DEPT", ["SECTION"], [], UNITS, today)).toEqual([{ code: "TIER_NOT_ON_PATH", tier: "SECTION" }]);
  });

  it("refuses someone not heading the unit on the endorsement date", () => {
    // hod headed DEPT until July; on 2026-09-11 it is hod2.
    const e = { tier: "DEPARTMENT" as const, unitCode: "DEPT", personId: "hod", endorsedOn: "2026-09-11" };
    expect(endorsementEntryFault(e, "SEC", ["DEPARTMENT"], UNITS, today)).toEqual({ code: "NOT_HEAD", tier: "DEPARTMENT", personId: "hod" });
    expect(endorsementEntryFault({ ...e, endorsedOn: "2026-06-30" }, "SEC", ["DEPARTMENT"], UNITS, today)).toBeNull();
  });

  it("refuses a future date, and waits for a time zone", () => {
    expect(endorsementEntryFault({ ...good[0], endorsedOn: "2026-10-01" }, "SEC", ["SECTION"], UNITS, today)).toEqual({ code: "FUTURE_DATE", tier: "SECTION" });
    expect(endorsementEntryFault(good[0], "SEC", ["SECTION"], UNITS, null)).toEqual({ code: "TIME_ZONE_UNSET" });
  });
});

describe("the requesting officer (code review, item 9)", () => {
  it("may not endorse their own requisition", () => {
    const e = { tier: "SECTION" as const, unitCode: "SEC", personId: "sh", endorsedOn: "2026-09-10" };
    expect(endorsementEntryFault(e, "SEC", ["SECTION"], UNITS, today, "sh")).toEqual({ code: "REQUESTER" });
    expect(endorsementEntryFault(e, "SEC", ["SECTION"], UNITS, today, "someone-else")).toBeNull();
  });
  it("nor may the officer who keyed the requisition for the requester from paper (review of Phase 2b): the requester on record is the colleague, the author is both", () => {
    const e = { tier: "SECTION" as const, unitCode: "SEC", personId: "sh", endorsedOn: "2026-09-10" };
    expect(endorsementEntryFault(e, "SEC", ["SECTION"], UNITS, today, "colleague", undefined, ["sh"])).toEqual({ code: "REQUESTER" });
    expect(endorsementEntryFault(e, "SEC", ["SECTION"], UNITS, today, "colleague", undefined, ["another"])).toBeNull();
  });
});

describe("the endorsement date (UX review, M1)", () => {
  const e = { tier: "SECTION" as const, unitCode: "SEC", personId: "sh", endorsedOn: "2026-09-10" };
  it("may not fall before the day the requisition was raised", () => {
    expect(endorsementEntryFault(e, "SEC", ["SECTION"], UNITS, today, "requester", "2026-09-11")).toEqual({ code: "BEFORE_RAISED", tier: "SECTION" });
  });
  it("may fall on the day it was raised, or after", () => {
    expect(endorsementEntryFault(e, "SEC", ["SECTION"], UNITS, today, "requester", "2026-09-10")).toBeNull();
    expect(endorsementEntryFault(e, "SEC", ["SECTION"], UNITS, today, "requester", "2026-09-01")).toBeNull();
  });
});

describe("who the endorsement drawer offers for a tier (founder, 2026-10-05)", () => {
  it("only that tier's head, not everyone", () => {
    expect(eligibleEndorsers("SEC", "SECTION", UNITS, "2026-09-01", today)).toEqual(["sh"]);
  });
  it("both heads where the unit's head changed inside the window, in order", () => {
    expect(eligibleEndorsers("SEC", "DEPARTMENT", UNITS, "2026-06-15", today)).toEqual(["hod", "hod2"]);
  });
  it("never the requester, and nobody for a tier with no unit or no head", () => {
    expect(eligibleEndorsers("SEC", "SECTION", UNITS, "2026-09-01", today, "sh")).toEqual([]);
    expect(eligibleEndorsers("DEPT", "SECTION", UNITS, "2026-09-01", today)).toEqual([]);
    expect(eligibleEndorsers("SEC", "DIVISION", UNITS, "2026-09-01", today)).toEqual([]);
  });
  it("everyone it offers is someone the entry check accepts on some day in the window", () => {
    for (const pid of eligibleEndorsers("SEC", "DEPARTMENT", UNITS, "2026-06-15", today)) {
      const days = ["2026-06-15", "2026-07-01", today];
      expect(days.some((day) => endorsementEntryFault({ tier: "DEPARTMENT", unitCode: "", personId: pid, endorsedOn: day }, "SEC", ["SECTION", "DEPARTMENT"], UNITS, today) == null)).toBe(true);
    }
  });
});