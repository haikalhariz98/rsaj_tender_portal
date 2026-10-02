import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { awardFindingText } from "@/lib/award/labels";
import { applyFaults, extensionFaults } from "@/lib/bids/extension";
import { parseSen } from "@/lib/money";

import { evaluationGateFaults, type EvaluationGateFacts } from "./award-gate";
import { evaluationFindingText } from "./labels";

/**
 * 6.8 fix M-1 (FR-BID-010, 6.6 OD-7, against 6.6 and 6.11): once the version in force recommends a
 * tenderer, a validity extension is recorded and applied only on that tenderer's consent, and no award
 * is submitted or issued on a validity another party consented to.
 */

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("recording and applying an extension against the recommendation", () => {
  const rec = { cancelled: false, closing: new Date("2026-09-01T02:00:00Z"), now: new Date("2026-10-02T02:00:00Z"), today: "2026-10-02", currentExpiry: "2026-11-30", toExpiry: "2026-12-31", reason: "Board sits late", partyKnown: true, partyId: "pA", consentReceivedOn: "2026-10-01", pendingExists: false, personActive: true };
  it("recording: another party than the recommended tenderer is refused; the recommended one, or none recommended yet, is not", () => {
    expect(codes(extensionFaults({ ...rec, recommendedPartyId: "pB" }))).toEqual(["NOT_RECOMMENDED"]);
    expect(extensionFaults({ ...rec, recommendedPartyId: "pA" })).toEqual([]);
    expect(extensionFaults({ ...rec, recommendedPartyId: null })).toEqual([]);
  });
  const apply = { cancelled: false, appliedAt: null, liveConsents: 1, toExpiry: "2026-12-31", currentExpiry: "2026-11-30" };
  it("applying: an extension recorded on another party's consent before the recommendation is not applied", () => {
    expect(codes(applyFaults({ ...apply, consent: { partyId: "pA", recommendedPartyId: "pB" } }))).toEqual(["NOT_RECOMMENDED"]);
    expect(applyFaults({ ...apply, consent: { partyId: "pB", recommendedPartyId: "pB" } })).toEqual([]);
    expect(applyFaults({ ...apply, consent: { partyId: "pA", recommendedPartyId: null } })).toEqual([]);
  });
  it("the actions state the recommended party of the version in force for both acts (source scan)", () => {
    const src = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/bids/actions.ts"), "utf8");
    const record = src.slice(src.indexOf("export async function recordValidityExtension"), src.indexOf("export async function applyValidityExtension"));
    expect(record).toMatch(/recommendedPartyId: await recommendedPartyInForce\(l\.ex\.id, tx\)/);
    expect(record).not.toMatch(/recommendedPartyId: null/);
    const applyAct = src.slice(src.indexOf("export async function applyValidityExtension"), src.indexOf("export async function saveBidAnswers"));
    expect(applyAct).toMatch(/consent: \{ partyId: x\.consentPartyId, recommendedPartyId: await recommendedPartyInForce\(l\.ex\.id, tx\) \}/);
  });
});

describe("the award's evaluation gate checks the consent (M-1)", () => {
  const issued = (consent?: { party: string; day: string }[]): EvaluationGateFacts => ({ applies: true, pinned: true, exerciseStatus: "EVALUATED", issued: { stale: false, recommendedPartyId: "pB", price: parseSen("612450.30"), period: null, consentNotFromRecommended: consent } });
  it("an applied extension on another party's consent holds the award, naming the party", () => {
    const fs = evaluationGateFaults(issued([{ party: "Syarikat A", day: "2026-12-31" }]), "pB");
    expect(codes(fs)).toEqual(["CONSENT_NOT_FROM_RECOMMENDED"]);
    expect(awardFindingText(fs[0])).toBe(evaluationFindingText(fs[0]));
    expect(awardFindingText(fs[0])).toContain("Syarikat A");
  });
  it("every consent from the recommended tenderer, or none applied: nothing held", () => {
    expect(evaluationGateFaults(issued([]), "pB")).toEqual([]);
    expect(evaluationGateFaults(issued(undefined), "pB")).toEqual([]);
  });
  it("the one producer reads the consents (source scan)", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/evaluation/gate-read.ts"), "utf8");
    expect(src).toMatch(/consentNotFromRecommended: \(consent\?\.faults \?\? \[\]\)/);
  });
});
