import { describe, expect, it } from "vitest";

import { BQ_SCOPED_BY, BQ_ITEM_KINDS } from "./types";
import { BQ_READABLE_STATEMENT, ESTIMATE_SEALED_STATEMENT, ESTIMATE_STATE_LABEL, EVENT_KIND_LABEL, firmValueText, ITEM_KIND_LABEL, LEAD_STATE_BADGE, leadTimeText, PACK_CARD_HEADING, PANEL_STATE_LABEL, SCOPE_CODES, scopeFaultText, SCOPED_BY_LABEL, sealedVersion, signatoriesText, sharePercentText, estimateEmptyState, leadConfiguredText } from "./labels";

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

describe("the unqualified-preparer refusal points to where qualifications are set", () => {
  it("names Configuration, Scope and estimate, not Users and roles", () => {
    const text = scopeFaultText({ code: "PREPARER_NOT_QUALIFIED", level: "block", data: { qualification: "Quantity surveyor", on: "2026-10-01" } });
    expect(text).toContain("Configuration, Scope and estimate");
    expect(text).not.toContain("Users and roles");
    expect(scopeFaultText("PREPARER_NOT_QUALIFIED")).toContain("Configuration, Scope and estimate");
  });
});

describe("an estimate refusal is rendered from its code alone (refuseCodes passes no data)", () => {
  it("TOO_LARGE reads as a fixed sentence with no figure", () => {
    const t = scopeFaultText("TOO_LARGE");
    expect(t).toBe("The figure is too large to record: an amount holds at most 16 digits before the decimal point.");
    expect(t).not.toMatch(/\d{3,}/);
  });
});

describe("signatoriesText", () => {
  it("a count of people with the most the form allows, never 'x of y'", () => {
    expect(signatoriesText(3, 6)).toBe("3 (at most 6)");
    expect(signatoriesText(0, 6)).toBe("0 (at most 6)");
    expect(signatoriesText(3, null)).toBe("3 · No limit set");
  });
});

describe("sharePercentText: a share to one decimal place, half up, from the exact string", () => {
  it("rounds without floats", () => {
    expect(sharePercentText("6.4101")).toBe("6.4%");
    expect(sharePercentText("35.0000")).toBe("35.0%");
    expect(sharePercentText("6.45")).toBe("6.5%");
    expect(sharePercentText("6.449999")).toBe("6.4%");
    expect(sharePercentText("99.96")).toBe("100.0%");
    expect(sharePercentText("0.04")).toBe("0.0%");
    expect(sharePercentText("0.05")).toBe("0.1%");
    expect(sharePercentText("100")).toBe("100.0%");
    expect(sharePercentText("12.3")).toBe("12.3%");
  });
});

describe("estimateEmptyState: the empty Company estimate section follows the method's rule", () => {
  it("not needed says where that came from; not set is never 'not needed'; needed asks for one", () => {
    expect(estimateEmptyState({ required: false, provenance: "ASSUMED" }, false).title).toBe("Not needed for this method (assumed)");
    expect(estimateEmptyState({ required: false, provenance: "STATED" }, false).title).toBe("Not needed for this method (stated)");
    expect(estimateEmptyState({ required: false, provenance: null }, false).title).toBe("Not needed for this method");
    const unset = estimateEmptyState({ required: null, provenance: null }, false);
    expect(unset.state).toBe("RULE_NOT_SET");
    expect(unset.title).toBe("Whether one is needed is not set");
    expect(unset.body).toContain("Configuration, Scope and estimate");
    expect(estimateEmptyState({ required: true, provenance: "ASSUMED" }, false).state).toBe("NEEDED");
    expect(estimateEmptyState({ required: true, provenance: null }, true).body).toMatch(/voided/);
    expect(estimateEmptyState(null, false).state).toBe("METHOD_GONE");
  });
});

describe("leadConfiguredText", () => {
  it("states the configured days, or that none is configured", () => {
    expect(leadConfiguredText(7)).toBe("The configured lead is 7 days before the closing day.");
    expect(leadConfiguredText(1)).toBe("The configured lead is 1 day before the closing day.");
    expect(leadConfiguredText(null)).toBe("No lead time is configured.");
  });
});
