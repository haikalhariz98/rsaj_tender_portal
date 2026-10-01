import { describe, expect, it } from "vitest";

import { appointmentPreview, invitationFault, resolveNameApproval, type FunderContext } from "./approval";
import { SPEC_MATRIX, SPEC_METHODS } from "./fixture";
import type { Method } from "./types";

const ctx: FunderContext = { dal: SPEC_MATRIX, override: null, supersedes: false };
const m = (code: string): Method => SPEC_METHODS.find((x) => x.code === code)!;
const chain = (p: ReturnType<typeof appointmentPreview>) => p.chain.map((s) => `${s.roleCode}:${s.act}`);

describe("direct appointment by value (§4.4, DAL §3.1.4.2 item 1)", () => {
  const who = (v: number) => appointmentPreview(ctx, m("direct"), v);
  it.each([
    [500, "HOD"],
    [500.01, "HODIV"],
    [5_000, "HODIV"],
    [5_000.01, "FD"],
    [15_000, "FD"],
    [15_000.01, "CEO"],
    [300_000.01, "TBC"],
    [3_000_000, "TBC"],
    [3_000_000.01, "CHAIR"],
    [5_000_000.01, "BOD"],
  ])("RM%s is approved by %s", (v, approver) => {
    expect(who(v).approverCode).toBe(approver);
  });
  it("the quotation band carries the Quotation Committee's mandatory recommendation", () => {
    expect(chain(who(100_000))).toEqual(["QC:MR", "CEO:A"]);
  });
  it("above RM3M the Tender Board recommends and the Chairman approves; above RM5M the Board", () => {
    expect(chain(who(4_000_000))).toEqual(["TBC:MR", "CHAIR:A"]);
    expect(chain(who(6_000_000))).toEqual(["TBC:MR", "BOD:A"]);
  });
});

describe("the D13 asymmetry is configuration, asserted and not fixed", () => {
  it("an RM50M open tender stops at the Tender Board; an RM6M direct appointment goes to the Board", () => {
    expect(appointmentPreview(ctx, m("open_tender"), 50_000_000).approverCode).toBe("TBC");
    expect(appointmentPreview(ctx, m("direct"), 6_000_000).approverCode).toBe("BOD");
  });
});

describe("approval of the name (FR-MTD-008)", () => {
  it("selected tender: C&P proposes with a mandatory recommendation, Head of Division jointly recommends, FD recommends, CEO approves", () => {
    const r = resolveNameApproval(ctx, m("selected_tender"), 420_000);
    expect(r.nameState).toBe("RESOLVED");
    expect(chain(r)).toEqual(["CP:P", "CP:MR", "HODIV:JR", "FD:R", "CEO:A"]);
  });
  it("selective quotation: Head of Department proposes and jointly recommends through C&P, Head of Division recommends, FD approves", () => {
    const r = resolveNameApproval(ctx, m("selective_quotation"), 80_000);
    expect(chain(r)).toEqual(["HOD:P", "HOD:JR", "HODIV:R", "FD:A"]);
  });
  it("is not asked of a method that does not require it", () => {
    expect(resolveNameApproval(ctx, m("open_tender"), 420_000).nameState).toBe("NOT_REQUIRED");
  });
  it("a route with a committee step is refused with its exit, not left undischargeable", () => {
    const withCommittee = {
      ...SPEC_MATRIX,
      rules: SPEC_MATRIX.rules.map((r) => (r.ruleKey === "NAME_QUOTATION" ? { ...r, recommenders: [...r.recommenders, { roleCode: "QC", act: "R" as const }] } : r)),
    };
    expect(resolveNameApproval({ ...ctx, dal: withCommittee }, m("selective_quotation"), 80_000).nameState).toBe("HAS_COMMITTEE_STEP");
  });
  it("no rule for the method's key is said, not guessed", () => {
    const none = { ...SPEC_MATRIX, rules: SPEC_MATRIX.rules.filter((r) => r.domain !== "name_approval") };
    expect(resolveNameApproval({ ...ctx, dal: none }, m("selected_tender"), 420_000).nameState).toBe("NO_RULE");
  });
});

describe("the invitation gate on the name (built here, enforced by 6.5)", () => {
  const d = new Date("2026-09-01");
  it("a pending name approval stops invitation", () => {
    expect(invitationFault(m("selected_tender"), [{ status: "PENDING", openedAt: d }])?.code).toBe("NAME_NOT_APPROVED");
  });
  it("none requested, or recalled, stops it too; refused stops it", () => {
    expect(invitationFault(m("selected_tender"), [])?.code).toBe("NAME_NOT_REQUESTED");
    expect(invitationFault(m("selected_tender"), [{ status: "RECALLED", openedAt: d }])?.code).toBe("NAME_NOT_REQUESTED");
    expect(invitationFault(m("selected_tender"), [{ status: "REJECTED", openedAt: d }])?.code).toBe("NAME_REJECTED");
  });
  it("the latest route decides, and approval clears it", () => {
    expect(invitationFault(m("selected_tender"), [{ status: "REJECTED", openedAt: d }, { status: "APPROVED", openedAt: new Date("2026-09-02") }])).toBeNull();
    expect(invitationFault(m("open_tender"), [])).toBeNull();
  });
});

describe("emergency works (FR-REQ-013)", () => {
  it("RM12,000 routes as a direct appointment of RM12,000 does, with no post-approval step", () => {
    const emergency = appointmentPreview(ctx, m("emergency"), 12_000);
    const direct = appointmentPreview(ctx, m("direct"), 12_000);
    expect(emergency.approverCode).toBe("FD");
    expect(emergency.chain).toEqual(direct.chain);
    expect(emergency.chain.at(-1)?.act).toBe("A");
  });
});

describe("a method not tied to the matrix", () => {
  it("says so rather than routing it anywhere", () => {
    expect(appointmentPreview(ctx, m("call_off"), 12_000).state).toBe("NO_METHOD_KEY");
    expect(appointmentPreview(ctx, null, 12_000).state).toBe("DEPENDS_ON_METHOD");
  });
  it("the specialist method names the technical committee (FR-REQ-014)", () => {
    const p = appointmentPreview(ctx, m("specialist"), 40_000);
    expect(p.committeeCode).toBe("TECH");
    expect(m("specialist").requiresJustification).toBe(true);
  });
});

describe("name routes opened the same day (review #4)", () => {
  it("are ordered by the day, then by when they were written", async () => {
    const { latestFirst } = await import("./approval");
    const day = new Date("2026-09-21");
    const a = { id: "a", openedAt: day, createdAt: new Date("2026-09-21T02:00:00Z") };
    const b = { id: "b", openedAt: day, createdAt: new Date("2026-09-21T05:00:00Z") };
    expect(latestFirst([a, b]).map((x) => x.id)).toEqual(["b", "a"]);
    expect(latestFirst([b, a]).map((x) => x.id)).toEqual(["b", "a"]);
    const approvedEarlier = { status: "APPROVED" as const, openedAt: day, createdAt: new Date("2026-09-21T02:00:00Z") };
    const pendingLater = { status: "PENDING" as const, openedAt: day, createdAt: new Date("2026-09-21T05:00:00Z") };
    expect(invitationFault(m("selected_tender"), [approvedEarlier, pendingLater])?.code).toBe("NAME_NOT_APPROVED");
  });
  it("fall back to the id when written in the same instant (ruling on BD-17)", async () => {
    const { latestFirst } = await import("./approval");
    const day = new Date("2026-09-21");
    const at = new Date("2026-09-21T02:00:00Z");
    const a = { id: "cm_a", openedAt: day, createdAt: at };
    const b = { id: "cm_b", openedAt: day, createdAt: at };
    expect(latestFirst([a, b]).map((x) => x.id)).toEqual(["cm_b", "cm_a"]);
    expect(latestFirst([b, a]).map((x) => x.id)).toEqual(["cm_b", "cm_a"]);
    const approved = { id: "cm_a", status: "APPROVED" as const, openedAt: day, createdAt: at };
    const pending = { id: "cm_b", status: "PENDING" as const, openedAt: day, createdAt: at };
    expect(invitationFault(m("selected_tender"), [approved, pending])?.code).toBe("NAME_NOT_APPROVED");
    expect(invitationFault(m("selected_tender"), [pending, approved])?.code).toBe("NAME_NOT_APPROVED");
  });
});

describe("a name route's label (ruling on BD-5)", () => {
  it("reads a route withdrawn on change as such, never recalled", async () => {
    const { nameRouteLabel } = await import("./approval");
    expect(nameRouteLabel("RECALLED", [{ code: "WITHDRAWN_ON_CHANGE" }])).toBe("Withdrawn on change");
    expect(nameRouteLabel("RECALLED", [{ code: "WITHDRAWN_ON_CANCEL" }])).toBe("Withdrawn: exercise cancelled");
    expect(nameRouteLabel("RECALLED", null)).not.toMatch(/recall/i);
    expect(nameRouteLabel("PENDING", [])).toBe("In progress");
  });
});

describe("requesting the name (ruling on BD-4)", () => {
  it("is allowed in preparation, and again after a refusal or withdrawal", async () => {
    const { nameRequestFault } = await import("./approval");
    expect(nameRequestFault("DOCUMENTS_IN_PREPARATION", m("selected_tender"), [], "2026-09-30")).toBeNull();
    expect(nameRequestFault("DRAFT", m("selected_tender"), [{ status: "REJECTED" }, { status: "RECALLED" }], "2026-09-30")).toBeNull();
  });
  it("is refused while one is open or approved, on a cancelled exercise, or for a method that does not ask", async () => {
    const { nameRequestFault } = await import("./approval");
    expect(nameRequestFault("DOCUMENTS_IN_PREPARATION", m("selected_tender"), [{ status: "PENDING" }], "2026-09-30")?.code).toBe("NAME_ALREADY_REQUESTED");
    expect(nameRequestFault("DRAFT", m("selected_tender"), [{ status: "APPROVED" }], "2026-09-30")?.code).toBe("NAME_ALREADY_REQUESTED");
    expect(nameRequestFault("CANCELLED", m("selected_tender"), [], "2026-09-30")?.code).toBe("NAME_EXERCISE_CANCELLED");
    expect(nameRequestFault("DRAFT", m("open_tender"), [], "2026-09-30")?.code).toBe("NAME_NOT_ASKED");
    expect(nameRequestFault("DRAFT", m("selected_tender"), [], null)?.code).toBe("TIME_ZONE_UNSET");
  });
  it("waits for the officer's choice where a refusal decided nothing (FR-APR-016, CO-5)", async () => {
    const { nameRequestFault } = await import("./approval");
    expect(nameRequestFault("DRAFT", m("selected_tender"), [{ status: "REJECTED", rejectionApplied: null, rejectionChoices: ["RETURN_TO_ORIGINATOR"] }], "2026-09-30")?.code).toBe("NAME_REJECTION_UNRESOLVED");
    expect(nameRequestFault("DRAFT", m("selected_tender"), [{ status: "REJECTED", rejectionApplied: "RETURN_TO_ORIGINATOR", rejectionChoices: ["RETURN_TO_ORIGINATOR"] }], "2026-09-30")).toBeNull();
  });
});

describe("a requester who holds a step of the name's route (review #5)", () => {
  it("escalates the approval as 6.1's self-approval rule does", async () => {
    const { nameRouteForRequester } = await import("./approval");
    const dal = { ...SPEC_MATRIX, roles: { ...SPEC_MATRIX.roles, FD: { ...SPEC_MATRIX.roles.FD, selfApprovalEscalatesToCode: "CEO" } } };
    const r = nameRouteForRequester({ ...ctx, dal }, m("selective_quotation"), 80_000, { holds: (c) => c === "FD", soleHolder: () => false });
    expect(r.refusal).toBeNull();
    expect(r.approverCode).toBe("CEO");
    expect(chain(r)).toContain("FD:R");
  });
  it("refuses at request time, naming the setting, when there is nowhere to escalate", async () => {
    const { nameRouteForRequester } = await import("./approval");
    const r = nameRouteForRequester(ctx, m("selective_quotation"), 80_000, { holds: (c) => c === "FD", soleHolder: () => false });
    expect(r.refusal).toMatch(/self-approval escalates/);
  });
  it("says so where only a delegate could decide a step the requester alone holds", async () => {
    const { nameRouteForRequester } = await import("./approval");
    const r = nameRouteForRequester(ctx, m("selective_quotation"), 80_000, { holds: (c) => c === "HODIV", soleHolder: (c) => c === "HODIV" });
    expect(r.refusal).toBeNull();
    expect(r.warnings.map((w) => w.code as string)).toContain("REQUESTER_HOLDS_STEP");
  });
});
