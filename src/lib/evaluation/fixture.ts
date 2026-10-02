/**
 * TEST FIXTURE ONLY: builders for an evaluation's facts, on the fixture models (`ta109-fixture.ts`).
 * Never imported outside a test.
 */

import { parseSen } from "@/lib/money";

import type { BidderFacts, EvaluationFacts, ResultFacts, ScoreFacts, SubmissionFacts, TeamFacts } from "./facts";
import { parseFixed } from "./fixed";
import { modelSnapshot, type ModelContent } from "./model";
import { ASPECTS, TA109 } from "./ta109-fixture";

export const at = new Date("2026-10-01T02:00:00Z");

export const bidder = (n: number, over: Partial<BidderFacts> = {}): BidderFacts => ({
  id: `b${n}`,
  openedBidId: `ob${n}`,
  partyId: `p${n}`,
  listingNo: n,
  bidderName: `Bidder ${n}`,
  registrationNo: `R${n}`,
  priceAsRead: parseSen("285000.00"),
  correctedPrice: null,
  period: { value: 12, unit: "MONTHS" },
  excludedReason: "",
  shortlisted: null,
  factorOptionCode: null,
  balances: [null, null, null],
  cprPercent: null,
  cprReports: 0,
  scores: new Map(),
  aspects: new Map(),
  missingAtOpening: [],
  stageOne: null,
  negotiatedPrice: null,
  carried: false,
  ...over,
});

export const score = (v: string | boolean, by = "pi"): ScoreFacts => ({ marks: typeof v === "string" ? parseFixed(v) : null, passed: typeof v === "boolean" ? v : null, note: "", scoredByPersonId: by, scoredBy: by === "pi" ? "Imran" : "Chen", recordedAt: at, carried: false });

export const TEAM: TeamFacts[] = [
  { personId: "pi", name: "Imran", side: "IMPLEMENTING_DEPARTMENT", unitCode: "U1" },
  { personId: "pc", name: "Chen", side: "CONTRACT_PROCUREMENT", unitCode: null },
];

export const submission = (stageCode: string, side: SubmissionFacts["side"] = "IMPLEMENTING_DEPARTMENT", personId = side === "IMPLEMENTING_DEPARTMENT" ? "pi" : "pc"): SubmissionFacts => ({ stageCode, side, personId, person: personId, at });

export const result = (bidderId: string, stageCode: string, over: Partial<ResultFacts> = {}): ResultFacts => ({ bidderId, stageCode, percent: null, shown: null, passed: true, bandLabel: null, outOfRunning: false, ...over });

export function facts(over: Partial<EvaluationFacts> = {}, model: ModelContent = TA109): EvaluationFacts {
  return {
    state: "OPEN",
    exerciseStatus: "UNDER_EVALUATION",
    route: model.route,
    model: modelSnapshot("m1", model, ASPECTS, at),
    decimals: 2,
    bidders: [bidder(1), bidder(2)],
    submissions: [],
    results: [],
    team: TEAM,
    estimate: { value: parseSen("330000.00"), label: null },
    ...over,
  };
}

/// Every TA 109 technical criterion scored for a bidder, summing to `total` of 100 (spread 40/30/30 by proportion).
export function techScores(total: string): Map<string, ScoreFacts> {
  const t = parseFixed(total);
  const part = (n: bigint) => (t * n) / 100n;
  const a = part(20n), b = part(20n), c = part(30n);
  const d = t - a - b - c;
  const s = (x: bigint) => score(fx(x));
  return new Map([
    ["TECHNICAL/EXP_SIMILAR", s(a)],
    ["TECHNICAL/EXP_VALUE", s(b)],
    ["TECHNICAL/STAFF", s(c)],
    ["TECHNICAL/PROGRAMME", s(d)],
  ]);
}

const fx = (x: bigint) => {
  const neg = x < 0n;
  const a = neg ? -x : x;
  return `${neg ? "-" : ""}${a / 10000n}.${(a % 10000n).toString().padStart(4, "0")}`;
};
