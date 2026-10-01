import { describe, expect, it } from "vitest";

import { DAL_FIXTURE } from "./dal-fixture";
import { requesterOnlySteps, requesterOnlyText, type AbleToAct } from "./requester-only";
import { resolveApproval } from "./resolve";
import type { ApprovalStep } from "./types";

/**
 * FR-APR-008, ruling R1: nobody decides a step of a matter they raised, so a route on
 * which the requester is the only person able to act for a step is refused at
 * submission, naming the way out.
 */

// Who holds each office on the day, one person each unless a test says otherwise.
const holders = (over: Record<string, AbleToAct> = {}) => (code: string): AbleToAct =>
  over[code] ?? { holderIds: [`${code.toLowerCase()}-holder`], delegateIds: [] };
const sole = (pid: string, delegateIds: string[] = []): AbleToAct => ({ holderIds: [pid], delegateIds });

describe("a step only the requester could decide (FR-APR-008, ruling R1)", () => {
  it("worked example: the sole Functional Director raises a RM420,000 requisition — refused: FD's MR is mandatory, another officer must raise it", () => {
    const { chain } = resolveApproval(DAL_FIXTURE, { domain: "requisition", value: 420_000 });
    expect(chain.map((s) => `${s.roleCode}:${s.act}`)).toEqual(["HOD:P", "HODIV:R", "FD:MR", "CEO:A"]);
    const found = requesterOnlySteps(chain, "fd-1", holders({ FD: sole("fd-1") }));
    expect(found).toEqual([{ kind: "MANDATORY", sequence: 3, roleCode: "FD", act: "MR" }]);
    const text = requesterOnlyText(found[0], "Functional Director");
    expect(text).toMatch(/another officer must raise the requisition/);
    expect(text).not.toMatch(/delegation/i);
  });

  it("a delegation does not clear a mandatory step: a delegate cannot act on it", () => {
    const { chain } = resolveApproval(DAL_FIXTURE, { domain: "requisition", value: 420_000 });
    expect(requesterOnlySteps(chain, "fd-1", holders({ FD: sole("fd-1", ["deputy"]) })).map((s) => s.kind)).toEqual(["MANDATORY"]);
  });

  // HoD R → HoDiv R (downgraded by the self-approval rule) → FD A, as the ruling states
  // the chain. The Appendix B fixture sets no self-approval escalation, so the chain is
  // written out rather than resolved.
  const tenK: ApprovalStep[] = [
    { roleCode: "HOD", act: "R", nonDelegable: false, sourceRuleKey: "REQ_500_TO_50K" },
    { roleCode: "HODIV", act: "R", nonDelegable: false, sourceRuleKey: "REQ_500_TO_50K", note: "downgraded" },
    { roleCode: "FD", act: "A", nonDelegable: false, sourceRuleKey: "REQ_500_TO_50K" },
  ];

  it("worked example: the sole Head of Department raises RM10,000 — refused, naming a delegation for that office or another raiser", () => {
    const found = requesterOnlySteps(tenK, "hod-1", holders({ HOD: sole("hod-1") }));
    expect(found).toEqual([{ kind: "DELEGABLE", sequence: 1, roleCode: "HOD", act: "R" }]);
    const text = requesterOnlyText(found[0], "Head of Department");
    expect(text).toMatch(/Record a delegation of the Head of Department office to another officer/);
    expect(text).toMatch(/or have another officer raise the requisition/);
  });

  it("the same case is allowed once a delegation of that office to another officer is live", () => {
    expect(requesterOnlySteps(tenK, "hod-1", holders({ HOD: sole("hod-1", ["deputy"]) }))).toEqual([]);
  });

  it("a step another holder shares is not refused", () => {
    expect(requesterOnlySteps(tenK, "hod-1", holders({ HOD: { holderIds: ["hod-1", "hod-2"], delegateIds: [] } }))).toEqual([]);
  });

  it("a step marked not delegable, though not a mandatory act, offers no delegation", () => {
    const chain: ApprovalStep[] = [{ roleCode: "HOD", act: "R", nonDelegable: true, sourceRuleKey: "x" }];
    const found = requesterOnlySteps(chain, "hod-1", holders({ HOD: sole("hod-1", ["deputy"]) }));
    expect(found.map((s) => s.kind)).toEqual(["NOT_DELEGABLE"]);
    expect(requesterOnlyText(found[0], "Head of Department")).toMatch(/may not be delegated: another officer must raise/);
  });

  it("a committee's step is never the requester's to decide, and is not judged", () => {
    const { chain } = resolveApproval(DAL_FIXTURE, { domain: "appointment", method: "open_selective", value: 180_000 });
    expect(requesterOnlySteps(chain, "qc-member", holders({ QC: sole("qc-member") }))).toEqual([]);
  });

  it("a requester holding no office on the route, or no requester, is not refused", () => {
    expect(requesterOnlySteps(tenK, "someone-else", holders())).toEqual([]);
    expect(requesterOnlySteps(tenK, null, holders({ HOD: sole("hod-1") }))).toEqual([]);
  });

  it("an office nobody else is able to act for that day leaves the requester alone on it", () => {
    // The only other holder is away: the caller's able-to-act list leaves them out.
    expect(requesterOnlySteps(tenK, "hod-1", holders({ HOD: { holderIds: ["hod-1"], delegateIds: [] } })).length).toBe(1);
  });

  it("cites the customer's clause where one is recorded, and none otherwise", () => {
    const s = { kind: "DELEGABLE" as const, sequence: 1, roleCode: "HOD", act: "R" as const };
    expect(requesterOnlyText(s, "Head of Department", "requisition", "DAL §1.6")).toMatch(/a matter they raised \(DAL §1\.6\)\./);
    expect(requesterOnlyText(s, "Head of Department")).not.toMatch(/§/);
  });
});
