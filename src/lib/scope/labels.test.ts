import { describe, expect, it } from "vitest";

import { BQ_SCOPED_BY, BQ_ITEM_KINDS } from "./types";
import { BQ_READABLE_STATEMENT, ESTIMATE_SEALED_STATEMENT, ESTIMATE_STATE_LABEL, EVENT_KIND_LABEL, firmValueText, ITEM_KIND_LABEL, LEAD_STATE_BADGE, leadTimeText, PACK_CARD_HEADING, PANEL_STATE_LABEL, SCOPE_CODES, scopeFaultText, SCOPED_BY_LABEL, sealedVersion } from "./labels";

describe("every code has words, and no words are a code (AGENTS.md rule 5)", () => {
  it("each code renders a sentence that is not the code", () => {
    for (const c of SCOPE_CODES) {
      const t = scopeFaultText({ code: c, level: "block", data: { count: 2, first: "B", column: "Checked by", signatories: 4, limit: 3, versionNo: 2, qualification: "Qualified measurer", on: "2026-10-01" } });
      expect(t, c).not.toContain(c);
      expect(t, c).toMatch(/[.!?]$/);
      expect(t, c).not.toMatch(/\b[A-Z]{2,}_[A-Z_]+\b/);
    }
  });
  it("an unknown code reads as a plain refusal, never the code", () => {
    expect(scopeFaultText({ code: "SOMETHING_NEW", level: "block" })).toBe("This was refused.");
  });
  it("enum labels are complete", () => {
    for (const s of BQ_SCOPED_BY) expect(SCOPED_BY_LABEL[s]).toBeTruthy();
    for (const k of BQ_ITEM_KINDS) expect(ITEM_KIND_LABEL[k]).toBeTruthy();
    for (const s of ["DRAFT", "LODGED", "DISCLOSED", "VOID"] as const) expect(ESTIMATE_STATE_LABEL[s]).toBeTruthy();
    for (const s of ["NONE", "DRAFT", "VERIFIED", "SCAN_GONE"] as const) expect(PANEL_STATE_LABEL[s]).toBeTruthy();
    for (const k of ["PREPARED", "AMENDED", "LODGED", "RETAINED", "LATE_OVERRIDE", "DISCLOSED", "VOIDED"] as const) expect(EVENT_KIND_LABEL[k]).toBeTruthy();
  });
});

describe("the lead-time badge", () => {
  it("every state has a badge that is words, never the code", () => {
    for (const s of ["READY", "LATE", "NOT_PREPARED", "LEAD_NOT_SET", "CLOSING_NOT_SET", "TIME_ZONE_NOT_SET"] as const) {
      expect(LEAD_STATE_BADGE[s].label).toBeTruthy();
      expect(LEAD_STATE_BADGE[s].label).not.toMatch(/_/);
    }
  });
});

describe("the statements the screens carry", () => {
  it("the estimate callout names the Phase 3 electronic tender box (6.2 conditions)", () => {
    expect(ESTIMATE_SEALED_STATEMENT).toMatch(/electronic tender box \(Phase 3\)/);
    expect(ESTIMATE_SEALED_STATEMENT).toMatch(/withheld from every screen, including this one/);
  });
  it("the BQ tab says priced rates are readable by anyone (OD-8); the pack card says not yet enforced (OD-4)", () => {
    expect(BQ_READABLE_STATEMENT).toMatch(/readable by anyone/);
    expect(PACK_CARD_HEADING).toMatch(/not yet enforced/);
  });
  it("sealed rows and an unstated firm value", () => {
    expect(sealedVersion(2)).toBe("Sealed (version 2)");
    expect(firmValueText(null)).toBe("Not stated");
  });
  it("closing not set reads 'Closing not set' (X-1)", () => {
    expect(leadTimeText({ state: "CLOSING_NOT_SET" })).toMatch(/^Closing not set/);
    expect(leadTimeText({ state: "LATE", lastPermittedDay: "2026-11-12", lastVersionDay: "2026-11-13" })).toMatch(/^Late/);
  });
});

describe("the estimate's refusals read whole without their data (codes only, OD-1)", () => {
  it("no sentence depends on a finding's data to make sense", () => {
    for (const c of SCOPE_CODES) expect(scopeFaultText(c), c).not.toMatch(/undefined|null|NaN/);
  });
});
