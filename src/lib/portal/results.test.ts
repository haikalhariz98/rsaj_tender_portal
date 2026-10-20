import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { EXERCISE_STATUSES, type ExerciseStatus } from "@/lib/method/types";
import { SULIT_FIELDS } from "@/lib/sulit-fields";

import { isIssuedAward } from "./public";
import { toPublicResult, type ResultContext, type ResultRow } from "./results";
import { ISSUED_AWARD_STATUSES, resultSelect, SCHEDULE_SELECT } from "./select";

const NOW = new Date("2026-10-06T04:00:00.000Z");
// Ruling R7 (product owner, 2026-10-20; founder's instruction of the same day): the public Results carry no winner and no figure.
// The old argument was the awarded-value setting; the tests below keep passing it ("even with the setting Yes") to show it changes nothing.
const ctx = (publishAwardedValue: boolean | null = null, schedulePublishedAt?: ReadonlyMap<string, Date>): ResultContext =>
  ({
    now: NOW,
    timeZone: "Asia/Kuala_Lumpur",
    methodNames: new Map([["open_tender", "Open tender"]]),
    schedulePublishedAt,
    // Not part of the context any more: a caller that still passes it is ignored.
    ...({ publishAwardedValue } as object),
  }) as ResultContext;
/// What a careless read could still hand the projection: the winner and the figure. Neither may appear in its output.
const WINNER = { awardeeName: "  Sampel Engineering Sdn Bhd ", awardedValue: { toString: () => "1234567.5" } };
const row = (o: Partial<ResultRow> = {}): ResultRow => ({
  id: "sx1",
  reference: "DEMO/SX/0016/2026",
  title: "Reservoir roof repair",
  status: "EVALUATED",
  restricted: false,
  closingAt: new Date("2026-10-02T07:00:00.000Z"),
  sourcingMethodCode: "open_tender",
  window: { path: "ADVERTISED", publishedAt: new Date("2026-09-10T01:00:00.000Z") },
  awards: [{ status: "ISSUED", issuedAt: new Date("2026-10-05T17:30:00.000Z"), ...WINNER }],
  ...o,
});
const FIGURES = ["1234567.5", "1,234,567.50", "123456750"];
const leaks = (r: unknown) => FIGURES.filter((f) => JSON.stringify(r).includes(f));

describe("toPublicResult", () => {
  it("shows the exercise, its closing day and the day the award was issued, in the organisation's day", () => {
    const r = toPublicResult(row(), ctx())!;
    expect(r).toMatchObject({ id: "sx1", reference: "DEMO/SX/0016/2026", title: "Reservoir roof repair", method: "Open tender", closing: "2 October 2026" });
    // 17:30 UTC on the 5th is 01:30 on the 6th in Kuala Lumpur.
    expect(r.awardedDay).toBe("2026-10-06");
    expect(r.awardedOn).toBe("6 October 2026");
  });

  describe("the winner and the awarded value are never shown, even with the setting Yes", () => {
    for (const setting of [null, false, true]) {
      it(`setting ${setting}: no awardee field, no figure, no name anywhere in the row`, () => {
        const r = toPublicResult(row(), ctx(setting))!;
        expect(Object.keys(r).sort()).toEqual(["awardedDay", "awardedOn", "closing", "id", "method", "reference", "schedulePublishedOn", "title"]);
        expect(leaks(r)).toEqual([]);
        expect(JSON.stringify(r)).not.toMatch(/Sampel|awardee/i);
      });
    }
  });

  describe("the schedule of tenders", () => {
    it("is not published unless the office attached one", () => {
      expect(toPublicResult(row(), ctx())!.schedulePublishedOn).toBeNull();
    });
    it("shows the day it was published, in the organisation's day", () => {
      const r = toPublicResult(row(), ctx(null, new Map([["sx1", new Date("2026-10-06T17:00:00.000Z")]])))!;
      expect(r.schedulePublishedOn).toBe("7 October 2026");
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
        expect(toPublicResult(row({ awards: [{ status, issuedAt: NOW }] }), ctx(true))).toBeNull();
      }
    });
    it("an issued and an accepted award are results", () => {
      for (const status of ["ISSUED", "ACCEPTED"]) expect(toPublicResult(row({ awards: [{ status, issuedAt: NOW }] }), ctx(false))).not.toBeNull();
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

  it("with more than one issued award, the latest issued gives the day", () => {
    const r = toPublicResult(
      row({ awards: [{ status: "ISSUED", issuedAt: new Date("2026-10-01T02:00:00Z") }, { status: "ACCEPTED", issuedAt: new Date("2026-10-03T02:00:00Z") }] }),
      ctx(true),
    )!;
    expect(r.awardedDay).toBe("2026-10-03");
  });

  it("an award with no recorded day still lists, without a date", () => {
    const r = toPublicResult(row({ awards: [{ status: "ISSUED", issuedAt: null }] }), ctx(false))!;
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
  const keys = keysIn(resultSelect());
  it("takes no argument: nothing an organisation sets widens it", () => {
    expect(resultSelect.length).toBe(0);
  });
  it("selects only issued or accepted awards", () => {
    expect((resultSelect().awards as { where: unknown }).where).toEqual({ status: { in: [...ISSUED_AWARD_STATUSES] } });
  });
  it("names no SULIT field and nothing else about an award, an exercise or a person", () => {
    for (const f of SULIT_FIELDS) expect(keys, f.field).not.toContain(f.field);
    for (const k of [
      "estimatedValue", "scopeParts", "amount", "parties", "sales", "recipients", "attendance", "personInCharge", "dossierReference", "evaluation", "envelopes", "bids", "recordedBy", "notes", "cancelReason",
      "awardeeName", "awardedValue", "awardeeRegistrationNo", "awardeeAddress", "vendor", "vendorId", "awardeeParty", "awardeePartyId", "signatoryName", "signatoryPerson", "signatoryRoleLabel", "icNumber", "erpCommitmentNo", "bondRequired", "ladAmount", "retentionPercent", "contract", "completionPeriod",
    ]) {
      expect(keys, k).not.toContain(k);
    }
  });
  it("the award carries exactly its status and issue time", () => {
    expect(Object.keys((resultSelect().awards as { select: object }).select).sort()).toEqual(["issuedAt", "status"]);
  });
  it("no award party, vendor or price column is read anywhere in the public Results code, the schedule's read and download included", () => {
    // Source scan, whole files with their comments stripped: the projection, both reads, the page and the download. A name here would be a column the public could be shown.
    const strip = (f: string) => readFileSync(join(process.cwd(), f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const files = ["src/lib/portal/results.ts", "src/lib/portal/repo.ts", "src/lib/portal/schedule.ts", "src/lib/portal/schedule-store.ts", "src/app/supplier/results/page.tsx", "src/app/supplier/results/[id]/schedule/route.ts"];
    for (const f of files) expect(strip(f), f).not.toMatch(/awardee|awardedValue|awardedSen|publishAwardedValue|vendor|winner|price|amount/i);
  });
  it("the schedule's read names the attachment, its version and its document's classification, and nothing of an award", () => {
    expect([...new Set(keysIn(SCHEDULE_SELECT))].sort()).toEqual(["attachedAt", "classificationSnapshot", "detachedAt", "document", "exerciseId", "id", "mediaType", "originalFilename", "scanState", "select", "sha256", "version", "withdrawnAt"]);
  });
});
