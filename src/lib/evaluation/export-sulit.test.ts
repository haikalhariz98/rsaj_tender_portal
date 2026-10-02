import { describe, expect, it } from "vitest";

import { diffFields } from "@/lib/audit/diff";
import { auditCsv, SULIT_WITHHELD, type ExportRow } from "@/lib/audit/export";
import { parseSen } from "@/lib/money";
import { isSulitField, SULIT_FIELDS } from "@/lib/sulit-fields";

import { aspectPrefill } from "./aspects";
import { aspectFields, closeFields, EVALUATION_ENTITY, recommendationFields } from "./audit-view";

/**
 * 6.8 fix R-5 and Q2 (NFR-SEC-002, FR-EVL-014, E-3): the evaluation's free text that judges or quotes a
 * price — an aspect's narrative, a meeting's minutes — and the recommended tenderer before the Board
 * decides never leave in the audit export; each change is listed, its values withheld. The History
 * chips them by the same registry (`isSulitField`). The price variance is never prefilled into a
 * narrative.
 */

const row = (id: string, entity: string, label: string, changes: unknown): ExportRow => ({ id, at: new Date("2026-10-02T03:00:00Z"), entity, entityId: id, entityLabel: label, action: "CREATE", changes, reason: "", unattributed: true, actorName: null });
const changesOf = (file: string, n: number) => {
  const line = file.split("\r\n")[n];
  return JSON.parse(line.slice(line.indexOf('"['), line.lastIndexOf(']"') + 2).slice(1, -1).replace(/""/g, '"')) as { field: string; before: string | null; after: string | null }[];
};

describe("the evaluation's SULIT text in the export file (R-5, Q2)", () => {
  const aspect = row("a1", EVALUATION_ENTITY.aspect, "DEMO/SX/0021/2026 · Evaluation, version 1 · Aspects · bid No. 2", diffFields(null, aspectFields({ aspect: "Price against the company estimate", kind: "PRICE_VS_ESTIMATE", verdict: "SATISFACTORY", narrative: "At RM 98,400.00 it is 3.2% under the estimate.", by: "Chen" })));
  const meeting = row("m1", EVALUATION_ENTITY.meeting, "DEMO/SX/0021/2026 · Evaluation, version 1 · Negotiation with bid No. 2, round 1", diffFields({ closed: null }, closeFields({ minutes: "The tenderer agreed to RM 95,000.00 for the whole works.", priceBefore: parseSen("98400.00"), priceAfter: parseSen("95000.00"), by: "Chen", at: new Date("2026-10-02T03:00:00Z") }, "Asia/Kuala_Lumpur")));
  const rec = row("r1", EVALUATION_ENTITY.recommendation, "DEMO/SX/0021/2026 · Evaluation, version 1 · Recommendation", diffFields(null, recommendationFields({ bidder: "No. 2, Syarikat Bina Jaya Sdn Bhd", price: parseSen("95000.00"), period: "12 weeks", topRanked: true, justification: "", by: "Chen" })));
  const file = auditCsv([aspect, meeting, rec], "Asia/Kuala_Lumpur");

  it("the file's bytes hold no narrative, no minutes, no price and no recommended tenderer", () => {
    for (const v of ["98,400.00", "3.2%", "95,000.00", "RM 95,000", "agreed to", "Syarikat Bina Jaya"]) expect(file).not.toContain(v);
  });
  it("each change is still listed, its values withheld; the verdict and who recorded it read as before", () => {
    const a = changesOf(file, 1);
    expect(a.find((c) => c.field === "Narrative")?.after).toBe(SULIT_WITHHELD);
    expect(a.find((c) => c.field === "Verdict")?.after).toBe("Satisfactory");
    const m = changesOf(file, 2);
    expect(m.find((c) => c.field === "Meeting minutes")?.after).toBe(SULIT_WITHHELD);
    const r = changesOf(file, 3);
    expect(r.find((c) => c.field === "Recommended tenderer")?.after).toBe(SULIT_WITHHELD);
    expect(r.find((c) => c.field === "Top ranked")?.after).toBe("yes");
  });
  it("the keys are registered (so the History chips them), the bare words are not", () => {
    for (const f of ["narrative", "meetingMinutes", "recommendedTenderer"]) expect(isSulitField(f), f).toBe(true);
    // `recommended` is a boolean key elsewhere and `minutes` a sitting's minutes: the whole-word scan would misread both.
    for (const f of ["recommended", "minutes"]) expect(SULIT_FIELDS.map((x) => x.field)).not.toContain(f);
  });
  it("the audit rows write under the registered keys", () => {
    expect(Object.keys(aspectFields({ aspect: "x", kind: "OTHER", verdict: "SATISFACTORY", narrative: "n", by: "b" }))).toContain("narrative");
    expect(Object.keys(closeFields({ minutes: "m", priceBefore: null, priceAfter: null, by: "b", at: new Date() }, null))).toEqual(expect.arrayContaining(["meetingMinutes"]));
    expect(Object.keys(closeFields({ minutes: "m", priceBefore: null, priceAfter: null, by: "b", at: new Date() }, null))).not.toContain("minutes");
    const keys = Object.keys(recommendationFields({ bidder: "x", price: 1n, period: "p", topRanked: true, justification: "", by: "b" }));
    expect(keys).toContain("recommendedTenderer");
    expect(keys).not.toContain("recommended");
  });
});

describe("the price variance is never prefilled into a narrative (R-5)", () => {
  it("aspect (b): the narrative starts empty; the variance is a guide shown beside the form", () => {
    const s = aspectPrefill("PRICE_VS_ESTIMATE", { missingAtOpening: [], priceAsRead: parseSen("280500.00"), correctedPrice: null }, { value: parseSen("330000.00"), label: null });
    expect(s.narrative).toBe("");
    expect(s.narrative).not.toMatch(/\d/);
    expect(s.guide).toMatch(/15\.00%/);
  });
});
