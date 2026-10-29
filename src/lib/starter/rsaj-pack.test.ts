import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import GENERIC_PACK from "../../../prisma/packs/generic";
import RSAJ_PACK from "../../../prisma/rsaj/starter-pack";
import { CONTRACTS } from "../../../prisma/rsaj/starter-pack/contracts";
import { SUPPLIERS } from "../../../prisma/rsaj/starter-pack/suppliers";
import { SYSTEM } from "../../../prisma/rsaj/starter-pack/system";
import { choicesNotMade, routeChoices } from "@/lib/authority/choice";
import { DAL_FIXTURE } from "@/lib/authority/dal-fixture";
import { resolveApproval, rulesTiedWith } from "@/lib/authority/resolve";
import type { Matrix, ResolveQuery, Role } from "@/lib/authority/types";
import { matchesFormat } from "@/lib/integration/award-commitment";
import { parseSen } from "@/lib/money";
import { ratioOfPercent } from "@/lib/percent-band";
import { toPosix } from "@/lib/scan/files";
import { documentTypeFaults } from "@/lib/suppliers/config";
import { SUPPLIER_EXPIRY_EVENT } from "@/lib/suppliers/expiry";
import { resolveSo } from "@/lib/supervision/so";
import { resolveMatterRoute } from "@/lib/time/route";

import { columnsOf, planPacks } from "./plan";

/**
 * The RSAJ starter pack, parts 1 and 2 (plan steps 4.4 and 4.6) with RSAJ's answers of 2026-10-24: every entry cites its requirement and its
 * clause; the only ASSUMED entries are named one by one (the document parts whose class is not stated; the evaluation stages whose side the form
 * does not assign; the two direct methods' document pack); the DAL's figures are the Appendix B fixture's, except the post-award rows, which are
 * banded by the contract's value rather than keyed by method (product owner's fix-up, 2026-10-24), and the three stacked-code rows, whose chains
 * are read per answer 1; the DAL and the models are drafts only; nothing outside the pack imports it; and `rsaj,generic` plans clean into a
 * fresh organisation.
 */
/// Deliberate change (RSAJ answer 1): no DAL rule is a reading any more. The three that were are stacked cells, now STATED.
const SLASHED: string[] = [];
/// The DAL standing in for SK006 §7.6.2's gap, RM0.01 to RM50,000 (RSAJ answer 16 of 2026-10-27; question 16b): ASSUMED, the gap said.
const GAP_FILLS = ["PX_TENDER", "PX_QUOTATION"];
/// SK006 §7.6.1 governs extension of time (RSAJ answer 16, 2026-10-27): the fixture's two DAL rows are re-cited, cover every contract and, as every
/// mandatory recommendation is, are non-delegable. Their approvers, committee and recommenders stay the fixture's.
const SK006_RECITED = ["EOT_FIN_NOT_AUTHORITY", "EOT_FIN_AUTHORITY"];
const ANSWERED = ["DP_ABOVE_5M", "TERMINATION", "ADVANCE_PAYMENT"];
/// The document parts whose class FR-DOC-003 and SK001 7.3.4 do not state, and the quotation declaration placed last (FR-DOC-008).
const ASSUMED_PARTS = ["t_invitation", "t_bond_forms", "t_summary_and_rates", "t_registration_background", "t_declaration", "t_instructions", "q_notice", "q_corrigendum", "q_instructions", "q_tenderer_background", "q_declaration"];
/// The evaluation stages whose side the form does not assign, set to Contract & Procurement.
const ASSUMED_STAGES = ["checklist", "combined", "recommendation", "phase_5"];
/// Named exception (RSAJ answer 15, an inference open to confirm): the two direct methods assemble no document pack.
const ASSUMED_COLUMNS = [
  ["direct_appointment", "documentPackKindProvenance"],
  ["selective_direct_appointment", "documentPackKindProvenance"],
  // ADR 0046 (named exception): SF-02 limits only a sukuk source, so "any category" on the other three is a reading of the document.
  ["INTERNAL", "eligibilityProvenance"],
  ["GRANT", "eligibilityProvenance"],
  ["NA", "eligibilityProvenance"],
];
/// ADR 0046 (named exception): SF-04's own examples of an impact figure, labels rather than thresholds, a reading of the requirement.
const ASSUMED_MEASURES = ["storage_added", "households_served"];
/// The post-award rows: B.6 and B.7 are headed by the contract's value, so these name no method and carry the regime's contract band.
const Q_VO = ["Q_VO_UP_TO_20", "Q_VO_20_TO_50", "Q_VO_ABOVE_50"];
const T_VO = ["T_VO_A_I", "T_VO_A_II", "T_VO_B_I", "T_VO_B_II", "T_VO_B_III", "T_VO_C_I", "T_VO_C_II", "T_VO_C_III", "T_VO_C_IV"];
const REGIME_BANDED = [...Q_VO, ...T_VO, "LAD_WAIVER_ABOVE_30", "LAD_WAIVER_UP_TO_30", "TERMINATION", "ADVANCE_PAYMENT", "IPC_UP_TO_100K", "IPC_100K_TO_500K", "IPC_ABOVE_500K"];
const dal = RSAJ_PACK.drafts!.matrices![0];
const models = RSAJ_PACK.drafts!.evaluationModels!;
const fresh = { now: new Date("2026-10-23T02:00:00Z"), rows: { Organisation: { id: "o1", timeZone: null }, SecurityPolicy: null }, listSizes: {}, demoIsLoaded: false };

describe("the RSAJ pack's entries", () => {
  it("each names its requirement and its source, and names only columns the schema has", () => {
    for (const g of RSAJ_PACK.groups) {
      expect(g.requirement, g.label).toMatch(/^(FR|SR)-/);
      expect(g.source.length, g.label).toBeGreaterThan(5);
      for (const c of Object.keys(g.values)) expect(columnsOf(g.model), `${g.model}.${c}`).toContain(c);
    }
    for (const l of RSAJ_PACK.lists) {
      for (const r of l.rows) {
        // ADR 0046: the funding rows cite RSAJ's SF and PR requirements (Requisition to Project Close-out).
        expect(r.requirement, `${l.label} ${r.code}`).toMatch(/^(FR|SR|SF|PR)-/);
        expect(r.source.length, `${l.label} ${r.code}`).toBeGreaterThan(5);
        for (const c of Object.keys(r.values)) expect(columnsOf(l.model), `${l.model}.${c}`).toContain(c);
      }
    }
    for (const r of dal.rules) expect([r.requirement, r.source.length > 5], r.ruleKey).toEqual([expect.stringMatching(/^FR-/), true]);
    for (const m of models) expect(m.requirement, m.content.nameEn).toMatch(/^FR-/);
  });

  it("is STATED, and the only ASSUMED entries are named one by one", () => {
    expect(RSAJ_PACK.provenance).toBe("STATED");
    expect(dal.rules.filter((r) => r.provenance === "ASSUMED").map((r) => r.ruleKey)).toEqual([...SLASHED, ...GAP_FILLS]);
    for (const r of dal.rules.filter((x) => GAP_FILLS.includes(x.ruleKey))) expect([r.isGap, r.gapNote, r.source], r.ruleKey).toEqual([true, expect.stringMatching(/^SK006 §7\.6\.2 has no rule for an extension adding up to RM50,000\. Routed by the DAL/), expect.stringMatching(/the DAL stands in \(RSAJ answer 16 \(2026-10-27\); RSAJ question 16b\)$/)]);
    const assumedRows = RSAJ_PACK.lists.flatMap((l) => l.rows.filter((r) => r.values.provenance === "ASSUMED").map((r) => r.code));
    expect(assumedRows).toEqual([...ASSUMED_PARTS, ...ASSUMED_MEASURES]);
    for (const r of RSAJ_PACK.lists.flatMap((l) => l.rows)) if (r.values.provenance != null && r.values.provenance !== "ASSUMED") throw new Error(`${r.code}: ${String(r.values.provenance)}`);
    const parts = RSAJ_PACK.lists.find((l) => l.model === "TenderDocumentPart")!.rows;
    for (const r of parts.filter((x) => ASSUMED_PARTS.includes(x.code))) expect(r.values.notes, r.code).toMatch(/stated \(FR-DOC-001\/013\); its class is not|summary of tender is not classed|its place in the pack is not stated/);
    for (const r of dal.rules.filter((x) => ANSWERED.includes(x.ruleKey))) expect([r.provenance, r.source], r.ruleKey).toEqual(["STATED", expect.stringMatching(/; stacked code read per RSAJ answer 1 \(2026-10-24\)$/)]);
    for (const l of dal.coreRouting) expect([l.provenance, ...l.steps.map((s) => s.provenance)].every((p) => p === "STATED")).toBe(true);
    for (const t of dal.termsBands ?? []) expect(t.provenance).toBe("STATED");
    // Every value of a row's own provenance column, wherever the pack sets one: STATED, but for the named exception.
    const own = [...RSAJ_PACK.lists.flatMap((l) => l.rows.flatMap((r) => Object.entries(r.values).map(([c, v]) => [r.code, c, v]))), ...RSAJ_PACK.groups.flatMap((g) => Object.entries(g.values).map(([c, v]) => [g.label, c, v]))].filter(([, c]) => /Provenance$/.test(String(c)));
    expect(own.length).toBeGreaterThan(10);
    expect(own.filter(([, , v]) => v !== "STATED")).toEqual(ASSUMED_COLUMNS.map(([code, c]) => [code, c, "ASSUMED"]));
  });

  it("marks the evaluation models OBSERVED, as the specification says they are practice (decision D1), except the stages whose side is assumed", () => {
    for (const m of models) {
      const c = m.content;
      const all = [c.provenance, ...c.stages.filter((s) => !ASSUMED_STAGES.includes(s.code)).flatMap((s) => [s.provenance, ...s.criteria.map((x) => x.provenance), ...s.factors.map((f) => f.provenance)]), ...c.bandSets.map((b) => b.provenance)];
      expect(new Set(all), c.nameEn).toEqual(new Set(["OBSERVED"]));
    }
    const assumed = models.flatMap((m) => m.content.stages.filter((s) => s.provenance === "ASSUMED"));
    expect(assumed.map((s) => s.code)).toEqual(ASSUMED_STAGES);
    for (const s of assumed) expect(s.governingSource, s.code).toMatch(/side not assigned by the form; set to Contract & Procurement$/);
  });
});

describe("the DAL draft", () => {
  it("carries the Appendix B fixture's figures for every rule they share", () => {
    const shared = DAL_FIXTURE.rules.filter((f) => dal.rules.some((r) => r.ruleKey === f.ruleKey));
    expect(shared.map((r) => r.ruleKey)).toEqual(DAL_FIXTURE.rules.map((r) => r.ruleKey));
    // The award signatory's matter is asked by the award's value, so the signing rows carry the contract-value band on the value columns.
    const band = (r: (typeof dal.rules)[number] | (typeof DAL_FIXTURE.rules)[number]) => [r.minValue ?? r.contractValueMin, r.maxValue ?? r.contractValueMax, r.minValue == null ? null : r.contractValueMin, r.maxValue == null ? null : r.contractValueMax];
    const figures = (r: (typeof dal.rules)[number] | (typeof DAL_FIXTURE.rules)[number]) => ({
      band: band(r),
      pct: [r.pctMin, r.pctMax],
      proposer: r.proposerCode,
      recommenders: r.recommenders,
      approver: r.approverCode,
      committee: [r.committeeCode, r.committeeAct],
      nonDelegable: r.nonDelegable,
      followsBoundarySwitch: r.followsBoundarySwitch,
      generateCoreChain: r.generateCoreChain ?? null,
    });
    const { quotationFloor, tenderFloor } = dal.policy;
    // The stacked-code rows (answer 1) differ from the fixture's reading in their chain only; their chains are asserted below.
    const figuresOf = (r: Parameters<typeof figures>[0]) => (ANSWERED.includes(r.ruleKey) ? { ...figures(r), proposer: null, recommenders: null } : figures(r));
    for (const f of shared) {
      const r = dal.rules.find((x) => x.ruleKey === f.ruleKey)!;
      if (SK006_RECITED.includes(f.ruleKey)) {
        expect({ ...figuresOf(r), band: null, nonDelegable: null }, f.ruleKey).toEqual({ ...figuresOf(f), band: null, nonDelegable: null });
        expect([r.contractValueMin, r.contractValueMax, r.minValue, r.maxValue, r.method, r.nonDelegable, r.clause, r.source], f.ruleKey).toEqual([null, null, null, null, null, true, "SK006 §7.6.1 (as amended 12.01.2026), 7.5.3", "SK006 §7.6.1 (as amended 12.01.2026), 7.5.3; RSAJ answer 16 (2026-10-27)"]);
        continue;
      }
      if (!REGIME_BANDED.includes(f.ruleKey) || T_VO.includes(f.ruleKey)) {
        expect(figuresOf(r), f.ruleKey).toEqual(figuresOf(f));
        if (T_VO.includes(f.ruleKey)) expect(r.method, f.ruleKey).toBeNull();
        continue;
      }
      // The recorded exception: no method, and the regime's contract band in place of the fixture's (it has none).
      expect({ ...figuresOf(r), band: null }, f.ruleKey).toEqual({ ...figuresOf(f), band: null });
      expect(r.method, f.ruleKey).toBeNull();
      expect([r.contractValueMin, r.contractValueMax], f.ruleKey).toEqual(Q_VO.includes(f.ruleKey) ? [quotationFloor, tenderFloor] : [tenderFloor, null]);
      expect([r.minValue, r.maxValue, r.pctMin, r.pctMax], f.ruleKey).toEqual([f.minValue, f.maxValue, f.pctMin, f.pctMax]);
    }
    expect(dal.rules.filter((r) => REGIME_BANDED.includes(r.ruleKey)).every((r) => r.method == null)).toBe(true);
    expect({ ...dal.policy }).toEqual({ ...DAL_FIXTURE.policy });
    expect(dal.coreRouting).toEqual(DAL_FIXTURE.coreRouting);
  });

  it("reads the three stacked cells per RSAJ answer 1: the proposer, then the starred office, then the requesting department's line", () => {
    const chain = (key: string) => {
      const r = dal.rules.find((x) => x.ruleKey === key)!;
      return [r.proposerCode, ...r.recommenders.map((x) => `${x.roleCode} ${x.act}`), r.approverCode];
    };
    expect(chain("DP_ABOVE_5M")).toEqual(["HOD", "AD JR", "HODIV R", "TBC MR", "BOD"]);
    expect(chain("ADVANCE_PAYMENT")).toEqual(["HOD", "CP JR", "HODIV R", "CEO"]);
    expect(chain("TERMINATION")).toEqual(["HOD", "CP JR", "HODIV R", "CEO"]);
    // The MR convention is for new rows: DP_ABOVE_5M keeps the fixture's figures, its delegability included.
    expect(dal.rules.find((x) => x.ruleKey === "DP_ABOVE_5M")).toMatchObject({ nonDelegable: false, generateCoreChain: false });
  });

  it("states the boundary ruling (exactly RM300,000.00 is a quotation, RSAJ answer 3), with its source (A4)", () => {
    expect(dal.policy.boundaryInclusive).toBe(true);
    expect(dal.boundaryProvenance).toBe("STATED");
    expect(dal.boundarySource).toMatch(/^DAL §3\.1\.4\.2–3\.1\.4\.4 bands .*RSAJ answer 3$/);
  });

  it("is a draft: nothing puts it in force or names who made it", () => {
    for (const k of ["issuedAt", "issuedByPersonId", "makersUnknownAtLanding", "status", "makers"]) {
      expect(dal, k).not.toHaveProperty(k);
      for (const m of models) expect(m.content, k).not.toHaveProperty(k);
    }
    const p = planPacks([RSAJ_PACK, GENERIC_PACK], fresh);
    expect(p.writes.filter((w) => w.kind === "DRAFT_MATRIX" || w.kind === "DRAFT_MODEL").map((w) => w.label)).toEqual([dal.label, ...models.map((m) => m.content.nameEn)]);
  });
});

describe("the DAL draft, put in force, routes a contract's matters whatever its method (fix-up 2026-10-24)", () => {
  const offices = RSAJ_PACK.lists.find((l) => l.model === "AuthorityRole")!.rows;
  const roles: Record<string, Role> = Object.fromEntries(offices.map((o) => [o.code, { code: o.code, ...(o.values as Omit<Role, "code">) }]));
  const matrix: Matrix = { policy: dal.policy, roles, rules: dal.rules, coreRouting: dal.coreRouting };
  const route = (q: ResolveQuery) => {
    const r = resolveApproval(matrix, q);
    return { rule: r.rule?.ruleKey ?? null, approver: r.approverCode, errors: r.warnings.filter((w) => w.level === "err").map((w) => w.code) };
  };
  const pct = (p: string) => ratioOfPercent(p);

  it("routes an interim payment by its value on a tendered contract (spec example: RM620,000 to the CEO, RM80,000 to the Head of Division)", () => {
    for (const method of ["open_selective", "direct"]) {
      expect(route({ domain: "payment", method, value: 620_000, contractValue: 3_500_000 }), method).toEqual({ rule: "IPC_ABOVE_500K", approver: "CEO", errors: [] });
      expect(route({ domain: "payment", method, value: 80_000, contractValue: 3_500_000 }), method).toEqual({ rule: "IPC_UP_TO_100K", approver: "HODIV", errors: [] });
    }
  });

  it("routes a variation on a contract of exactly RM300,000.00 as a quotation contract, and one cent more as a tender contract", () => {
    for (const method of ["open_selective", "direct"]) {
      expect(route({ domain: "vo", method, pctRatio: pct("8"), contractValue: 300_000 }).rule, method).toBe("Q_VO_UP_TO_20");
      expect(route({ domain: "vo", method, pctRatio: pct("8"), contractValue: 300_000.01 }).rule, method).toBe("T_VO_C_III");
    }
  });

  it("routes a 25% variation on a RM2 million direct contract to the CEO", () => {
    expect(route({ domain: "vo", method: "direct", pctRatio: pct("25"), contractValue: 2_000_000 })).toEqual({ rule: "T_VO_B_II", approver: "CEO", errors: [] });
  });

  it("routes spec example 5, RM6,000,000 direct: HOD P → AD JR → HODIV R → TBC MR → BOD A", () => {
    const r = resolveApproval(matrix, { domain: "appointment", method: "direct", value: 6_000_000 });
    expect(r.rule?.ruleKey).toBe("DP_ABOVE_5M");
    expect(r.chain.map((s) => `${s.roleCode} ${s.act}`)).toEqual(["HOD P", "AD JR", "HODIV R", "TBC MR", "BOD A"]);
    expect(r.warnings.filter((w) => w.level === "err")).toEqual([]);
  });

  // Part 2 loaded B.6 item 7, so a waiver of LAD on a RM200,000 contract now routes. Deliberate change (RSAJ answers 4 and 16, 2026-10-27):
  // termination there routes by the DAL's B.6 item 8, and loss and expense goes to the Tender Board (KP002 §5.12.5); the gap case moves to a
  // matter the pack has no row for (a nominated sub-contractor).
  it("routes a waiver of LAD on a RM200,000 contract to the CEO, its termination by the DAL, its loss and expense to the Tender Board, and a nomination to no rule", () => {
    expect(route({ domain: "lad_waiver", method: "open_selective", pctRatio: pct("10"), contractValue: 200_000 })).toEqual({ rule: "LAD_WAIVER_QUOTATION", approver: "CEO", errors: [] });
    expect(route({ domain: "termination", method: "open_selective", contractValue: 200_000 })).toEqual({ rule: "TERMINATION_QUOTATION", approver: "CEO", errors: [] });
    for (const contractValue of [200_000, 5_000_000]) expect(route({ domain: "loss_expense", method: "open_selective", value: 10_000, contractValue }), String(contractValue)).toEqual({ rule: "LOSS_EXPENSE", approver: "TBC", errors: [] });
    expect(route({ domain: "nomination", method: "open_selective", value: 10_000, contractValue: 200_000 })).toEqual({ rule: null, approver: null, errors: ["NO_RULE"] });
  });

  it("resolves the Superintending Officer by the contract's value (B.6 item 6, B.7 item 5)", () => {
    const so = (contractValue: number) => {
      const r = resolveSo(matrix, { contractValue, method: "direct", contractTypeCode: null });
      return r.state === "RESOLVED" ? r.roleCode : r.state;
    };
    expect([200_000, 300_000, 300_000.01, 1_000_000, 2_000_000, 3_000_000, 3_500_000].map(so)).toEqual(["HODIV", "HODIV", "HODIV", "HODIV", "FD", "FD", "CEO"]);
    expect(resolveSo(matrix, { contractValue: 300_000, method: null, contractTypeCode: null })).toMatchObject({ ruleKey: "SO_QUOTATION" });
  });
});

describe("the routes of decision D2, settled (RSAJ answer 16, 2026-10-27): no choice left", () => {
  const offices = RSAJ_PACK.lists.find((l) => l.model === "AuthorityRole")!.rows;
  const roles: Record<string, Role> = Object.fromEntries(offices.map((o) => [o.code, { code: o.code, ...(o.values as Omit<Role, "code">) }]));
  const matrix: Matrix = { policy: dal.policy, roles, rules: dal.rules, coreRouting: dal.coreRouting };
  const chainOf = (q: ResolveQuery) => {
    const r = resolveApproval(matrix, q);
    return r.rule ? [r.rule.ruleKey, ...r.chain.map((s) => `${s.roleCode} ${s.act}`)] : r.warnings.filter((w) => w.level === "err").map((w) => w.code);
  };

  it("carry no route choice, so the matrix shows no choice to make; the SK rows cite their own document", () => {
    expect(dal.rules.filter((r) => r.choiceOptionEn != null || r.chosen != null).map((r) => r.ruleKey)).toEqual([]);
    expect(routeChoices(dal.rules)).toEqual([]);
    expect(choicesNotMade(dal.rules)).toEqual([]);
    for (const k of ["TERMINATION_SO_QUOTATION", "TERMINATION_SO_300K_TO_1M", "EOT_NOFIN_300K_TO_1M", "EOT_NOFIN_Q", "EOT_Q_FIN_AUTHORITY", "EOT_Q_FIN_NOT_AUTHORITY"]) expect(dal.rules.map((r) => r.ruleKey), k).not.toContain(k);
    for (const r of dal.rules.filter((x) => /^SK00/.test(x.clause))) expect(r.source, r.ruleKey).toBe(`${r.clause}; RSAJ answer 16 (2026-10-27)`);
    expect(dal.rules.find((r) => r.ruleKey === "LOSS_EXPENSE")).toMatchObject({ clause: "KP002 §5.12.5", source: "KP002 §5.12.5; RSAJ answer 4 (2026-10-27)", approverCode: "TBC", committeeCode: "TBC", committeeAct: "A" });
    // Every row with a mandatory recommendation is fixed.
    for (const r of dal.rules.filter((x) => x.recommenders.some((s) => s.act === "MR") && x.ruleKey !== "DP_ABOVE_5M" && !DAL_FIXTURE.rules.some((f) => f.ruleKey === x.ruleKey))) expect(r.nonDelegable, r.ruleKey).toBe(true);
  });

  it("leave no two rows of the draft tied for any matter", () => {
    for (const r of dal.rules) expect(rulesTiedWith(r, dal.rules).map((x) => x.ruleKey), r.ruleKey).toEqual([]);
  });

  it("termination: the DAL's B.6 item 8 or B.7 item 13, by the contract's value", () => {
    const q = (contractValue: number): ResolveQuery => ({ domain: "termination", method: "open_selective", contractValue });
    expect(chainOf(q(200_000))).toEqual(["TERMINATION_QUOTATION", "HOD P", "CP JR", "HODIV R", "FD MR", "CEO A"]);
    expect(chainOf(q(300_000.01))).toEqual(["TERMINATION", "HOD P", "CP JR", "HODIV R", "CEO A"]);
  });

  it("extension of time: SK006 §7.6.1's three routes on every contract, quotation or tender", () => {
    const q = (cond: string, contractValue: number): ResolveQuery => ({ domain: "eot", cond, method: "open_selective", contractValue });
    for (const v of [200_000, 2_000_000]) {
      expect(chainOf(q("no_financial_impact", v)), String(v)).toEqual(["EOT_NOFIN_SK006", "VOC A"]);
      expect(chainOf(q("financial_authority", v)), String(v)).toEqual(["EOT_FIN_AUTHORITY", "VOC MR", "CEO A"]);
      expect(chainOf(q("financial_not_authority", v)), String(v)).toEqual(["EOT_FIN_NOT_AUTHORITY", "VOC MR", "TBC A"]);
    }
  });

  it("extension of the contract period: SK006 at RM0 and above RM50,000, the DAL in SK006's gap, each value in exactly one band", () => {
    const ctx = { dal: matrix, override: null, supersedes: false };
    const send = (value: string | null, contractValue = "2000000.00") => {
      const r = resolveMatterRoute(ctx, { kind: "PERIOD_EXTENSION", value: value == null ? null : parseSen(value), ratio: null, contractValue: parseSen(contractValue), method: "open_selective", contractTypeCode: null }, "draft", () => false);
      return r.ok ? [r.resolution.rule!.ruleKey, ...r.resolution.chain.map((s) => `${s.roleCode} ${s.act}`)] : r.faults.map((f) => f.code);
    };
    // Raised with no value: routed as RM0, so SK006's "RM0" row finds it.
    expect(send(null)).toEqual(["PX_SK006_NO_VALUE", "VOC A"]);
    expect(send("0.00")).toEqual(["PX_SK006_NO_VALUE", "VOC A"]);
    expect(send("0.01")).toEqual(["PX_TENDER", "CP JR", "HOD R", "TBC A"]);
    expect(send("50000.00")).toEqual(["PX_TENDER", "CP JR", "HOD R", "TBC A"]);
    expect(send("0.01", "200000.00")).toEqual(["PX_QUOTATION", "QC MR", "FD A"]);
    expect(send("50000.00", "200000.00")).toEqual(["PX_QUOTATION", "QC MR", "FD A"]);
    for (const cv of ["200000.00", "2000000.00"]) expect(send("50000.01", cv), cv).toEqual(["PX_SK006_ABOVE_50K", "VOC MR", "TBC A"]);
    // The gap rows say so on every route they give.
    const gap = resolveApproval(matrix, { domain: "contract_period_extension", value: 20_000, contractValue: 2_000_000 });
    expect(gap.warnings.map((w) => [w.code, w.messageEn])).toEqual(expect.arrayContaining([["GAP_RULE", "Route assumed: no rule covers this matter."], ["RULE_NOTE", "SK006 §7.6.2 has no rule for an extension adding up to RM50,000. Routed by the DAL until RSAJ says who approves."]]));
    expect(resolveApproval(matrix, { domain: "contract_period_extension", value: 60_000, contractValue: 2_000_000 }).warnings.map((w) => w.code)).not.toContain("GAP_RULE");
    // A contract of RM15,000 or less has no DAL row for the gap: still no rule, as before.
    expect(send("20000.00", "10000.00")).toEqual(["NO_RULE"]);
  });
});

describe("loading rsaj,generic into a fresh organisation", () => {
  it("plans every group, list and draft with no fault and no skip", () => {
    const p = planPacks([RSAJ_PACK, GENERIC_PACK], fresh);
    expect(p.faults).toEqual([]);
    // The generic calendar group sits beside the RSAJ window groups on one row; everything else of each pack is written.
    expect(p.skips).toEqual([]);
    const written = new Set(p.writes.map((w) => (w.kind === "ROW" ? w.listLabel : w.kind === "SWITCH_OFF" ? "switch" : w.label)));
    for (const g of RSAJ_PACK.groups) expect(written, g.label).toContain(g.label);
    for (const l of RSAJ_PACK.lists) if (l.rows.length > 0) expect(written, l.label).toContain(l.label);
  });
});

describe("part 2: contracts, suppliers and system (plan step 4.6)", () => {
  const listOf = (model: string) => RSAJ_PACK.lists.filter((l) => l.model === model).flatMap((l) => l.rows);
  const groupOf = (label: string) => RSAJ_PACK.groups.find((g) => g.label === label)!.values;

  it("carries the figures the specification states", () => {
    expect(groupOf("Award · indent validity")).toEqual({ indentValidityDays: 14 });
    expect(groupOf("Award · start of work")).toEqual({ commencementGraceDays: 7 });
    expect(groupOf("Supervision · in delay")).toEqual({ inDelayProgressPct: "70" });
    expect(groupOf("Payment · retention released at as-built")).toEqual({ firstReleasePct: "50" });
    expect({ ...groupOf("Close-out · design guarantee bond rate"), ...groupOf("Close-out · design guarantee bond years") }).toEqual({ designBondPct: "5", designBondYears: 5 });
    expect(groupOf("Supplier register · expiry bands")).toEqual({ criticalDays: 30, warningDays: 60, upcomingDays: 90 });
    expect(groupOf("Contract · controlled copy stamp")).toEqual({ controlledCopyStampEn: "Controlled Copy" });
    // FR-AWD-004: four copies, and SPAN's only for water services works.
    const copies = listOf("DistributionRecipient");
    expect(copies.map((r) => [r.values.nameEn, r.values.onlyWhenRegulated ?? false])).toEqual([["Implementing Department", false], ["Accounts & Finance Department", false], ["CIDB (LPIPM)", false], ["LHDN", false], ["SPAN", true]]);
    expect(listOf("ControlledCopyRecipient").filter((r) => r.values.onlyWithConsultingEngineer).map((r) => r.code)).toEqual(["consulting_engineer"]);
    expect(listOf("StandingReason").map((r) => r.values.appliesTo)).toEqual(["SUSPEND", "SUSPEND", "SUSPEND", "SUSPEND", "BLACKLIST"]);
    // Ruling 8 (close-out stage C): the final account's pack needs three STATED documents (CPD/INT-SFA-INDEN).
    expect(listOf("CloseoutDocumentRequirement").map((r) => [r.values.labelEn, r.requirement, r.source])).toEqual([["As-built drawings", "FR-FIN-008", "CPD/INT-SFA-INDEN"], ["CIDB levy certificate", "FR-FIN-008", "CPD/INT-SFA-INDEN"], ["Receipt of water charges", "FR-FIN-008", "CPD/INT-SFA-INDEN"]]);
  });

  it("gives each document type only values of a body it names, and leaves 'mandatory at registration' unset (not stated)", () => {
    const bodies = new Set(listOf("RegistrationBody").map((b) => `RegistrationBody:${b.code}`));
    const types = listOf("SupplierDocumentType");
    expect(types).toHaveLength(13);
    // RSAJ answer 23: Suruhanjaya Tenaga is a registration body, with no qualifier stated, and its certificate names it.
    expect(listOf("RegistrationBody").find((b) => b.code === "st")).toMatchObject({ values: { labelEn: "Suruhanjaya Tenaga" }, source: expect.stringMatching(/^SK001 7\.3\.4\(a\)/) });
    expect(listOf("RegistrationBody").find((b) => b.code === "st")!.values).not.toHaveProperty("qualifierLabelEn");
    expect(types.find((t) => t.code === "suruhanjaya_tenaga")!.values.bodyId).toEqual({ ref: "RegistrationBody:st" });
    for (const t of types) {
      const bodyRef = (t.values.bodyId as { ref: string } | undefined)?.ref ?? null;
      const input = { code: t.code, nameEn: String(t.values.nameEn), bodyId: bodyRef, valueKinds: (t.values.valueKinds as never[] | undefined) ?? [], provenance: RSAJ_PACK.provenance };
      expect(documentTypeFaults(input, { codeTaken: false, bodyExists: bodyRef == null || bodies.has(bodyRef) }), t.code).toEqual([]);
      expect(t.values, t.code).toMatchObject({ expires: true, notApplicableAllowed: true });
      expect(t.values, t.code).not.toHaveProperty("mandatoryAtRegistration");
    }
  });

  it("writes each finance system number format so the stated example matches it as the product reads it", () => {
    const formats = listOf("CodeFormat");
    expect(formats.map((f) => f.code)).toEqual(["erp_requisition_no", "erp_note_no", "erp_indent_no"]);
    for (const f of formats) {
      expect(() => new RegExp(`^(?:${f.values.pattern})$`), f.code).not.toThrow();
      if (f.values.example) expect(matchesFormat(String(f.values.example), String(f.values.pattern)), f.code).toBe(true);
    }
    expect(matchesFormat("PROC2025150424", String(formats[0].values.pattern))).toBe(true);
    expect(matchesFormat("NM/2026/00412", String(formats[1].values.pattern))).toBe(true);
    // RSAJ answer 26: the Expenditure Request Form's own number.
    expect(formats[1].values.example).toBe("NM/2025/00461");
    expect(matchesFormat("NM/2025/00461", String(formats[1].values.pattern))).toBe(true);
    expect(matchesFormat("IN2026395", String(formats[2].values.pattern))).toBe(false);
  });

  it("holds no Malay text, no legal text, no office-naming notification rule, and nothing the documents leave unstated", () => {
    const part2 = [CONTRACTS, SUPPLIERS, SYSTEM];
    const set = part2.flatMap((p) => [...p.groups.map((g) => g.values), ...p.lists.flatMap((l) => l.rows.map((r) => r.values))]).flatMap((v) => Object.entries(v).filter(([, x]) => x != null));
    const columns = set.map(([c]) => c);
    expect(columns.filter((c) => /Ms$/.test(c))).toEqual([]);
    for (const c of ["personalDataNoticeEn", "helpEmail", "helpPhone", "verificationNoticeEn"]) expect(columns, c).not.toContain(c);
    // SP-9 and SP-16 in part (ST-13 amends it for the one reminder rule, below); the contract document parts and the letter variants are open questions for RSAJ (contracts.ts).
    const models = [...RSAJ_PACK.groups, ...RSAJ_PACK.lists].map((x) => x.model);
    for (const m of ["DeclarationText", "ContractDocumentPart", "AppointmentLetterVariant", "DocumentTemplate"]) expect(models, m).not.toContain(m);
    // RSAJ answer 33 (2026-10-27): the two award-return events name Contract & Procurement, as SK003 §7.9.3 states; every other rule names none.
    expect(listOf("NotificationRule").filter((r) => (r.values.recipientRoleCodes as string[]).length > 0).map((r) => [r.values.eventKey, r.values.recipientRoleCodes, r.source])).toEqual([
      ["award.return.lodged", ["CP"], "SK003 §7.9.3; RSAJ answer 33 (2026-10-27)"],
      ["award.query.raised", ["CP"], "SK003 §7.9.3; RSAJ answer 33 (2026-10-27)"],
    ]);
  });

  // ST-13 (2026-10-24): one notification rule, the expiry reminders, STATED and naming no office; shown in the portal, sending waits for the mail integration.
  it("loads the document expiry reminders at exactly 90, 60, 30 and 7 days, STATED, naming no office", () => {
    expect(listOf("NotificationRule").filter((r) => r.values.eventKey === SUPPLIER_EXPIRY_EVENT)).toEqual([
      { code: "supplier_document_expiring", values: { eventKey: SUPPLIER_EXPIRY_EVENT, nameEn: "Supplier document expiring", recipientRoleCodes: [], reminderOffsetDays: [90, 60, 30, 7] }, requirement: "FR-VND-008", source: "Specification FR-VND-008" },
    ]);
    const w = planPacks([RSAJ_PACK, GENERIC_PACK], fresh).writes.filter((x) => x.kind === "ROW" && x.model === "NotificationRule");
    expect(w.map((x) => (x.kind === "ROW" ? [x.code, x.provenance, x.values.provenance] : null))).toEqual([
      ["award.return.lodged", "STATED", "STATED"],
      ["award.query.raised", "STATED", "STATED"],
      ["supplier_document_expiring", "STATED", "STATED"],
    ]);
  });

  // RSAJ answer 33 (2026-10-27): each award-return rule is its own list, scoped by its event, so it loads beside rules the organisation has.
  it("loads C&P's award-return rules beside an organisation's other rules, each scoped by its event", () => {
    const rules = RSAJ_PACK.lists.filter((l) => l.model === "NotificationRule" && l.scope);
    expect(rules.map((l) => l.scope)).toEqual([{ eventKey: "award.return.lodged" }, { eventKey: "award.query.raised" }]);
    const p = planPacks([RSAJ_PACK, GENERIC_PACK], { ...fresh, listSizes: { NotificationRule: 3 } });
    expect(p.writes.filter((x) => x.kind === "ROW" && x.model === "NotificationRule").map((x) => (x.kind === "ROW" ? x.code : null))).toEqual(["award.return.lodged", "award.query.raised"]);
  });

  it("loads RSAJ's contract number series beside the generic pack's, each scoped by its key", () => {
    const p = planPacks([RSAJ_PACK, GENERIC_PACK], fresh);
    const series = p.writes.filter((w) => w.kind === "ROW" && w.model === "NumberingSeries").map((w) => (w.kind === "ROW" ? [w.pack, w.values.key, w.values.pattern] : null));
    expect(series.filter((s) => s![0] === "rsaj")).toEqual([
      ["rsaj", "contract_tender", "RSAJ/KP/T/{SERIAL}/{YEAR}"],
      ["rsaj", "contract_consultancy", "RSAJ/KP/P/{SERIAL}/{YEAR}"],
      ["rsaj", "exercise_tender", "RSAJ/TA/{SERIAL}/{YEAR}"],
      ["rsaj", "direct_appointment", "RSAJ/KP/ST/{SERIAL}/{SHORTYEAR}"],
    ]);
    expect(series.filter((s) => s![0] === "generic")).toHaveLength(9);
    expect(series.filter((s) => s![0] === "generic").map((s) => s![1])).not.toContain("exercise_tender");
  });
});

describe("how each RSAJ contract type is paid (WV-14)", () => {
  // Citations (here and in purchasing.ts only; the route has no provenance tag of its own):
  // work: §6.13.2 + SK011; service: KP003 §5.10.2, monthly on interim payments (RSAJ answer 35, 2026-10-27); supply: KP004 §5.10.2, the local
  // order, invoice and delivery order (RSAJ answer 34, 2026-10-27); consultancy: SK011, certified claims (RSAJ answer 35, 2026-10-27).
  const types = RSAJ_PACK.lists.find((l) => l.model === "ContractType")!.rows;

  it("work, service and consultancy by certified claim, supply by delivery order and invoice", () => {
    expect(Object.fromEntries(types.map((r) => [r.code, r.values.paymentRoute]))).toEqual({ work: "CERTIFIED_CLAIM", service: "CERTIFIED_CLAIM", supply: "DELIVERY_ORDER_INVOICE", consultancy: "CERTIFIED_CLAIM" });
  });

  // RSAJ answer 4 (2026-10-27): loss and expense goes to the Tender Board (KP002 §5.12.5), so it is every type's claims committee, and the pack has
  // no Claims Committee.
  it("name the Tender Board as every type's claims committee", () => {
    for (const r of types) expect(r.values.claimsCommitteeId, r.code).toEqual({ ref: "Committee:TBC" });
    expect(RSAJ_PACK.lists.find((l) => l.model === "Committee")!.rows.map((r) => r.values.nameEn)).not.toContain("Claims Committee");
  });

  it("leaves each type's own source and provenance as they were: the route is not cited on the row", () => {
    const TYPE_SOURCE = "KP002/003/004 5.1.2, 5.5, 5.9, 5.10; SK004 §7.2.1";
    for (const code of ["work", "service", "supply"]) expect(types.find((r) => r.code === code)!.source, code).toBe(TYPE_SOURCE);
    for (const r of types) expect(r.values.provenance, r.code).toBeUndefined();
    const w = planPacks([RSAJ_PACK, GENERIC_PACK], fresh).writes.filter((x) => x.kind === "ROW" && x.model === "ContractType");
    expect(w.map((x) => (x.kind === "ROW" ? [x.code, x.values.paymentRoute ?? null, x.values.provenance, x.values.governingSource] : null))).toEqual([
      ["work", "CERTIFIED_CLAIM", "STATED", TYPE_SOURCE],
      ["service", "CERTIFIED_CLAIM", "STATED", TYPE_SOURCE],
      ["supply", "DELIVERY_ORDER_INVOICE", "STATED", TYPE_SOURCE],
      ["consultancy", "CERTIFIED_CLAIM", "STATED", expect.stringMatching(/^SK004 §7\.2\.1/)],
    ]);
  });

  it("never overwrites: a contract type list that already has a row is skipped whole", () => {
    const p = planPacks([RSAJ_PACK, GENERIC_PACK], { ...fresh, listSizes: { ContractType: 1 } });
    expect(p.writes.some((x) => x.model === "ContractType")).toBe(false);
    expect(p.skips).toContainEqual(expect.objectContaining({ pack: "rsaj", target: "Contract type", reason: "LIST_NOT_EMPTY" }));
  });
});

describe("the funding sources and impact measures (ADR 0046, plan step 8)", () => {
  const SOURCE = "RSAJ Portal Requirements (2026-10-27), D365 configuration: FundingSource values";
  const sources = RSAJ_PACK.lists.find((l) => l.model === "FundingSource")!.rows;
  const measures = RSAJ_PACK.lists.find((l) => l.model === "ImpactMeasure")!.rows;

  it("load the four stated sources, citing SF-01, SF-03 and PR-04; only the sukuk has an envelope", () => {
    expect(sources.map((r) => [r.code, r.values.nameEn, r.values.envelope ?? null])).toEqual([
      ["SUKUK26T1", "Sukuk Tranche 1 2026", "100000000.00"],
      ["INTERNAL", "Internal", null],
      ["GRANT", "Grant", null],
      ["NA", "Not applicable", null],
    ]);
    for (const r of sources) expect([r.requirement, r.source], r.code).toEqual(["SF-01, SF-03, PR-04", SOURCE]);
  });

  it("leave the sukuk's eligibility unset (SUK-LAND and SUK-TANK are D365 test groups, RSAJ question 40); the other three take any category, ASSUMED", () => {
    const sukuk = sources.find((r) => r.code === "SUKUK26T1")!;
    expect([sukuk.values.categoriesRestricted, sukuk.values.eligibleCategoryCodes, sukuk.values.eligibilityProvenance]).toEqual([undefined, undefined, undefined]);
    for (const code of ["INTERNAL", "GRANT", "NA"]) expect(sources.find((r) => r.code === code)!.values, code).toMatchObject({ categoriesRestricted: false, eligibilityProvenance: "ASSUMED" });
  });

  it("are written STATED with their citation; the two measures ASSUMED; no project category is written", () => {
    const w = planPacks([RSAJ_PACK, GENERIC_PACK], fresh).writes;
    const rows = (model: string) => w.filter((x) => x.kind === "ROW" && x.model === model).map((x) => (x.kind === "ROW" ? [x.code, x.values.provenance, x.values.governingSource] : null));
    expect(rows("FundingSource")).toEqual(["SUKUK26T1", "INTERNAL", "GRANT", "NA"].map((c) => [c, "STATED", SOURCE]));
    expect(rows("ImpactMeasure")).toEqual([
      ["storage_added", "ASSUMED", "SF-04 (the requirement's own examples)"],
      ["households_served", "ASSUMED", "SF-04 (the requirement's own examples)"],
    ]);
    expect(measures.map((r) => [r.values.nameEn, r.values.unit])).toEqual([["Storage added", "ML"], ["Households served", "households"]]);
    expect(w.some((x) => x.model === "ProjectCategory")).toBe(false);
  });
});

describe("no product file uses the RSAJ pack", () => {
  it("is imported by no file outside prisma/rsaj/ but the pack index and the tests", () => {
    const root = process.cwd();
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = path.join(dir, f);
        return statSync(p).isDirectory() ? (["generated", "node_modules", "migrations"].includes(f) ? [] : walk(p)) : /\.(ts|tsx|mts|mjs)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [toPosix(path.relative(root, p))] : [];
      });
    const files = ["src", "prisma", "scripts"].flatMap((d) => walk(path.join(root, d)));
    const importers = files.filter((f) => !f.startsWith("prisma/rsaj/") && /rsaj\/starter-pack/.test(readFileSync(path.join(root, f), "utf8")));
    // prisma/packs/index.ts names the file by path for the loader; it does not import the pack's values.
    expect(importers).toEqual(["prisma/packs/index.ts"]);
  });
});
