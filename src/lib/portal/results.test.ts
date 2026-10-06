import { describe, expect, it } from "vitest";

import { EXERCISE_STATUSES, type ExerciseStatus } from "@/lib/method/types";
import { SULIT_FIELDS } from "@/lib/sulit-fields";

import { isIssuedAward } from "./public";
import { toPublicResult, type ResultContext, type ResultRow } from "./results";
import { ISSUED_AWARD_STATUSES, resultSelect } from "./select";

const NOW = new Date("2026-10-06T04:00:00.000Z");
const ctx = (publishAwardedValue: boolean | null): ResultContext => ({
  now: NOW,
  timeZone: "Asia/Kuala_Lumpur",
  methodNames: new Map([["open_tender", "Open tender"]]),
  publishAwardedValue,
});
const row = (o: Partial<ResultRow> = {}): ResultRow => ({
  id: "sx1",
  reference: "DEMO/SX/0016/2026",
  title: "Reservoir roof repair",
  status: "EVALUATED",
  restricted: false,
  closingAt: new Date("2026-10-02T07:00:00.000Z"),
  sourcingMethodCode: "open_tender",
  window: { path: "ADVERTISED", publishedAt: new Date("2026-09-10T01:00:00.000Z") },
  awards: [{ status: "ISSUED", issuedAt: new Date("2026-10-05T17:30:00.000Z"), awardeeName: "  Sampel Engineering Sdn Bhd ", awardedValue: { toString: () => "1234567.5" } }],
  ...o,
});
const FIGURES = ["1234567.5", "1,234,567.50", "123456750"];
const leaks = (r: unknown) => FIGURES.filter((f) => JSON.stringify(r).includes(f));

describe("toPublicResult", () => {
  it("shows the exercise, the awardee and the day the award was issued, in the organisation's day", () => {
    const r = toPublicResult(row(), ctx(null))!;
    expect(r).toMatchObject({ id: "sx1", reference: "DEMO/SX/0016/2026", title: "Reservoir roof repair", method: "Open tender", awardee: "Sampel Engineering Sdn Bhd" });
    // 17:30 UTC on the 5th is 01:30 on the 6th in Kuala Lumpur.
    expect(r.awardedDay).toBe("2026-10-06");
    expect(r.awardedOn).toBe("6 October 2026");
  });

  describe("the awarded value", () => {
    it("is not shown where the setting is not set", () => {
      const r = toPublicResult(row(), ctx(null))!;
      expect(r.awardedSen).toBeNull();
      expect(leaks(r)).toEqual([]);
    });
    it("is not shown where the setting is No", () => {
      const r = toPublicResult(row(), ctx(false))!;
      expect(r.awardedSen).toBeNull();
      expect(leaks(r)).toEqual([]);
    });
    it("is shown, exactly and in sen, only where the setting is Yes", () => {
      expect(toPublicResult(row(), ctx(true))!.awardedSen).toBe("123456750");
    });
    it("is not invented where the setting is Yes and no value was read", () => {
      const r = toPublicResult(row({ awards: [{ status: "ISSUED", issuedAt: NOW, awardeeName: "A" }] }), ctx(true))!;
      expect(r.awardedSen).toBeNull();
    });
  });

  describe("which exercises are results", () => {
    for (const status of EXERCISE_STATUSES) {
      for (const path of ["ADVERTISED", "INVITED", "NONE"] as const) {
        for (const published of [true, false]) {
          for (const restricted of [false, true]) {
            const expected = path === "ADVERTISED" && published && !restricted && ["ADVERTISED", "OPENING_IN_PROGRESS", "OPENED", "UNDER_EVALUATION", "EVALUATED"].includes(status);
            it(`${status} · ${path} · ${published ? "published" : "unpublished"} · ${restricted ? "confidential" : "not confidential"} -> ${expected}`, () => {
              const window = path === "NONE" ? null : { path, publishedAt: published ? new Date("2026-09-10T01:00:00.000Z") : null };
              expect(toPublicResult(row({ status: status as ExerciseStatus, window, restricted }), ctx(true)) !== null).toBe(expected);
            });
          }
        }
      }
    }
    it("an award that is only a draft, awaiting approval, approved or cancelled is not a result", () => {
      for (const status of ["DRAFT", "PENDING_APPROVAL", "APPROVED", "CANCELLED"]) {
        expect(toPublicResult(row({ awards: [{ status, issuedAt: NOW, awardeeName: "A" }] }), ctx(true))).toBeNull();
      }
    });
    it("an issued and an accepted award are results", () => {
      for (const status of ["ISSUED", "ACCEPTED"]) expect(toPublicResult(row({ awards: [{ status, issuedAt: NOW, awardeeName: "A" }] }), ctx(false))).not.toBeNull();
      expect(isIssuedAward("ISSUED") && isIssuedAward("ACCEPTED") && !isIssuedAward("APPROVED")).toBe(true);
    });
    it("an exercise with no award is not a result", () => {
      expect(toPublicResult(row({ awards: [] }), ctx(true))).toBeNull();
    });
    it("a cancelled exercise is not a result, even with an issued award: the board lists it as cancelled", () => {
      expect(toPublicResult(row({ status: "CANCELLED" }), ctx(true))).toBeNull();
    });
    it("an exercise the board could not list (no closing) is not a result, so no result links to a missing page", () => {
      expect(toPublicResult(row({ closingAt: null }), ctx(false))).toBeNull();
    });
  });

  it("with more than one issued award, the latest issued is shown", () => {
    const r = toPublicResult(
      row({
        awards: [
          { status: "ISSUED", issuedAt: new Date("2026-10-01T02:00:00Z"), awardeeName: "First Sdn Bhd", awardedValue: { toString: () => "100.00" } },
          { status: "ACCEPTED", issuedAt: new Date("2026-10-03T02:00:00Z"), awardeeName: "Second Sdn Bhd", awardedValue: { toString: () => "200.00" } },
        ],
      }),
      ctx(true),
    )!;
    expect(r.awardee).toBe("Second Sdn Bhd");
    expect(r.awardedSen).toBe("20000");
  });

  it("an award with no recorded day still lists, without a date", () => {
    const r = toPublicResult(row({ awards: [{ status: "ISSUED", issuedAt: null, awardeeName: "A" }] }), ctx(false))!;
    expect(r.awardedOn).toBeNull();
    expect(r.awardedDay).toBeNull();
  });

  it("the projection is plain data: strings and null, no dates or decimals", () => {
    for (const v of Object.values(toPublicResult(row(), ctx(true))!)) expect(v === null || typeof v === "string").toBe(true);
  });
});

/// Every key name in a Prisma select, however deep.
const keysIn = (select: unknown): string[] => {
  if (!select || typeof select !== "object") return [];
  return Object.entries(select as Record<string, unknown>).flatMap(([k, v]) => [k, ...keysIn(v)]);
};

describe("the read behind the public Results page", () => {
  const without = keysIn(resultSelect(false));
  const withValue = keysIn(resultSelect(true));
  it("does not select the awarded value unless the organisation publishes it", () => {
    expect(without).not.toContain("awardedValue");
    expect(withValue).toContain("awardedValue");
  });
  it("selects only issued or accepted awards", () => {
    expect((resultSelect(false).awards as { where: unknown }).where).toEqual({ status: { in: [...ISSUED_AWARD_STATUSES] } });
  });
  it("names no SULIT field and nothing else about an award, an exercise or a person", () => {
    for (const keys of [without, withValue]) {
      for (const f of SULIT_FIELDS) expect(keys, f.field).not.toContain(f.field);
      for (const k of [
        "estimatedValue", "scopeParts", "amount", "parties", "sales", "recipients", "attendance", "personInCharge", "dossierReference", "evaluation", "envelopes", "bids", "recordedBy", "notes", "cancelReason",
        "awardeeRegistrationNo", "awardeeAddress", "vendor", "vendorId", "awardeeParty", "awardeePartyId", "signatoryName", "signatoryPerson", "signatoryRoleLabel", "icNumber", "erpCommitmentNo", "bondRequired", "ladAmount", "retentionPercent", "contract", "completionPeriod",
      ]) {
        expect(keys, k).not.toContain(k);
      }
    }
  });
  it("the award carries exactly its status, issue time and awardee, and the value only when published", () => {
    expect(Object.keys((resultSelect(false).awards as { select: object }).select).sort()).toEqual(["awardeeName", "issuedAt", "status"]);
    expect(Object.keys((resultSelect(true).awards as { select: object }).select).sort()).toEqual(["awardedValue", "awardeeName", "issuedAt", "status"]);
  });
});
