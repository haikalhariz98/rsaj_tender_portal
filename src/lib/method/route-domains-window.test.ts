import { describe, expect, it } from "vitest";

import { exerciseRouteMatter, historyFieldHidden, historyRouteLabel, exerciseRoutePreview, exerciseRoutesOf, invitationFault, nameRoutesOf, routesByDomain, tenderingRoutesOf, windowChangeRoutesOf, type FunderContext } from "./approval";
import { SPEC_MATRIX, SPEC_METHODS } from "./fixture";
import { NAME_APPROVAL_DOMAIN, TENDERING_APPROVAL_DOMAIN, WINDOW_CHANGE_DOMAIN, type Method } from "./types";

/**
 * 6.5 (X-5): the exercise's third route of its own, `window_change` (OD-5), is told apart by its
 * domain like the other two: it never reads as a name or tendering route, an approved one never
 * satisfies the name gate, and the worklist labels it in words. A window change's rows may be
 * written per condition (correction, extension, cancellation); a general row serves any.
 */

type Route = { id: string; domain: string; awardId: string | null; status: "PENDING" | "APPROVED" | "REJECTED" | "RECALLED"; openedAt: Date };
const r = (id: string, domain: string, status: Route["status"], day = "2026-10-01"): Route => ({ id, domain, awardId: null, status, openedAt: new Date(day) });
const m = (code: string): Method => SPEC_METHODS.find((x) => x.code === code)!;

describe("window_change routes", () => {
  const routes = [r("n1", NAME_APPROVAL_DOMAIN, "APPROVED"), r("t1", TENDERING_APPROVAL_DOMAIN, "APPROVED"), r("w1", WINDOW_CHANGE_DOMAIN, "PENDING"), { ...r("a1", "appointment", "PENDING"), awardId: "aw" }];

  it("are split under their own domain, and only there", () => {
    expect(windowChangeRoutesOf(routes).map((x) => x.id)).toEqual(["w1"]);
    expect(routesByDomain(routes)[WINDOW_CHANGE_DOMAIN].map((x) => x.id)).toEqual(["w1"]);
    expect(nameRoutesOf(routes).map((x) => x.id)).toEqual(["n1"]);
    expect(tenderingRoutesOf(routes).map((x) => x.id)).toEqual(["t1"]);
    // Cancelling the exercise withdraws a pending window change with the rest of its own routes.
    expect(exerciseRoutesOf(routes).map((x) => x.id)).toEqual(["n1", "t1", "w1"]);
  });

  it("an approved window change is never an approved name", () => {
    expect(invitationFault(m("selected_tender"), nameRoutesOf([r("w1", WINDOW_CHANGE_DOMAIN, "APPROVED")]))?.code).toBe("NAME_NOT_REQUESTED");
    expect(invitationFault(m("selected_tender"), nameRoutesOf([r("n1", NAME_APPROVAL_DOMAIN, "PENDING"), r("w1", WINDOW_CHANGE_DOMAIN, "APPROVED", "2026-10-02")]))?.code).toBe("NAME_NOT_APPROVED");
  });

  it("the worklist reads it in words and opens Publishing on Tender documents", () => {
    // SR-06 (ruling 9): the Invitation tab is gone; a change to the window is decided from Tender documents, under Publishing.
    expect(exerciseRouteMatter(WINDOW_CHANGE_DOMAIN)).toEqual({ kind: "Change to the invitation window", tab: "documents", section: "publishing", auditNoun: "window change" });
  });
});

describe("the History names a route's rows by its domain, not as a name approval", () => {
  it("each domain has its own name, and its steps", () => {
    expect(historyRouteLabel(NAME_APPROVAL_DOMAIN, "route")).toBe("Name approval");
    expect(historyRouteLabel(WINDOW_CHANGE_DOMAIN, "route")).toBe("Approval of the change to the invitation window");
    expect(historyRouteLabel(WINDOW_CHANGE_DOMAIN, "step")).toBe("Step of the approval of the change to the invitation window");
    expect(historyRouteLabel(NAME_APPROVAL_DOMAIN, "step")).toBe("Step of the name approval");
    expect(historyRouteLabel("tendering_approval", "route")).not.toMatch(/name/i);
  });
});

describe("the History's fields by route domain", () => {
  it("hides the funder's-rules field on a window change only", () => {
    expect(historyFieldHidden(WINDOW_CHANGE_DOMAIN, "fundingOverrideApplied")).toBe(true);
    expect(historyFieldHidden(NAME_APPROVAL_DOMAIN, "fundingOverrideApplied")).toBe(false);
    expect(historyFieldHidden(WINDOW_CHANGE_DOMAIN, "rule")).toBe(false);
    expect(historyFieldHidden(undefined, "fundingOverrideApplied")).toBe(false);
  });
});

describe("a route's condition (window_change rows per correction, extension or cancellation)", () => {
  const general = { ...SPEC_MATRIX.rules.find((x) => x.ruleKey === "NAME_QUOTATION")!, ruleKey: "WC_ANY", domain: WINDOW_CHANGE_DOMAIN, approverCode: "HODIV", recommenders: [] };
  const cancel = { ...general, ruleKey: "WC_CANCEL", cond: "CANCELLATION", approverCode: "FD" };
  const ctx = (rules: typeof SPEC_MATRIX.rules): FunderContext => ({ dal: { ...SPEC_MATRIX, rules: [...SPEC_MATRIX.rules, ...rules] }, override: null, supersedes: false });

  it("a general row serves every condition", () => {
    for (const cond of ["CORRECTION", "EXTENSION", "CANCELLATION"]) expect(exerciseRoutePreview(ctx([general]), WINDOW_CHANGE_DOMAIN, m("selective_quotation"), 80_000, cond).ruleKey).toBe("WC_ANY");
  });
  it("a conditional row takes its condition; the general one the rest", () => {
    expect(exerciseRoutePreview(ctx([general, cancel]), WINDOW_CHANGE_DOMAIN, m("selective_quotation"), 80_000, "CANCELLATION").approverCode).toBe("FD");
    expect(exerciseRoutePreview(ctx([general, cancel]), WINDOW_CHANGE_DOMAIN, m("selective_quotation"), 80_000, "EXTENSION").approverCode).toBe("HODIV");
  });
  it("no row is no rule, never a guess", () => {
    expect(exerciseRoutePreview(ctx([]), WINDOW_CHANGE_DOMAIN, m("selective_quotation"), 80_000, "EXTENSION").state).toBe("NO_RULE");
  });
  it("a domain asked without a condition is unchanged", () => {
    expect(exerciseRoutePreview(ctx([]), NAME_APPROVAL_DOMAIN, m("selective_quotation"), 80_000).ruleKey).toBe("NAME_QUOTATION");
  });
});
