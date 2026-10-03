import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { advanceIssueFaults, applicationFaults, pendingAdvanceFaults, type ApplicationInput } from "./advance";

/// Code review run 2 residuals MUST 2 and MUST 3.
const s = parseSen;
const APG = { kind: "ADVANCE_PAYMENT_GUARANTEE", status: "VERIFIED", effectiveFrom: "2026-01-01", expiresOn: "2027-01-01", value: s("10000.00") };
const ROOT = path.join(__dirname, "../../..");
const acts = readFileSync(path.join(ROOT, "src/app/projects/[id]/payment-actions.ts"), "utf8");

describe("MUST 2: rows on certificates the opening position covers are past", () => {
  const app: ApplicationInput = { party: "MAIN", partyKnown: true, amount: s("6000.00"), guarantee: APG, schedule: [2, 3, 4, 5, 6, 7].map((n) => ({ sequence: n, amount: s("1000.00") })), issuedInterims: 7, liveForParty: false, inProgressSequence: null, today: "2026-07-01" };
  it("an opening at sequence 7: rows 2..7 refused; rows from 8 sound", () => {
    expect(applicationFaults(app).map((f) => f.code)).toEqual(["SCHEDULE_PAST"]);
    expect(applicationFaults({ ...app, schedule: [8, 9, 10, 11, 12, 13].map((n) => ({ sequence: n, amount: s("1000.00") })) })).toEqual([]);
  });
  it("the act passes the highest issued sequence (nextInterimSequence − 1), never a count", () => {
    expect(acts).toMatch(/issuedInterims: nextInterimSequence\(p\) - 1,/);
    expect(acts).not.toMatch(/issuedInterims: issuedInterims\(p\)\.length/);
  });
});

describe("MUST 3: the advance applied first, valuation 2 raised and issued before the advance issues", () => {
  it("opening a valuation is refused while an advance is applied for and not issued or void, naming it", () => {
    expect(pendingAdvanceFaults([{ label: "the advance to the main contractor of RM3,000.00" }])).toEqual([{ code: "ADVANCE_PENDING", level: "block", data: { advances: "the advance to the main contractor of RM3,000.00" } }]);
    expect(pendingAdvanceFaults([])).toEqual([]);
    expect(acts).toMatch(/fs\.push\(\.\.\.pendingAdvanceFaults\(pendingAdvancesOf\(p\)\)\);\n\s+if \(fs\.length\) refuse\("Not opened:", fs\);/);
  });
  it("and the advance's issue is refused if a row falls on or before an interim sequence issued or in progress", () => {
    const rows = [{ sequence: 2, amount: s("1500.00") }, { sequence: 3, amount: s("1500.00") }];
    expect(advanceIssueFaults(rows, 2, null)).toEqual([{ code: "ADVANCE_SCHEDULE_PASSED", level: "block", data: { rows: "2", limit: 2 } }]);
    expect(advanceIssueFaults(rows, 1, 2).map((f) => f.data)).toEqual([{ rows: "2", limit: 2 }]);
    expect(advanceIssueFaults(rows, 1, null)).toEqual([]);
    const issue = readFileSync(path.join(ROOT, "src/lib/payment/at-issue.ts"), "utf8");
    expect(issue).toMatch(/advanceIssueFaults\([^]*nextInterimSequence\(p\) - 1, inProgressSequenceOf\(p\)\)/);
  });
});
