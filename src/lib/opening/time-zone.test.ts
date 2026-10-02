import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { restrictionFinding } from "./findings";
import { open } from "./fixture";
import { openingFindingText } from "./labels";
import { openFaults } from "./open";
import { supplementaryFaults } from "./start";

/**
 * Review R-5: with no time zone, nothing about an opening is dated or judged on a UTC instant. Opening
 * an envelope and starting a supplementary opening refuse TIME_ZONE_NOT_SET; a restricted tender's
 * certificate is never read against an empty closing day (it read EVIDENCED before).
 */

const sale = { partyId: "p", voided: false, certSighted: "ORIGINAL" as const, certValidUntil: "2026-01-01" };

describe("the time zone (R-5)", () => {
  it("openFaults refuses TIME_ZONE_NOT_SET with no zone", () => {
    const base = { state: open(), envelope: { id: "e3", kind: "BID" as const, status: "RECEIVED" as const, late: false }, withdrawn: false, admittedEnvelopeId: null, bidder: { partyId: "p", name: "", registrationNo: "", registrationTaken: false }, price: 100n as never, period: { value: null, unit: null }, isAlternative: false, alternativesPermitted: false, parent: null };
    expect(openFaults({ ...base, timeZone: null }).map((f) => f.code)).toEqual(["TIME_ZONE_NOT_SET"]);
    expect(openFaults({ ...base, timeZone: "Asia/Kuala_Lumpur" })).toEqual([]);
  });
  it("supplementaryFaults refuses TIME_ZONE_NOT_SET with no zone", () => {
    const s = { status: "OPENED", mainFinalised: true, decision: { matterKind: "LATE_TENDER", outcome: "CARRIED", bidEnvelopeId: "e4" }, alreadyOpened: false, envelope: { status: "RECEIVED", late: true }, personActive: true };
    expect(supplementaryFaults({ ...s, timeZone: null }).map((f) => f.code)).toEqual(["TIME_ZONE_NOT_SET"]);
    expect(supplementaryFaults({ ...s, timeZone: "Asia/Kuala_Lumpur" })).toEqual([]);
  });
  it("a restricted tender with no closing day: not judged (a fault), never EVIDENCED against an empty day", () => {
    expect(restrictionFinding(true, sale, null)).toEqual({ fault: { code: "TIME_ZONE_NOT_SET", level: "block" } });
    expect(restrictionFinding(true, sale, "2026-11-17")).toEqual({ finding: "NOT_EVIDENCED" });
    expect(restrictionFinding(false, sale, null)).toEqual({ finding: "NOT_RESTRICTED" });
    expect(openingFindingText({ code: "TIME_ZONE_NOT_SET", level: "block" })).toMatch(/time zone is not set/);
  });
  it("no fallback is left: no UTC instant for the day, no empty closing day", () => {
    const repo = readFileSync("src/lib/opening/repo.ts", "utf8");
    expect(repo).not.toMatch(/org\.today \? dayToDate\(org\.today\) : now/);
    expect(repo).toMatch(/const on = org\.today \? dayToDate\(org\.today\) : null;/);
    for (const p of ["src/app/sourcing/[id]/opening/actions.ts", "prisma/demo-opening.ts"]) {
      const src = readFileSync(p, "utf8");
      expect(src, p).not.toMatch(/closingDay \?\? ""/);
      expect(src, p).toMatch(/timeZone: (l\.org\.timeZone|this\.tz)/);
    }
  });
});
