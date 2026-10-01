import { describe, expect, it } from "vitest";

import { DAL_CORE_ROUTING, DAL_FIXTURE } from "./dal-fixture";
import {
  ACT_RANK,
  atLeastAsStrong,
  copyCoreRouting,
  coreChainFaultsAcross,
  coreLevelFaults,
  generateChain,
  originOf,
  routeCoreFields,
  ruleCoreFault,
  stepOrigin,
  type CoreLevelRow,
} from "./core-routing";
import {
  APPROVES_ALONE,
  chainChoiceLabel,
  coreFaultWarning,
  issueRefusal,
  originLabel,
  routeCoreText,
  stepOriginText,
} from "./core-routing-labels";
import { resolveApproval } from "./resolve";
import type { AuthorityAct, CoreLevel, Rule } from "./types";

/**
 * FR-APR-004, §2.2.1: the core routing rule. Read against Appendix B.2 (the test-only
 * fixture's four rows): a rule taking its chain from the core routing gets every core
 * step, may strengthen or add, and never drops or weakens one.
 */

const roles = DAL_FIXTURE.roles;
const rule = (r: Partial<Rule> & Pick<Rule, "ruleKey">): Rule => ({
  domain: "test",
  method: null,
  cond: null,
  minValue: null,
  maxValue: null,
  pctMin: null,
  pctMax: null,
  contractValueMin: null,
  contractValueMax: null,
  followsBoundarySwitch: null,
  labelEn: r.ruleKey,
  labelMs: null,
  proposerCode: null,
  approverCode: null,
  committeeCode: null,
  committeeAct: null,
  nonDelegable: false,
  approverMandatory: false,
  isGap: false,
  gapNote: null,
  note: "",
  clause: "TEST",
  sortOrder: 0,
  recommenders: [],
  generateCoreChain: true,
  coreChainReason: null,
  ...r,
});
const trace = (steps: { roleCode: string; act: string }[]) => steps.map((s) => `${s.roleCode}:${s.act}`);
const ACTS: AuthorityAct[] = ["P", "JP", "R", "JR", "MR", "MJR", "A", "MA"];

describe("(1) the strength order of the acts", () => {
  it("ranks P = JP < R = JR < MR = MJR (ruling OQ-3)", () => {
    expect(ACT_RANK.P).toBe(ACT_RANK.JP);
    expect(ACT_RANK.R).toBe(ACT_RANK.JR);
    expect(ACT_RANK.MR).toBe(ACT_RANK.MJR);
    expect(ACT_RANK.P).toBeLessThan(ACT_RANK.R);
    expect(ACT_RANK.R).toBeLessThan(ACT_RANK.MR);
  });

  // Every pair, read off the rank table by hand: the rule's act on the left.
  const expected: Record<string, string[]> = {
    P: ["P", "JP"],
    JP: ["P", "JP"],
    R: ["P", "JP", "R", "JR"],
    JR: ["P", "JP", "R", "JR"],
    MR: ["P", "JP", "R", "JR", "MR", "MJR"],
    MJR: ["P", "JP", "R", "JR", "MR", "MJR"],
    A: [],
    MA: [],
  };
  it.each(ACTS)("a rule's %s keeps at least the strength of exactly the expected core acts", (ruleAct) => {
    expect(ACTS.filter((core) => atLeastAsStrong(ruleAct, core))).toEqual(expected[ruleAct]);
  });

  it("refuses an approving act beneath the approver, whatever the core act", () => {
    for (const core of ACTS) {
      expect(atLeastAsStrong("A", core)).toBe(false);
      expect(atLeastAsStrong("MA", core)).toBe(false);
      expect(atLeastAsStrong(core, "A")).toBe(false);
      expect(atLeastAsStrong(core, "MA")).toBe(false);
    }
  });

  it("labels an equal-rank swap 'act set', and only a higher rank 'strengthened' (ruling C1)", () => {
    expect(originOf(null, "P")).toBe("CORE");
    expect(originOf("P", "P")).toBe("CORE");
    expect(originOf("JP", "P")).toBe("CORE_ACT_SET");
    expect(originOf("R", "JR")).toBe("CORE_ACT_SET");
    expect(originOf("MJR", "MR")).toBe("CORE_ACT_SET");
    expect(originOf("R", "P")).toBe("CORE_STRENGTHENED");
    expect(originOf("MR", "R")).toBe("CORE_STRENGTHENED");
  });
});

describe("generating a chain from the core routing", () => {
  it("(2) a flagged rule naming nobody beneath its approver gets the whole core row", () => {
    const g = generateChain(rule({ ruleKey: "X", approverCode: "CEO" }), DAL_CORE_ROUTING, roles);
    expect(g.ok && trace(g.steps)).toEqual(["HOD:P", "HODIV:P", "FD:R"]);
    expect(g.ok && g.steps.map((s) => s.origin)).toEqual(["CORE", "CORE", "CORE"]);
    expect(g.ok && g.level.approverCode).toBe("CEO");
  });

  it("(3) example 1's overlay: HoDiv P→R and FD R→MR are strengthened, and FD's MR cannot be delegated", () => {
    const g = generateChain(
      rule({ ruleKey: "REQ", approverCode: "CEO", recommenders: [{ roleCode: "HODIV", act: "R" }, { roleCode: "FD", act: "MR" }] }),
      DAL_CORE_ROUTING,
      roles,
    );
    if (!g.ok) throw new Error(g.fault);
    expect(trace(g.steps)).toEqual(["HOD:P", "HODIV:R", "FD:MR"]);
    expect(g.steps.map((s) => s.origin)).toEqual(["CORE", "CORE_STRENGTHENED", "CORE_STRENGTHENED"]);
    expect(g.steps.find((s) => s.roleCode === "FD")?.nonDelegable).toBe(true);
    expect(g.steps.find((s) => s.roleCode === "HODIV")?.nonDelegable).toBe(false);
  });

  it("(3b) example 2's overlay: HoDiv P→JP is an act set by the rule, not a strengthening", () => {
    const g = generateChain(rule({ ruleKey: "OS", approverCode: "CEO", recommenders: [{ roleCode: "HODIV", act: "JP" }] }), DAL_CORE_ROUTING, roles);
    if (!g.ok) throw new Error(g.fault);
    expect(g.steps.find((s) => s.roleCode === "HODIV")).toMatchObject({ act: "JP", origin: "CORE_ACT_SET" });
  });

  it("(4) a committee the rule adds comes after the core steps, as a committee step", () => {
    const g = generateChain(rule({ ruleKey: "OS", approverCode: "CEO", recommenders: [{ roleCode: "QC", act: "MR" }, { roleCode: "HODIV", act: "JP" }] }), DAL_CORE_ROUTING, roles);
    if (!g.ok) throw new Error(g.fault);
    expect(trace(g.steps)).toEqual(["HOD:P", "HODIV:JP", "FD:R", "QC:MR"]);
    expect(g.steps.at(-1)).toMatchObject({ committeeCode: "QC", nonDelegable: true, origin: "RULE" });
  });

  it("(5) a proposer the core row does not hold goes first, added by the rule", () => {
    const g = generateChain(rule({ ruleKey: "T", approverCode: "FD", proposerCode: "CP" }), DAL_CORE_ROUTING, roles);
    if (!g.ok) throw new Error(g.fault);
    expect(trace(g.steps)).toEqual(["CP:P", "HOD:P", "HODIV:R"]);
    expect(g.steps[0].origin).toBe("RULE");
  });

  it("a proposer the core row does hold takes its core place", () => {
    const g = generateChain(rule({ ruleKey: "T", approverCode: "FD", proposerCode: "HOD" }), DAL_CORE_ROUTING, roles);
    expect(g.ok && trace(g.steps)).toEqual(["HOD:P", "HODIV:R"]);
  });

  it("a core row with no steps approves alone: nothing is generated beneath it", () => {
    const g = generateChain(rule({ ruleKey: "T", approverCode: "HOD" }), DAL_CORE_ROUTING, roles);
    expect(g.ok && g.steps).toEqual([]);
  });

  it("is keyed on the rule's own approver", () => {
    const g = generateChain(rule({ ruleKey: "T", approverCode: "HODIV" }), DAL_CORE_ROUTING, roles);
    expect(g.ok && trace(g.steps)).toEqual(["HOD:R"]);
  });

  it("an office above the CEO is generated from its own row, recorded as any other (invented row, not the fixture's)", () => {
    const invented: CoreLevel = { approverCode: "BOD", clause: "Invented for this test", provenance: "ASSUMED", steps: [{ roleCode: "CEO", act: "R", provenance: "ASSUMED" }] };
    expect(DAL_CORE_ROUTING.some((l) => l.approverCode === "BOD")).toBe(false);
    const r = rule({ ruleKey: "ABOVE", approverCode: "BOD", recommenders: [{ roleCode: "TBC", act: "MR" }] });
    const g = generateChain(r, [...DAL_CORE_ROUTING, invented], roles);
    expect(g.ok && trace(g.steps)).toEqual(["CEO:R", "TBC:MR"]);
    // Without the row, nothing above the CEO is generated: the fixture states nothing there.
    expect(generateChain(r, DAL_CORE_ROUTING, roles)).toEqual({ ok: false, fault: "CORE_ROW_MISSING", roleCode: "BOD" });
  });
});

describe("faults a rule taking its chain from the core routing is refused for", () => {
  const fd = (r: Partial<Rule>) => ruleCoreFault(rule({ ruleKey: "F", approverCode: "FD", ...r }), DAL_CORE_ROUTING[2]);

  it("(6) WEAKENS: core FD row has HoDiv R; a rule giving HoDiv P weakens it", () => {
    expect(fd({ recommenders: [{ roleCode: "HODIV", act: "P" }] })).toEqual({ fault: "WEAKENS", roleCode: "HODIV" });
    // and the issue's FD is weakened under the CEO row the same way
    expect(ruleCoreFault(rule({ ruleKey: "F", approverCode: "CEO", recommenders: [{ roleCode: "FD", act: "P" }] }), DAL_CORE_ROUTING[3])).toEqual({ fault: "WEAKENS", roleCode: "FD" });
    expect(fd({ recommenders: [{ roleCode: "HODIV", act: "JR" }] })).toBeNull();
  });

  it("(7) ORDER_DIFFERS: core offices named in another order", () => {
    expect(fd({ recommenders: [{ roleCode: "HODIV", act: "R" }, { roleCode: "HOD", act: "R" }] })).toEqual({ fault: "ORDER_DIFFERS", roleCode: "HOD" });
    expect(fd({ recommenders: [{ roleCode: "HOD", act: "R" }, { roleCode: "QC", act: "MR" }, { roleCode: "HODIV", act: "R" }] })).toBeNull();
  });

  it("(8) APPROVER_BENEATH: the approving office beneath itself", () => {
    expect(fd({ recommenders: [{ roleCode: "FD", act: "R" }] })).toEqual({ fault: "APPROVER_BENEATH", roleCode: "FD" });
    expect(fd({ proposerCode: "FD" })).toEqual({ fault: "APPROVER_BENEATH", roleCode: "FD" });
  });

  it("(9) DUPLICATE_OFFICE: one office twice in the chain", () => {
    expect(fd({ proposerCode: "CP", recommenders: [{ roleCode: "CP", act: "R" }] })).toEqual({ fault: "DUPLICATE_OFFICE", roleCode: "CP" });
  });

  it("APPROVE_BENEATH: an approval beneath the approver", () => {
    expect(fd({ recommenders: [{ roleCode: "CEO", act: "A" }] })).toEqual({ fault: "APPROVE_BENEATH", roleCode: "CEO" });
  });

  it("(11) CORE_ROW_MISSING: flagged, with no core row for its approver (an empty table included)", () => {
    expect(generateChain(rule({ ruleKey: "M", approverCode: "CM" }), DAL_CORE_ROUTING, roles)).toEqual({ ok: false, fault: "CORE_ROW_MISSING", roleCode: "CM" });
    expect(generateChain(rule({ ruleKey: "M", approverCode: "FD" }), [], roles)).toMatchObject({ ok: false, fault: "CORE_ROW_MISSING" });
    expect(generateChain(rule({ ruleKey: "M", approverCode: "FD" }), undefined, roles)).toMatchObject({ ok: false, fault: "CORE_ROW_MISSING" });
  });

  it("generation refuses what the check refuses: never a chain with a fault in it", () => {
    expect(generateChain(rule({ ruleKey: "W", approverCode: "FD", recommenders: [{ roleCode: "HODIV", act: "P" }] }), DAL_CORE_ROUTING, roles)).toEqual({ ok: false, fault: "WEAKENS", roleCode: "HODIV" });
  });
});

describe("(10) a core row's own faults", () => {
  const level = (steps: [string, AuthorityAct][], approverCode = "FD"): CoreLevel => ({ approverCode, clause: "", provenance: "ASSUMED", steps: steps.map(([roleCode, act]) => ({ roleCode, act, provenance: "ASSUMED" })) });

  it("accepts B.2's rows as printed", () => {
    for (const l of DAL_CORE_ROUTING) expect(coreLevelFaults(l, roles)).toEqual([]);
  });
  it("MANDATORY_IN_CORE: MR or MJR in a core row (note D-4)", () => {
    expect(coreLevelFaults(level([["HOD", "MR"]]), roles)).toEqual([{ fault: "MANDATORY_IN_CORE", roleCode: "HOD" }]);
    expect(coreLevelFaults(level([["HOD", "MJR"]]), roles)).toEqual([{ fault: "MANDATORY_IN_CORE", roleCode: "HOD" }]);
  });
  it("APPROVE_BENEATH: A or MA in a core row", () => {
    expect(coreLevelFaults(level([["HOD", "MA"]]), roles)).toEqual([{ fault: "APPROVE_BENEATH", roleCode: "HOD" }]);
    expect(coreLevelFaults(level([["HOD", "A"]]), roles)).toEqual([{ fault: "APPROVE_BENEATH", roleCode: "HOD" }]);
  });
  it("APPROVER_BENEATH, DUPLICATE_OFFICE and UNKNOWN_OFFICE", () => {
    expect(coreLevelFaults(level([["FD", "R"]]), roles)).toEqual([{ fault: "APPROVER_BENEATH", roleCode: "FD" }]);
    expect(coreLevelFaults(level([["HOD", "P"], ["HOD", "R"]]), roles)).toEqual([{ fault: "DUPLICATE_OFFICE", roleCode: "HOD" }]);
    expect(coreLevelFaults(level([["NOPE", "R"]]), roles)).toEqual([{ fault: "UNKNOWN_OFFICE", roleCode: "NOPE" }]);
    expect(coreLevelFaults(level([], "NOPE"), roles)).toEqual([{ fault: "UNKNOWN_OFFICE", roleCode: "NOPE" }]);
  });
});

describe("(12) the issue check reads flagged rules only", () => {
  it("ignores rules whose flag is unset or false, and names each flagged rule that fails", () => {
    const weak = [{ roleCode: "HODIV", act: "P" as const }];
    const rules = [
      rule({ ruleKey: "UNSET", approverCode: "FD", recommenders: weak, generateCoreChain: null }),
      rule({ ruleKey: "ABSENT", approverCode: "FD", recommenders: weak, generateCoreChain: undefined }),
      rule({ ruleKey: "AS_ENTERED", approverCode: "FD", recommenders: weak, generateCoreChain: false, coreChainReason: "stated" }),
      rule({ ruleKey: "WEAK", approverCode: "FD", recommenders: weak }),
      rule({ ruleKey: "NO_ROW", approverCode: "CM" }),
      rule({ ruleKey: "FINE", approverCode: "FD" }),
    ];
    expect(coreChainFaultsAcross(rules, DAL_CORE_ROUTING, roles).map((f) => [f.rule.ruleKey, f.fault, f.roleCode])).toEqual([
      ["WEAK", "WEAKENS", "HODIV"],
      ["NO_ROW", "CORE_ROW_MISSING", "CM"],
    ]);
  });
});

describe("(13) a revision copies its source issue's core routing", () => {
  const rows: (CoreLevelRow & { id: string; organisationId: string; authorityMatrixId: string })[] = [
    {
      id: "old-1",
      organisationId: "org-a",
      authorityMatrixId: "issue-1",
      approverCode: "CEO",
      clause: "§2.2.1",
      provenance: "STATED",
      note: "printed",
      sortOrder: 4,
      steps: [
        { roleCode: "FD", act: "R", sequence: 3, provenance: "STATED", note: "" },
        { roleCode: "HOD", act: "P", sequence: 1, provenance: "OBSERVED", note: "x" },
        { roleCode: "HODIV", act: "P", sequence: 2, provenance: "STATED", note: "or jointly propose" },
      ],
    },
    { id: "old-2", organisationId: "org-a", authorityMatrixId: "issue-1", approverCode: "HOD", clause: "", provenance: "ASSUMED", note: "", sortOrder: 1, steps: [] },
  ];

  it("carries every row and step with its provenance, clause and order, under the new issue, with no old id", () => {
    const out = copyCoreRouting(rows, { authorityMatrixId: "issue-2", organisationId: "org-a" });
    expect(out).toEqual([
      {
        organisationId: "org-a",
        authorityMatrixId: "issue-2",
        approverCode: "CEO",
        clause: "§2.2.1",
        provenance: "STATED",
        note: "printed",
        sortOrder: 4,
        steps: {
          create: [
            { organisationId: "org-a", roleCode: "HOD", act: "P", sequence: 1, provenance: "OBSERVED", note: "x" },
            { organisationId: "org-a", roleCode: "HODIV", act: "P", sequence: 2, provenance: "STATED", note: "or jointly propose" },
            { organisationId: "org-a", roleCode: "FD", act: "R", sequence: 3, provenance: "STATED", note: "" },
          ],
        },
      },
      { organisationId: "org-a", authorityMatrixId: "issue-2", approverCode: "HOD", clause: "", provenance: "ASSUMED", note: "", sortOrder: 1, steps: { create: [] } },
    ]);
    expect(JSON.stringify(out)).not.toContain("old-");
  });

  it("copies nothing it was not handed: a funder's rule set starting empty stays empty (OQ-7)", () => {
    expect(copyCoreRouting([], { authorityMatrixId: "funder-1", organisationId: "org-a" })).toEqual([]);
  });
});

describe("(22) what a route stores, and how an earlier route reads", () => {
  const at = new Date("2026-10-01T03:00:00Z");
  const name = (code: string) => ({ en: DAL_FIXTURE.roles[code]?.nameEn ?? "?", ms: DAL_FIXTURE.roles[code]?.nameMs ?? "?" });

  it("a generated route stores each step's origin and the core row it used", () => {
    const r = resolveApproval(DAL_FIXTURE, { domain: "requisition", value: 420_000 });
    expect(r.chain.map(stepOrigin)).toEqual(["CORE", "CORE_STRENGTHENED", "CORE_STRENGTHENED", null]);
    const fields = routeCoreFields(r.core, at);
    expect(fields).toEqual({ coreSnapshotAt: at, coreChainFlag: true, coreChainReason: null, coreRoutingSnapshot: DAL_CORE_ROUTING[3] });
    expect(routeCoreText({ ...fields, coreRoutingSnapshot: fields.coreRoutingSnapshot }, name).en).toBe("Generated from the core routing for Chief Executive Officer (§2.2.1).");
  });

  it("a route as entered stores the decision and its reason, and no core row (ruling C4)", () => {
    const r = resolveApproval(DAL_FIXTURE, { domain: "appointment", method: "direct", value: 6_000_000 });
    expect(r.chain.map(stepOrigin)).toEqual([null, null, null, null]);
    const fields = routeCoreFields(r.core, at);
    expect(fields).toEqual({ coreSnapshotAt: at, coreChainFlag: false, coreChainReason: "§3.1.4.2 item 1 states the chain; §2.2.1 is silent above the CEO" });
    expect(routeCoreText({ ...fields, coreRoutingSnapshot: null }, name).en).toBe(
      "Chain as entered on the rule, recorded as not taken from the core routing: §3.1.4.2 item 1 states the chain; §2.2.1 is silent above the CEO.",
    );
  });

  it("an unset flag is stored as such and reads 'not checked', never as generated", () => {
    const r = resolveApproval(DAL_FIXTURE, { domain: "termination", method: "tender" });
    const fields = routeCoreFields(r.core, at);
    expect(fields).toEqual({ coreSnapshotAt: at, coreChainFlag: null, coreChainReason: null });
    expect(routeCoreText({ ...fields, coreRoutingSnapshot: null }, name).en).toMatch(/^Chain as entered on the rule, not checked against core routing/);
  });

  it("a route opened before the snapshot existed reads 'Not recorded', and so does a step with no origin", () => {
    expect(routeCoreText({ coreSnapshotAt: null, coreChainFlag: null, coreChainReason: null, coreRoutingSnapshot: null }, name).en).toMatch(/^Not recorded/);
    expect(originLabel(null)).toBe("Not recorded");
    expect(originLabel(null, "ms")).toBe("Tidak direkodkan");
  });
});

describe("the words, in English and Malay (codes never on screen)", () => {
  it("names each origin", () => {
    expect(originLabel("CORE")).toBe("From core routing");
    expect(originLabel("CORE_STRENGTHENED")).toBe("Strengthened by this rule");
    expect(originLabel("CORE_ACT_SET")).toBe("Act set by this rule");
    expect(originLabel("RULE")).toBe("Added by this rule");
    expect(originLabel("CORE_ACT_SET", "ms")).toBe("Tindakan ditetapkan oleh peraturan ini");
  });
  it("names the three-way choice, unset as 'Not set'", () => {
    expect([null, true, false].map((f) => chainChoiceLabel(f))).toEqual(["Not set", "Generated from core routing", "As entered on this rule"]);
    expect(APPROVES_ALONE.en).toBe("Approves alone");
  });
  it("names offices and rules, never their codes", () => {
    const w = coreFaultWarning("WEAKENS", { en: "Big purchase", ms: "Belian besar" }, { en: "Head of Division", ms: "Ketua Bahagian" });
    expect(w.en).toContain("Head of Division");
    expect(w.ms).toContain("Ketua Bahagian");
    expect(`${w.en} ${w.ms}`).not.toMatch(/WEAKENS|HODIV/);
    expect(issueRefusal("CORE_ROW_MISSING", "Big purchase", "Chairman")).not.toMatch(/CORE_ROW_MISSING|CM\b/);
  });
});

describe("a route step's origin line", () => {
  it("shows only on a generated route's generated steps", () => {
    expect(stepOriginText({ coreChainFlag: true }, { chainOrigin: "CORE_STRENGTHENED" })).toBe("Strengthened by this rule");
    expect(stepOriginText({ coreChainFlag: true }, { chainOrigin: "CORE" }, "ms")).toBe("Daripada laluan teras");
    // the approver's step on a generated route, a chain as entered, an earlier route
    expect(stepOriginText({ coreChainFlag: true }, { chainOrigin: null })).toBeNull();
    expect(stepOriginText({ coreChainFlag: false }, { chainOrigin: "RULE" })).toBeNull();
    expect(stepOriginText({ coreChainFlag: null }, { chainOrigin: null })).toBeNull();
  });
});
