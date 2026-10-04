import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ACT_STATUS, actStatusBlocker, actStatusFault, actStatusText, CONTRACT_ACTS, type ContractAct } from "./act-status";
import { CONTRACT_STATUSES } from "./types";

/**
 * Review S1 (6.13 Part B, Run 1a fix round): the screen and the act ask the same table. A contract panel never decides
 * "executed" or "which states" from a list of its own: it reads isExecuted, the rule's own helpers, or the act x status
 * table. Each section that offers an act states its family's refusal first (actStatusBlocker, which is actStatusFault in
 * the acts' words) and gates its drawers with it (ActGate), so a drawer with no blocker of its own is gated too.
 */

const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
const TSX = walk("src").filter((f) => f.endsWith(".tsx") && !f.includes("/generated/"));

/// Contract statuses no other enum in the product shares (ACTIVE, CLOSED and CANCELLED are shared, so they do not mark a list).
const OWN = ["NUMBER_ALLOCATED", "IN_PREPARATION", "PENDING_LEGAL_ENDORSEMENT", "RETURNED_FOR_AMENDMENT", "LEGALLY_ENDORSED", "EXECUTED", "STAMPED", "PRACTICALLY_COMPLETE", "MAKING_GOOD_COMPLETE", "FINAL_CERTIFICATE_ISSUED", "TERMINATED"];
/// An array literal of two or more quoted names, at least one of them a contract status of its own.
const statusLists = (src: string) => [...src.matchAll(/\[\s*"[A-Z_]+"(?:\s*,\s*"[A-Z_]+")+\s*,?\s*\]/g)].map((m) => m[0]).filter((lit) => OWN.some((s) => lit.includes(`"${s}"`)));

/// The component functions of a file, by name, each with its body up to the next top-level function.
function components(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const heads = [...src.matchAll(/^(?:export )?(?:async )?function ([A-Z]\w*)\(/gm)];
  heads.forEach((h, i) => out.set(h[1], src.slice(h.index, heads[i + 1]?.index ?? src.length)));
  return out;
}
const offersAct = (body: string) => /<\w+Drawer\b|<Blocked\b/.test(body);

const DIR = "src/app/projects/[id]";
const PANEL_FILES = ["payment-panels.tsx", "supervision-panels.tsx", "formation-panels.tsx", "baseline-panel.tsx", "variation-panels.tsx", "page.tsx"];

/// Each section that offers an act, and the families of the acts it offers (as each act's wrapper names them).
const SECTION_FAMILIES: Readonly<Record<string, readonly ContractAct[]>> = {
  OpeningCard: ["OPENING_POSITION"],
  ValuationsSection: ["VALUATION"],
  CurrentValuation: ["VALUATION"],
  RetentionSection: ["RETENTION_RELEASE"],
  AdvanceSection: ["ADVANCE_PAYMENT"],
  DamagesSection: ["DAMAGES"],
  TeamPanel: ["SUPERVISION"],
  StartSection: ["SUPERVISION"],
  DiarySection: ["SUPERVISION"],
  OversightSection: ["SUPERVISION"],
  RecordsSection: ["SUPERVISION"],
  AssemblySection: ["FORMATION"],
  ChecksSection: ["FORMATION"],
  CheckCard: ["FORMATION"],
  LegalSection: ["FORMATION"],
  SigningSection: ["FORMATION", "COPIES_AND_CUSTODY"],
  CopiesSection: ["COPIES_AND_CUSTODY", "ORIGINALS"],
  BaselinePanel: ["BASELINE"],
  VariationsSection: ["VARIATION"],
  AdjustmentsSection: ["SUM_ADJUSTMENT"],
  OverviewPanel: ["FORMATION"],
  SecuritiesPanel: ["FORMATION"],
};

/// Components that offer no act of their own, each with why.
const NO_ACT: Readonly<Record<string, string>> = {
  PaymentsPanel: "Dispatches to its sections, which gate themselves.",
  SitePanel: "Dispatches to its sections, which gate themselves.",
  FormationPanel: "Dispatches to its sections, which gate themselves.",
  VariationsPanel: "Dispatches to its sections, which gate themselves.",
};

describe("S1: no hand-written status list on a screen", () => {
  it("the scan catches a hand-written list and passes another enum's (self-test)", () => {
    expect(statusLists(`const x = ["EXECUTED", "STAMPED", "ACTIVE"].includes(s);`)).toHaveLength(1);
    expect(statusLists(`["LEGALLY_ENDORSED", "EXECUTED", "STAMPED", "ACTIVE"].includes(status)`)).toHaveLength(1);
    expect(statusLists(`["CANCELLED", "CLOSED"].includes(r.status)`)).toEqual([]);
    expect(statusLists(`["CLOSED", "CERTIFIED"]`)).toEqual([]);
  });

  it("no .tsx file holds one: each reads isExecuted, the rule's own helper or the table", () => {
    expect(TSX.length).toBeGreaterThan(100);
    const found = TSX.flatMap((f) => statusLists(readFileSync(f, "utf8")).map((lit) => `${f}: ${lit}`));
    expect(found).toEqual([]);
  });

  it("the contract list's executed view and its count read the same rule", () => {
    const page = readFileSync("src/app/projects/page.tsx", "utf8");
    expect(page).toMatch(/isExecuted\(status\) \? \["executed"\]/);
    expect(page).toMatch(/beforeExecution\(status\) \? \["forming"\]/);
    expect(readFileSync("src/lib/contract/load.ts", "utf8")).toMatch(/status: \{ in: \[\.\.\.EXECUTED_STATES\] \}/);
  });

  it("the securities panel and the briefing ask the act's own rules", () => {
    const page = readFileSync(`${DIR}/page.tsx`, "utf8");
    expect(page).toMatch(/const shut = actStatusBlocker\("FORMATION", status\);\n\s+const wcOpen = !shut && !isExecuted\(status\);/);
    const formation = readFileSync(`${DIR}/formation-panels.tsx`, "utf8");
    expect(formation).toMatch(/!c\.briefing && !custody && briefingOpen\(status\)/);
    expect(readFileSync("src/lib/contract/sign.ts", "utf8")).toMatch(/if \(!briefingOpen\(i\.status\)\) out\.push\(\{ code: "NOT_YET_ENDORSED"/);
  });
});

describe("S1: each panel section states its family's refusal first and gates its drawers", () => {
  const all = new Map<string, { file: string; body: string }>();
  for (const f of PANEL_FILES) for (const [name, body] of components(readFileSync(`${DIR}/${f}`, "utf8"))) all.set(name, { file: f, body });

  it("the splitter finds the sections (self-test)", () => {
    for (const name of ["OpeningCard", "AdvanceSection", "TeamPanel", "SigningSection", "BaselinePanel", "SecuritiesPanel"]) expect(all.has(name), name).toBe(true);
    expect(offersAct(all.get("AdvanceSection")!.body)).toBe(true);
    expect(offersAct(all.get("PaymentSummaryCard")!.body)).toBe(false);
  });

  it("every component that offers an act is listed with its families, or named as offering none", () => {
    const offering = [...all].filter(([, x]) => offersAct(x.body)).map(([n]) => n);
    for (const n of offering) expect(SECTION_FAMILIES[n] ?? NO_ACT[n], n).toBeDefined();
    for (const n of Object.keys(SECTION_FAMILIES)) expect(all.has(n), n).toBe(true);
  });

  it("each listed section asks the table (actStatusBlocker, or actStatusFault) for each of its families and gates its drawers with it", () => {
    for (const [n, families] of Object.entries(SECTION_FAMILIES)) {
      const body = all.get(n)!.body;
      for (const fam of families) expect(body, `${n} ${fam}`).toMatch(new RegExp(`actStatus(?:Blocker|Fault)\\("${fam}", `));
      if (/<\w+Drawer\b/.test(body)) expect(body, n).toMatch(/<ActGate blocker=\{/);
    }
  });

  it("the opening position and the advance (payment panels :157 and :550) put the table's refusal first", () => {
    expect(all.get("OpeningCard")!.body).toMatch(/const blocker = shut \?\? /);
    expect(all.get("AdvanceSection")!.body).toMatch(/const blocker = shut \?\? /);
  });
});

describe("S1: actStatusBlocker is the table in the acts' words", () => {
  it("for every family in every state: null where allowed, actStatusText of the fault otherwise", () => {
    for (const a of CONTRACT_ACTS)
      for (const s of CONTRACT_STATUSES) {
        const f = actStatusFault(a, s);
        expect(actStatusBlocker(a, s), `${a} ${s}`).toBe(f ? actStatusText(f) : null);
        if (ACT_STATUS[a][s] === "ALLOWED" && s !== "CANCELLED") expect(actStatusBlocker(a, s)).toBeNull();
      }
  });

  it("on a practically complete contract the opening position and the advance are refused, valuations are not", () => {
    expect(actStatusBlocker("OPENING_POSITION", "PRACTICALLY_COMPLETE")).toBe("Not recorded while the contract stands at “Practically complete”.");
    expect(actStatusBlocker("ADVANCE_PAYMENT", "PRACTICALLY_COMPLETE")).toBe("Not recorded while the contract stands at “Practically complete”.");
    expect(actStatusBlocker("VALUATION", "PRACTICALLY_COMPLETE")).toBeNull();
    expect(actStatusBlocker("SUPERVISION", "FINAL_CERTIFICATE_ISSUED")).toMatch(/^Not recorded while the contract stands at “/);
  });
});
