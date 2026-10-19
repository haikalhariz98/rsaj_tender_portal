import { describe, expect, it } from "vitest";

import { ACT_STATUS, actStatusFault, actStatusWords, CONTRACT_ACTS, EDGE_EXCEPTIONS, WRITER_FAMILY, WRITER_ROW_EXCEPTIONS, type ContractAct } from "./act-status";
import { CONTRACT_TRANSITIONS, STATUS_WRITTEN_BY, type StatusWriter } from "./status";
import { CONTRACT_STATUSES, type ContractStatus } from "./types";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/**
 * 6.13 Part B Run 1a fix round (BD-613-119 R1, merged with the code review's S2): the act × status table and the
 * transitions agree. (a) Every edge of CONTRACT_TRANSITIONS can be taken: the family of the act that writes it is allowed
 * in the state it leaves. (b) Every state a status writer's family allows, other than the state it writes, has an edge
 * to that state. Where neither holds, the state is removed from the row or listed as a named exception with its reason.
 */

/// The family whose act takes an edge: the state's writer where one is named; the formation's acts before execution.
const edgeFamily = (to: ContractStatus): ContractAct | null => {
  const w = STATUS_WRITTEN_BY[to];
  if (w) return WRITER_FAMILY[w];
  return to === "CANCELLED" ? null : "FORMATION";
};

describe("(a) every transition can be taken by its writer's family", () => {
  it("the writer's family is allowed in the state the edge leaves, or the edge is a named exception", () => {
    const missing: string[] = [];
    for (const from of CONTRACT_STATUSES) {
      for (const to of CONTRACT_TRANSITIONS[from]) {
        const fam = edgeFamily(to);
        const key = `${from} → ${to}`;
        if (EDGE_EXCEPTIONS[key]) continue;
        if (!fam || ACT_STATUS[fam][from] !== "ALLOWED") missing.push(`${key} (${fam ?? "no family"})`);
      }
    }
    expect(missing).toEqual([]);
  });
  it("every named edge exception is an edge, and says why", () => {
    for (const [key, reason] of Object.entries(EDGE_EXCEPTIONS)) {
      const [from, to] = key.split(" → ") as [ContractStatus, ContractStatus];
      expect(CONTRACT_TRANSITIONS[from], key).toContain(to);
      expect(reason.length, key).toBeGreaterThan(40);
    }
  });
});

describe("(b) every state a writer's family allows leads to the state it writes", () => {
  it("each such state has an edge to the written state, or is a named exception", () => {
    const missing: string[] = [];
    for (const [to, writer] of Object.entries(STATUS_WRITTEN_BY) as [ContractStatus, StatusWriter][]) {
      const fam = WRITER_FAMILY[writer];
      for (const s of CONTRACT_STATUSES) {
        if (s === to || ACT_STATUS[fam][s] !== "ALLOWED") continue;
        if (CONTRACT_TRANSITIONS[s].includes(to)) continue;
        if (WRITER_ROW_EXCEPTIONS[fam]?.states.includes(s)) continue;
        missing.push(`${fam} in ${s} (writes ${to})`);
      }
    }
    expect(missing).toEqual([]);
  });
  it("every named row exception is a state its family allows with no edge, and says why", () => {
    for (const [fam, ex] of Object.entries(WRITER_ROW_EXCEPTIONS) as [ContractAct, { states: ContractStatus[]; reason: string }][]) {
      const writer = (Object.keys(WRITER_FAMILY) as StatusWriter[]).find((w) => WRITER_FAMILY[w] === fam)!;
      const to = (Object.keys(STATUS_WRITTEN_BY) as ContractStatus[]).find((s) => STATUS_WRITTEN_BY[s] === writer)!;
      for (const s of ex.states) {
        expect(ACT_STATUS[fam][s], `${fam} ${s}`).toBe("ALLOWED");
        expect(CONTRACT_TRANSITIONS[s], `${fam} ${s}`).not.toContain(to);
      }
      expect(ex.reason.length, fam).toBeGreaterThan(40);
    }
  });
  it("each writer reads a family of the table", () => {
    expect(WRITER_FAMILY).toEqual({ POSSESSION: "SUPERVISION", PRACTICAL_COMPLETION: "COMPLETION", MAKING_GOOD: "MAKING_GOOD", FINAL_CERTIFICATE: "FINAL_ACCOUNT", TERMINATION: "TERMINATION_CASE", CLOSE: "CLOSE" });
    for (const f of Object.values(WRITER_FAMILY)) expect(CONTRACT_ACTS).toContain(f);
  });
});

describe("R1, R3, R4 and BD-613-113's rows", () => {
  it("R1: a terminated contract is closed (TERMINATED → CLOSED is reachable)", () => {
    expect(actStatusFault("CLOSE", "TERMINATED")).toBeNull();
    expect(actStatusFault("CLOSE", "FINAL_CERTIFICATE_ISSUED")).toBeNull();
  });
  it("R3: the termination case only while active or once terminated; completion, defects, rectification and making good begin at Active", () => {
    for (const s of CONTRACT_STATUSES) expect(ACT_STATUS.TERMINATION_CASE[s] === "ALLOWED", s).toBe(s === "ACTIVE" || s === "TERMINATED");
    for (const a of ["COMPLETION", "DEFECTS", "RECTIFICATION", "MAKING_GOOD"] as const) {
      for (const s of ["EXECUTED", "STAMPED"] as const) expect(actStatusFault(a, s), `${a} ${s}`).toEqual({ code: "NOT_IN_STATUS", level: "block", data: { status: s } });
      expect(ACT_STATUS[a].ACTIVE, a).toBe("ALLOWED");
    }
  });
  it("R4: a period extension extends a running term: not once practically complete", () => {
    expect(ACT_STATUS.PERIOD_EXTENSION.PRACTICALLY_COMPLETE).toBe("REFUSED");
    expect(ACT_STATUS.PERIOD_EXTENSION.ACTIVE).toBe("ALLOWED");
  });
  it("BD-613-113: a security's and the design guarantee bond's release in TERMINATED, so an unclaimed bond never blocks closure", () => {
    expect(actStatusFault("SECURITY_RELEASE", "TERMINATED")).toBeNull();
    expect(actStatusFault("DESIGN_BOND_RELEASE", "TERMINATED")).toBeNull();
  });
  it("NOT_IN_STATUS names the state it refuses in, in English and Malay", () => {
    expect(actStatusWords(actStatusFault("COMPLETION", "STAMPED")!)).toEqual({ en: "Not recorded while the contract stands at “Stamped, fully executed”." });
  });
});
