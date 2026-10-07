import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { COPY_NOT_COMPARED_LABEL, copyReading, estimateCardText } from "./estimate-copy";
import { openingPolicyFrozen, policyOf, summaryLabelsOf } from "./policy";
import { frozenRuleFaults } from "./start";
import { unpurchasedRecordAudit, unpurchasedRule, unpurchasedRuleText } from "./unpurchased";

/**
 * Review R-4: the invited-count reading (OD-9) and the Grand Summary's words are frozen at the start
 * with the other rules; finalising reads them from the opening, never today's configuration. The
 * unpurchased rule recorded later is audited where it is written, finalising included.
 * Review S-3: "set since the opening started" stays shown, with when and by whom (recordedLater).
 * Review S-5: the estimate card tells "not needed" from "not set"; a voluntary estimate disclosed
 * with its paper copy left unanswered reads "Paper copy not compared".
 */

const TZ = "Asia/Kuala_Lumpur";
const policy = { invitedCountReading: "PURCHASERS" as const, invitedCountProvenance: "STATED", qualifiedLabelEn: "Layak", notQualifiedLabelEn: "Tidak layak", lowestLabelEn: "Terendah", qualifiedLabelMs: "Layak", notQualifiedLabelMs: "Tidak layak", lowestLabelMs: "Tawaran terendah", labelsProvenance: "ASSUMED" };

describe("the readings frozen at the start (R-4)", () => {
  it("the reading and the words, with their provenance", () => {
    const f = openingPolicyFrozen(policy);
    expect(f.invited).toEqual({ reading: "PURCHASERS", provenance: "STATED" });
    expect(summaryLabelsOf({ ...policyOf({}), ...f })).toEqual({ qualified: "Layak", notQualified: "Tidak layak", lowest: "Terendah" });
    expect(f.summaryLabels.lowestMs).toBe("Tawaran terendah");
  });
  it("no policy: frozen as not set; an opening started before this froze nothing and reads as not set, never today's", () => {
    expect(openingPolicyFrozen(null).invited).toEqual({ reading: null, provenance: null });
    expect(policyOf({}).invited).toEqual({ reading: null, provenance: null });
    expect(summaryLabelsOf(policyOf({}))).toEqual({ qualified: null, notQualified: null, lowest: null });
  });
  it("the start refuses where the reading is unset (it would make finalising impossible), naming the setting", () => {
    expect(frozenRuleFaults({ completenessEliminates: true, checklist: { notJudged: [] }, invitedReading: null }).map((f) => f.code)).toEqual(["READING_NOT_SET"]);
    expect(frozenRuleFaults({ completenessEliminates: true, checklist: { notJudged: [] }, invitedReading: "INVITEES" })).toEqual([]);
  });
  it("finalising reads the frozen reading and words, and the start freezes them", () => {
    const actions = readFileSync("src/app/sourcing/[id]/opening/actions.ts", "utf8");
    const finalise = actions.slice(actions.indexOf("export async function finaliseOpening"), actions.indexOf("export async function recordCopyExplanation"));
    expect(finalise).not.toMatch(/c\.openingPolicy/);
    expect(finalise).toMatch(/invitedReading: snap\.invited\.reading/);
    expect(finalise).toMatch(/invited: \{ reading: snap\.invited\.reading/);
    expect(finalise).toMatch(/labels: summaryLabelsOf\(snap\)/);
    expect(finalise).toMatch(/invitedReadingProvenance: snap\.invited\.provenance/);
    const start = actions.slice(actions.indexOf("export async function startOpening"), actions.indexOf("export async function startSupplementaryOpening"));
    expect(start).toMatch(/\.\.\.openingPolicyFrozen\(c\.openingPolicy\)/);
    expect(start).toMatch(/invitedReading: c\.openingPolicy\?\.invitedCountReading \?\? null/);
  });
  it("the unpurchased rule written at finalising is audited in the same transaction, and only where an offer needs it", () => {
    const actions = readFileSync("src/app/sourcing/[id]/opening/actions.ts", "utf8");
    const finalise = actions.slice(actions.indexOf("export async function finaliseOpening"), actions.indexOf("export async function recordCopyExplanation"));
    expect(finalise).toMatch(/const recordRule = unpurchased\.record && o\.bids\.some\(\(b\) => b\.saleFinding !== "LIVE_SALE"\)/);
    expect(finalise).toMatch(/if \(recordRule\) \{\s*const a = unpurchasedRecordAudit\(/);
  });
});

describe("the unpurchased rule set since the start (S-3, OD-4)", () => {
  const unset = policyOf({ unpurchased: { consequence: null, provenance: null } });
  const at = new Date("2026-11-17T07:20:00Z");
  it("recorded once, with when and by whom", () => {
    const r = unpurchasedRule(unset, { consequence: "REPORT", provenance: "ASSUMED" }, at, "Aminah");
    expect(r.consequence).toBe("REPORT");
    expect(r.record?.unpurchased).toEqual({ consequence: "REPORT", provenance: "ASSUMED", recordedLater: true, recordedAt: "2026-11-17T07:20:00.000Z", recordedBy: "Aminah" });
    expect(unpurchasedRule(r.record!, { consequence: "ELIMINATE", provenance: null }, at, "Bala")).toEqual({ consequence: "REPORT", record: null });
    expect(unpurchasedRule(unset, null, at, "Aminah")).toEqual({ consequence: null, record: null });
  });
  it("once recorded it stays shown as set since the start, read from recordedLater, with when and by whom", () => {
    const recorded = unpurchasedRule(unset, { consequence: "ELIMINATE", provenance: null }, at, "Aminah").record!;
    expect(unpurchasedRuleText(recorded, null, TZ)).toBe("Not carried to evaluation (set since the opening started; recorded on this opening 17 Nov 2026 · 15:20:00 by Aminah)");
    // A rule frozen at the start reads plainly.
    expect(unpurchasedRuleText(policyOf({ unpurchased: { consequence: "REPORT", provenance: "STATED" } }), null, TZ)).toBe("Carried, and reported to the committee");
    expect(unpurchasedRuleText(unset, "REPORT", TZ)).toMatch(/set since the opening started; recorded on this opening when a verdict first needs it/);
    expect(unpurchasedRuleText(unset, null, TZ)).toBe("Not set");
  });
  it("its audit says when and by whom", () => {
    const a = unpurchasedRecordAudit("REPORT", at, "Aminah", TZ);
    expect(a.before).toEqual({ unpurchasedBidRule: "Not set when the opening started" });
    expect(a.after.unpurchasedBidRule).toMatch(/recorded on this opening 17 Nov 2026 · 15:20:00 by Aminah, on their behalf, not signed/);
  });
  it("the Opening section, the Schedule (and so its print) read it from recordedLater", () => {
    const read = readFileSync("src/lib/opening/read.ts", "utf8");
    expect(read).not.toMatch(/snap\.unpurchased\.consequence \? "" : " \(set since the opening started\)"/);
    expect(read).toMatch(/value: unpurchasedRuleText\(snap, c\.method\?\.unpurchasedBidConsequence \?\? null, tz\)/);
    expect(read).toMatch(/\.\.\.\(snap\.unpurchased\.recordedLater \? \[\{ label: "A bid with no live purchase", value: unpurchasedRuleText\(snap, null, tz\) \}\] : \[\]\)/);
    expect(readFileSync("src/app/sourcing/[id]/opening/print/page.tsx", "utf8")).toMatch(/o\.header\.map/);
  });
  it("recordVerdict names who records it", () => {
    const actions = readFileSync("src/app/sourcing/[id]/opening/actions.ts", "utf8");
    const verdict = actions.slice(actions.indexOf("export async function recordVerdict"), actions.indexOf("export async function correctAsRead"));
    // Phase 2b (decisions log, 2026-10-07): the officer who records it is the signed-in one, named from the session; the form no longer carries who.
    expect(verdict).toMatch(/const person = \{ name: actor\.personName \};/);
    expect(verdict).toMatch(/unpurchasedRule\(snap, liveUnpurchased\(c\), now, person\.name\)/);
  });
});

describe("the company estimate's card and the paper copy (S-5)", () => {
  const card = (requires: boolean | null, state: Parameters<typeof estimateCardText>[0]["state"], copyCheck: Parameters<typeof estimateCardText>[0]["copyCheck"] = null) => estimateCardText({ requires, state, copyCheck, sealedText: "Sealed until the schedule is finalised" });
  it("none lodged: needed, not needed and not set read differently", () => {
    expect(card(true, null)).toEqual({ text: "The method needs a company estimate, and none is lodged.", tone: "warn" });
    expect(card(false, null)).toEqual({ text: "Not needed: the method does not need a company estimate, and none is lodged.", tone: "neutral" });
    expect(card(null, null).text).toMatch(/whether the method needs a company estimate is not set/);
    expect(card(null, null).tone).toBe("warn");
    expect(new Set([card(true, null).text, card(false, null).text, card(null, null).text]).size).toBe(3);
  });
  it("a voluntary lodged estimate says its copy may be left unanswered; a required one says it is compared", () => {
    expect(card(false, "LODGED").text).toMatch(/Lodged voluntarily.*may be left unanswered then, and is then not compared/);
    expect(card(true, "LODGED").text).toMatch(/its paper copy compared, only when the opening is finalised/);
  });
  it("disclosed: with a comparison, or 'Paper copy not compared'", () => {
    expect(card(false, "DISCLOSED", null).text).toMatch(/Paper copy not compared\.$/);
    expect(card(true, "DISCLOSED", "MATCH").text).not.toMatch(/not compared/);
  });
  it("the Schedule and the print: disclosed at this opening with no comparison reads 'Paper copy not compared'", () => {
    expect(copyReading(null, true)).toBe("NOT_COMPARED");
    expect(copyReading(null, false)).toBeNull();
    expect(copyReading("MISMATCH", true)).toBe("MISMATCH");
    expect(COPY_NOT_COMPARED_LABEL).toBe("Paper copy not compared");
    const read = readFileSync("src/lib/opening/read.ts", "utf8");
    expect(read).toMatch(/copyReading\(o\.estimateCopyCheck, o\.kind === "MAIN" && o\.finalisedAt != null/);
    expect(readFileSync("src/app/sourcing/[id]/opening/print/page.tsx", "utf8")).toMatch(/\{o\.copy && <p[^>]*>\{o\.copy\.text\}/);
  });
});
