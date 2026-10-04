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

/**
 * BD-613-123's condition (residual round): the "83 of 83" was a hand count. This scan proves it. From every component
 * that holds an `<ActGate`, it follows every element the component renders, through imports, to the components that
 * define them. Following stops at a gated component: RecordEditor or Blocked (each reads ActGate, asserted below), or a
 * component that reads `useActGate(` itself. Anything else that opens a drawer or a form (a raw `<form`, `<dialog`,
 * `role="dialog"`, `<button`, `formAction=`) found on the way fails, with its path, unless it is a named exception with
 * its reason. A drawer the scan cannot resolve fails too, so an import it cannot follow is not a blind spot.
 */
type Sources = ReadonlyMap<string, string>;
const RAW_OPENER = /<form\b|<dialog\b|role="dialog"|<button\b|formAction=/;
const GATED_TERMINALS = new Set(["RecordEditor", "Blocked"]);

/// The component functions of a file, by name (exported, default-exported or local), each with its body.
function componentsOf(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const heads = [...src.matchAll(/^(?:export )?(?:default )?(?:async )?function ([A-Z]\w*)\(/gm)];
  heads.forEach((h, i) => out.set(h[1], src.slice(h.index, heads[i + 1]?.index ?? src.length)));
  return out;
}

/// A file's named imports: local name to the file it comes from (resolved among the sources), or null for a package.
function importsOf(file: string, src: string, sources: Sources): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const m of src.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"/g)) {
    const spec = m[2];
    const base = spec.startsWith("@/") ? `src/${spec.slice(2)}` : spec.startsWith(".") ? join(file, "..", spec) : null;
    const target = base ? ([".tsx", ".ts", "/index.tsx", "/index.ts"].map((e) => base + e).find((p) => sources.has(p)) ?? null) : null;
    for (const part of m[1].split(",")) {
      const names = part.replace(/^\s*type\s+/, "").trim().split(/\s+as\s+/);
      if (names[0]) out.set((names[1] ?? names[0]).trim(), target);
    }
  }
  return out;
}

type Reach = { violations: string[]; drawers: Set<string>; exceptionsUsed: Set<string>; roots: string[] };

/// Every path from a gated section to an ungated opener, over the given sources.
function gateReach(sources: Sources, exceptions: Readonly<Record<string, string>>): Reach {
  const reach: Reach = { violations: [], drawers: new Set(), exceptionsUsed: new Set(), roots: [] };
  const parsed = new Map([...sources].map(([f, src]) => [f, { comps: componentsOf(src), imports: importsOf(f, src, sources) }]));
  const resolve = (file: string, name: string): { file: string; body: string } | null => {
    const p = parsed.get(file)!;
    const local = p.comps.get(name);
    if (local) return { file, body: local };
    const from = p.imports.get(name);
    const body = from ? parsed.get(from)?.comps.get(name) : undefined;
    return from && body ? { file: from, body } : null;
  };
  const done = new Set<string>();
  const visit = (file: string, name: string, body: string, path: string[]) => {
    const key = `${file}#${name}`;
    if (done.has(key)) return;
    done.add(key);
    if (/\buseActGate\(/.test(body)) return;
    if (RAW_OPENER.test(body)) reach.violations.push(`${path.join(" > ")}: ${RAW_OPENER.exec(body)![0]}`);
    for (const el of new Set([...body.matchAll(/<([A-Z]\w*)\b/g)].map((m) => m[1]))) {
      if (el === "ActGate") continue;
      if (GATED_TERMINALS.has(el)) continue;
      if (exceptions[el] !== undefined) {
        reach.exceptionsUsed.add(el);
        continue;
      }
      const def = resolve(file, el);
      if (!def) {
        if (/Drawer$/.test(el)) reach.violations.push(`${[...path, el].join(" > ")}: unresolved`);
        continue;
      }
      if (/Drawer$/.test(el)) reach.drawers.add(`${def.file}#${el}`);
      visit(def.file, el, def.body, [...path, el]);
    }
  };
  for (const [file, p] of parsed)
    for (const [name, body] of p.comps)
      if (/<ActGate\b/.test(body)) {
        reach.roots.push(`${file}#${name}`);
        done.clear();
        visit(file, name, body, [`${file}#${name}`]);
      }
  return reach;
}

/// Components a gated section may render that are neither gated nor ungated openers, each with why.
const GATE_EXCEPTIONS: Readonly<Record<string, string>> = {
  OwnerAttachments: "The attachments panel: each purpose is judged by the document store through ownerState, in the table's words (BD-613-115), and the screen and the store give the same answer (contract-act-status.test.ts).",
  DataList: "The shared list: its buttons filter, sort, select and page the rows, and record nothing (no drawer or form in data-list.tsx). Its rows link to records whose own pages gate their acts.",
};

/// Drawers under the contract's pages that no gated section reaches yet: the certificate and variation pages (code
/// re-review S-2). Exact, so it can only shrink.
const NOT_YET_GATED: readonly string[] = [
  ...["SendForRoutingDrawer", "SendToSigningDrawer", "ReceivedDrawer", "CheckDrawer", "SignatureDrawer", "OverrideDrawer", "CorrectDateDrawer", "DespatchDrawer", "AcknowledgeDrawer", "VoidDrawer", "SendForApprovalDrawer", "DecideRouteStepDrawer", "ChooseRejectionDrawer", "FinancePaymentDrawer"].map((n) => `${DIR}/certificates/[certId]/editors.tsx#${n}`),
  ...["SubmitVariationDrawer", "SoDecisionDrawer", "SendVariationDrawer", "DecideVariationStepDrawer", "CiteCommitteeDrawer", "ChooseVariationRefusalDrawer", "TableVariationDrawer", "CommenceDrawer", "CloseVariationDrawer", "InstructionDrawer", "OralLoopDrawer", "MeasurementDrawer", "RemoveMeasurementDrawer", "DayworkDrawer", "OrderDrawer"].map((n) => `${DIR}/variation-editors.tsx#${n}`),
];

describe("BD-613-123's condition: every drawer or form-opening element inside a gated section is gated", () => {
  const sources: Sources = new Map(walk("src").filter((f) => /\.tsx?$/.test(f) && !f.includes("/generated/") && !/\.test\.tsx?$/.test(f)).map((f) => [f, readFileSync(f, "utf8")]));

  it("RecordEditor and Blocked each read ActGate before their own blocker", () => {
    expect(sources.get("src/components/record-editor.tsx")).toMatch(/const gate = useActGate\(\);\n\s+const submitBlock = gate \?\? ownBlock;/);
    expect(sources.get("src/components/ui/blocked.tsx")).toMatch(/const reason = useActGate\(\) \?\? own;/);
  });

  it("the scan finds an ungated form, button, dialog and unresolved drawer, through imports and local components, and passes gated ones (self-test)", () => {
    const fake: Sources = new Map([
      ["src/app/x/panel.tsx", `import { GoodDrawer, BadDrawer, OwnDrawer } from "./editors";\nimport { Button } from "@/components/ui/button";\nexport function Section() {\n  return <ActGate blocker={b}><GoodDrawer /><BadDrawer /><OwnDrawer /><Inner /><Blocked label="x" reason="y" /><Allowed /></ActGate>;\n}\nfunction Inner() {\n  return <Button onClick={go}>Go</Button>;\n}\nexport function Ungated() {\n  return <form action={x} />;\n}\n`],
      ["src/app/x/editors.tsx", `export function GoodDrawer() {\n  return <RecordEditor action={a} />;\n}\nexport function BadDrawer() {\n  return <dialog open><RecordEditor action={a} /></dialog>;\n}\nexport function OwnDrawer() {\n  const gate = useActGate();\n  return <form />;\n}\n`],
      ["src/components/ui/button.tsx", `export function Button() {\n  return <button />;\n}\n`],
      ["src/app/y/page.tsx", `export default async function Page() {\n  return <ActGate blocker={b}><MissingDrawer /></ActGate>;\n}\n`],
    ]);
    const r = gateReach(fake, { Allowed: "test" });
    expect(r.roots).toEqual(["src/app/x/panel.tsx#Section", "src/app/y/page.tsx#Page"]);
    expect(r.violations.sort()).toEqual([
      "src/app/x/panel.tsx#Section > BadDrawer: <dialog",
      "src/app/x/panel.tsx#Section > Inner > Button: <button",
      "src/app/y/page.tsx#Page > MissingDrawer: unresolved",
    ]);
    expect([...r.drawers].sort()).toEqual(["src/app/x/editors.tsx#BadDrawer", "src/app/x/editors.tsx#GoodDrawer", "src/app/x/editors.tsx#OwnDrawer"]);
    expect([...r.exceptionsUsed]).toEqual(["Allowed"]);
  });

  it("over the product: no gated section reaches an ungated opener, and every named exception is reached", () => {
    const r = gateReach(sources, GATE_EXCEPTIONS);
    expect(r.roots.length).toBeGreaterThan(10);
    expect(r.violations).toEqual([]);
    expect([...r.exceptionsUsed].sort()).toEqual(Object.keys(GATE_EXCEPTIONS).sort());
    // The panels' drawers counted by the scan, not by hand (the fix round's "83 of 83"): each one reached is gated.
    // The fix round's "83 of 83" counted the RecordEditors its four editors files define, not what is gated. Counted by the
    // scan instead: every drawer defined under the contract's pages is reached from a gated section, save the two pages
    // the code re-review's S-2 found ungated (the not-yet list, emptied by the commit that gates them).
    const defined = [...sources.keys()].filter((f) => f.startsWith(`${DIR}/`) && f.endsWith(".tsx")).flatMap((f) => [...componentsOf(sources.get(f)!).keys()].filter((n) => /Drawer$/.test(n)).map((n) => `${f}#${n}`));
    expect(defined.length).toBeGreaterThanOrEqual(83);
    expect(defined.filter((d) => !r.drawers.has(d)).sort()).toEqual([...NOT_YET_GATED].sort());
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
