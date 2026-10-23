import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import GENERIC_PACK from "../../../prisma/packs/generic";
import RSAJ_PACK from "../../../prisma/rsaj/starter-pack";
import { DAL_FIXTURE } from "@/lib/authority/dal-fixture";
import { toPosix } from "@/lib/scan/files";

import { columnsOf, planPacks } from "./plan";

/**
 * The RSAJ starter pack, part 1 (plan step 4.4): every entry cites its requirement and its clause, and none is ASSUMED but the three DAL rules
 * whose slashed codes are a reading (SP-2a, named one by one); the DAL's figures are the Appendix B fixture's; the DAL and the models are
 * drafts only; nothing outside the pack imports it; and `rsaj,generic` plans clean into a fresh organisation.
 */
const SLASHED = ["DP_ABOVE_5M", "TERMINATION", "ADVANCE_PAYMENT"];
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
        expect(r.requirement, `${l.label} ${r.code}`).toMatch(/^(FR|SR)-/);
        expect(r.source.length, `${l.label} ${r.code}`).toBeGreaterThan(5);
        for (const c of Object.keys(r.values)) expect(columnsOf(l.model), `${l.model}.${c}`).toContain(c);
      }
    }
    for (const r of dal.rules) expect([r.requirement, r.source.length > 5], r.ruleKey).toEqual([expect.stringMatching(/^FR-/), true]);
    for (const m of models) expect(m.requirement, m.content.nameEn).toMatch(/^FR-/);
  });

  it("is STATED, and the only ASSUMED entries are the three slashed-code DAL rules", () => {
    expect(RSAJ_PACK.provenance).toBe("STATED");
    expect(dal.rules.filter((r) => r.provenance === "ASSUMED").map((r) => r.ruleKey)).toEqual(SLASHED);
    for (const r of dal.rules.filter((x) => SLASHED.includes(x.ruleKey))) expect(r.source, r.ruleKey).toMatch(/read as .*SP-2a/);
    for (const l of dal.coreRouting) expect([l.provenance, ...l.steps.map((s) => s.provenance)].every((p) => p === "STATED")).toBe(true);
    for (const t of dal.termsBands ?? []) expect(t.provenance).toBe("STATED");
    // Every value of a row's own provenance column, wherever the pack sets one.
    const own = [...RSAJ_PACK.lists.flatMap((l) => l.rows.flatMap((r) => Object.entries(r.values))), ...RSAJ_PACK.groups.flatMap((g) => Object.entries(g.values))].filter(([c]) => /Provenance$/.test(c));
    expect(own.length).toBeGreaterThan(10);
    for (const [c, v] of own) expect(v, c).toBe("STATED");
  });

  it("marks the evaluation models OBSERVED, as the specification says they are practice (decision D1), never ASSUMED", () => {
    for (const m of models) {
      const c = m.content;
      const all = [c.provenance, ...c.stages.flatMap((s) => [s.provenance, ...s.criteria.map((x) => x.provenance), ...s.factors.map((f) => f.provenance)]), ...c.bandSets.map((b) => b.provenance)];
      expect(new Set(all), c.nameEn).toEqual(new Set(["OBSERVED"]));
    }
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
    for (const f of shared) expect(figures(dal.rules.find((r) => r.ruleKey === f.ruleKey)!), f.ruleKey).toEqual(figures(f));
    expect({ ...dal.policy }).toEqual({ ...DAL_FIXTURE.policy });
    expect(dal.coreRouting).toEqual(DAL_FIXTURE.coreRouting);
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
