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

const DIR = "src/app/projects/[id]";

/**
 * BD-613-123's condition (residual round): the "83 of 83" was a hand count. This scan proves it. From every component
 * that holds an `<ActGate`, it follows every element the component renders, through imports, to the components that
 * define them. Following stops at a gated component: RecordEditor or Blocked (each reads ActGate, asserted below), or a
 * component that reads `useActGate(` itself. Anything else that opens a drawer or a form (a raw `<form`, `<dialog`,
 * `role="dialog"`, `<button`, `formAction=`) found on the way fails, with its path, unless it is a named exception with
 * its reason.
 *
 * Run 1b, first commit (the final review's S-A, flagged against run 1a): until then only an unresolved element named
 * "…Drawer" failed, so a const component, a default import or a re-export was skipped silently. Now any element the
 * scan cannot resolve fails when it is imported from src/, declared in the same file as a const, or neither imported nor
 * declared; components are read
 * as `function X(` and as `(export )?const X = (…) =>`; default imports and `export { X } from` re-exports are followed.
 * One file is a named exception, with its reason: src/components/icons.tsx (UNFOLLOWED_FILES).
 *
 * What it does not read (its blind spots, declared): an element imported from a package (react, next) is not followed;
 * an element written in a generic's
 * position (`Array<X>`, `useState<X>`) is not an element (the lookbehind skips it); a name neither imported nor declared
 * fails (TypeScript would refuse it, so only a global could be one); a component built by a call
 * (`const X = memo(Y)`) is not followed but fails as unresolved; a namespace import (`import * as N`) and `<N.X>` are not
 * followed (none exists in src today; a test below pins that); a component passed as a prop and rendered by variable
 * (`<props.as>`, `const C = x; <C />`) is not followed.
 */
type Sources = ReadonlyMap<string, string>;
const RAW_OPENER = /<form\b|<dialog\b|role="dialog"|<button\b|formAction=/;
const GATED_TERMINALS = new Set(["RecordEditor", "Blocked"]);

/// The component functions of a file, by name (exported, default-exported or local), each with its body: `function X(`
/// and `(export )?const X = (…) =>` (run 1b's first commit). A default export is also keyed "default".
function componentsOf(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const heads = [...src.matchAll(/^(?:export )?(?:default )?(?:async )?function ([A-Z]\w*)\(|^(?:export )?const ([A-Z]\w*)(?::[^=\n]+)? = (?:async )?\([^)\n]*\)(?::[^=\n]+)? =>/gm)];
  heads.forEach((h, i) => out.set(h[1] ?? h[2], src.slice(h.index, heads[i + 1]?.index ?? src.length)));
  const dflt = /^export default function ([A-Z]\w*)\(/m.exec(src)?.[1] ?? /^export default ([A-Z]\w*);/m.exec(src)?.[1];
  if (dflt && out.has(dflt)) out.set("default", out.get(dflt)!);
  return out;
}

/// Capitalised names a file declares as a const (a component or not): an element of that name the scan cannot read as a
/// component (`const X = memo(Y)`) fails as unresolved.
const constsOf = (src: string) => new Set([...src.matchAll(/^(?:export )?const ([A-Z]\w*)\b/gm)].map((m) => m[1]));

/// Where an imported name comes from: the file among the sources (null for a package, or a src/ path not among them),
/// whether the specifier is the product's own (src/), and the name it has there ("default" for a default import).
type Imported = { file: string | null; own: boolean; name: string };

const targetOf = (file: string, spec: string, sources: Sources) => {
  const base = spec.startsWith("@/") ? `src/${spec.slice(2)}` : spec.startsWith(".") ? join(file, "..", spec) : null;
  const target = base ? ([".tsx", ".ts", "/index.tsx", "/index.ts"].map((e) => base + e).find((p) => sources.has(p)) ?? null) : null;
  return { own: base !== null, target };
};

/// A file's imports (named and default; type-only ones left out, they are never elements): local name to where it is from.
function importsOf(file: string, src: string, sources: Sources): Map<string, Imported> {
  const out = new Map<string, Imported>();
  for (const m of src.matchAll(/import\s+(type\s+)?([\w$]+\s*,\s*)?(?:\{([^}]*)\}|([\w$]+))?\s*from\s+"([^"]+)"/g)) {
    if (m[1]) continue;
    const { own, target } = targetOf(file, m[5], sources);
    const dflt = (m[2] ?? "").replace(",", "").trim() || m[4];
    if (dflt) out.set(dflt, { file: target, own, name: "default" });
    for (const part of (m[3] ?? "").split(",")) {
      if (/^\s*type\s/.test(part)) continue;
      const names = part.trim().split(/\s+as\s+/);
      if (names[0]) out.set((names[1] ?? names[0]).trim(), { file: target, own, name: names[0].trim() });
    }
  }
  return out;
}

/// A file's re-exports (`export { A, B as C } from "…"`): exported name to where it is from.
function reexportsOf(file: string, src: string, sources: Sources): Map<string, Imported> {
  const out = new Map<string, Imported>();
  for (const m of src.matchAll(/export\s+\{([^}]*)\}\s*from\s+"([^"]+)"/g)) {
    const { own, target } = targetOf(file, m[2], sources);
    for (const part of m[1].split(",")) {
      const names = part.replace(/^\s*type\s+/, "").trim().split(/\s+as\s+/);
      if (names[0]) out.set((names[1] ?? names[0]).trim(), { file: target, own, name: names[0].trim() });
    }
  }
  return out;
}

/// Files whose components are not followed, each with why (the list can only shrink; a new entry needs a reason).
const UNFOLLOWED_FILES: Readonly<Record<string, string>> = {
  "src/components/icons.tsx": "The product's inline SVG icons (AGENTS.md): each is a const arrow drawing an <svg> through the local Icon; none opens a drawer or a form or records anything. Asserted below by reading the file.",
};

/// The elements a body renders: a capitalised tag in a JSX position (not a generic's `Array<X>` or `useState<X>`).
const elementsOf = (body: string) => new Set([...body.matchAll(/(?<![\w$.)\]])<([A-Z]\w*)\b/g)].map((m) => m[1]));

type Parsed = { comps: Map<string, string>; consts: Set<string>; imports: Map<string, Imported>; reexports: Map<string, Imported> };
const parseAll = (sources: Sources): Map<string, Parsed> =>
  new Map([...sources].map(([f, src]) => [f, { comps: componentsOf(src), consts: constsOf(src), imports: importsOf(f, src, sources), reexports: reexportsOf(f, src, sources) }]));

/// Where an element is defined: its file and body; "external" (a package: not followed); "unknown" (neither imported nor
/// declared in the file: a global, which TypeScript allows only if declared somewhere); "unfollowed" (a named file); or
/// "unresolved" (imported from src/ or declared as a const, and still not read as a component).
type Resolved = { file: string; body: string } | "external" | "unknown" | "unfollowed" | "unresolved";
function resolveIn(parsed: ReadonlyMap<string, Parsed>, file: string, name: string): Resolved {
  const p = parsed.get(file)!;
  const local = p.comps.get(name);
  if (local) return { file, body: local };
  if (p.consts.has(name)) return "unresolved";
  const imp = p.imports.get(name);
  if (!imp) return "unknown";
  const follow = (from: Imported, depth: number): Resolved => {
    if (!from.own) return "external";
    if (!from.file) return "unresolved";
    if (UNFOLLOWED_FILES[from.file] !== undefined) return "unfollowed";
    const q = parsed.get(from.file)!;
    const body = q.comps.get(from.name);
    if (body) return { file: from.file, body };
    const re = q.reexports.get(from.name);
    return re && depth < 8 ? follow(re, depth + 1) : "unresolved";
  };
  return follow(imp, 0);
}

type Reach = { violations: string[]; drawers: Set<string>; exceptionsUsed: Set<string>; roots: string[]; unfollowed: Set<string> };

/// Every path from a gated section to an ungated opener, over the given sources.
function gateReach(sources: Sources, exceptions: Readonly<Record<string, string>>): Reach {
  const reach: Reach = { violations: [], drawers: new Set(), exceptionsUsed: new Set(), roots: [], unfollowed: new Set() };
  const parsed = parseAll(sources);
  const done = new Set<string>();
  const visit = (file: string, name: string, body: string, path: string[]) => {
    const key = `${file}#${name}`;
    if (done.has(key)) return;
    done.add(key);
    if (/\buseActGate\(/.test(body)) return;
    if (RAW_OPENER.test(body)) reach.violations.push(`${path.join(" > ")}: ${RAW_OPENER.exec(body)![0]}`);
    for (const el of elementsOf(body)) {
      if (el === "ActGate") continue;
      if (GATED_TERMINALS.has(el)) continue;
      if (exceptions[el] !== undefined) {
        reach.exceptionsUsed.add(el);
        continue;
      }
      const def = resolveIn(parsed, file, el);
      if (def === "unresolved" || def === "unknown") reach.violations.push(`${[...path, el].join(" > ")}: unresolved`);
      if (def === "unfollowed") reach.unfollowed.add(el);
      if (typeof def === "string") continue;
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

/// Shared components that open nothing and record nothing, each with why: neither an act on the page nor an ungated opener.
const RECORDS_NOTHING: Readonly<Record<string, string>> = {
  Tabs: "Switches the panel shown; it records nothing. The panels it shows are followed from the page that builds them.",
  MoreText: "Shows the rest of a long text (a page header's subtitle); it records nothing (no drawer or form in more-text.tsx).",
  DataList: "The shared list: its buttons filter, sort, select and page the rows, and record nothing (no drawer or form in data-list.tsx). Its rows link to records whose own pages gate their acts.",
};
/// Components a gated section may render that are neither gated nor ungated openers, each with why.
const GATE_EXCEPTIONS: Readonly<Record<string, string>> = {
  ...RECORDS_NOTHING,
  OwnerAttachments: "The attachments panel: each purpose is judged by the document store through ownerState, in the table's words (BD-613-115), and the screen and the store give the same answer (contract-act-status.test.ts).",
};

const SOURCES: Sources = new Map(walk("src").filter((f) => /\.tsx?$/.test(f) && !f.includes("/generated/") && !/\.test\.tsx?$/.test(f)).map((f) => [f, readFileSync(f, "utf8")]));
/// The award's panels (wave C step C4, C-3): they moved under the case route but are the award's, not the contract's. They run before a
/// contract exists and are judged by the award's own status rules (editable, cancellable, and the securities register's FORMATION row,
/// which act-status-scan.test.ts reads in securities-panel.tsx). They were outside this scan at `src/app/awards/[id]`, so leaving them out keeps its scope as it was.
const AWARD_DIR = `${DIR}/award/`;
/// Every .tsx file under the contract's pages (code re-review S-2: no hand list), except the award's panels above.
const PAGE_FILES = [...SOURCES.keys()].filter((f) => f.startsWith(`${DIR}/`) && !f.startsWith(AWARD_DIR) && f.endsWith(".tsx"));

/**
 * Code re-review S-2: whether a component offers an act, followed through what it renders: it opens a drawer or a
 * form itself (RecordEditor, Blocked, a raw form, dialog, button or formAction, a drawer it cannot resolve, the
 * attachments panel), or it renders a component that does.
 */
function offersActIn(sources: Sources) {
  const parsed = parseAll(sources);
  const memo = new Map<string, boolean>();
  const offers = (file: string, name: string, body: string): boolean => {
    const key = `${file}#${name}`;
    if (memo.has(key)) return memo.get(key)!;
    memo.set(key, false);
    let yes = RAW_OPENER.test(body) || /<(?:RecordEditor|Blocked|OwnerAttachments)\b|\buseActGate\(/.test(body);
    for (const el of elementsOf(body)) {
      if (yes) break;
      if (RECORDS_NOTHING[el] !== undefined) continue;
      const def = resolveIn(parsed, file, el);
      if (typeof def !== "string") yes = offers(def.file, el, def.body);
      else if (def === "unresolved" || /Drawer$/.test(el)) yes = true;
    }
    memo.set(key, yes);
    return yes;
  };
  return offers;
}

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
  // AC-16: answering a contractor's submission is an act of the contract's supervision (answerContractorSubmission).
  SubmissionsTab: ["SUPERVISION"],
};

/// Components that offer no act of their own, each with why.
const NO_ACT: Readonly<Record<string, string>> = {
  PaymentsPanel: "Dispatches to its sections, which gate themselves.",
  SitePanel: "Dispatches to its sections, which gate themselves.",
  FormationPanel: "Dispatches to its sections, which gate themselves.",
  VariationsPanel: "Dispatches to its sections, which gate themselves.",
  ContractPage: "Dispatches to its tabs' panels and sections, which gate themselves (its header offers no act).",
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

/// Components on the contract's pages that render acts only inside a parent's gate (the parent's `<ActGate>` wraps the
/// tabs or the header that holds them), each with the parent. The certificate and variation pages (code re-review S-2).
const GATED_BY_PARENT: Readonly<Record<string, string>> = {
  FiguresPanel: "CertificatePage",
  FinanceCard: "FiguresPanel",
  SignaturesPanel: "CertificatePage",
  RoutingPanel: "CertificatePage",
  DistributionPanel: "CertificatePage",
  ApplicationPanel: "VariationPage",
  ApprovalPanel: "VariationPage",
  InstructionPanel: "VariationPage",
  MeasurementPanel: "VariationPage",
  OrderPanel: "VariationPage",
};

/// The pages whose families depend on the record: each asks one function for its gates, and wraps its header's acts and
/// its tabs in them.
const PAGE_GATES: Readonly<Record<string, RegExp[]>> = {
  CertificatePage: [/const gates = certificateGates\(cert\.kind as CertificateKind, cert\.status as CertificateStatus, l\.contract\.status as ContractStatus\);/, /<ActGate blocker=\{gates\.acts\}>\{action\}<\/ActGate>/, /<ActGate blocker=\{gates\.void\}>/, /<ActGate blocker=\{gates\.acts\}>\s*<Tabs /],
  VariationPage: [/const gate = actStatusBlocker\("VARIATION", l\.contract\.status as ContractStatus\);/, /<ActGate blocker=\{gate\}>\s*\{action\}/, /<ActGate blocker=\{gate\}>\s*<Tabs /],
};

describe("S1 and S-2: every component on the contract's pages that offers an act states its family's refusal first and is gated", () => {
  const offers = offersActIn(SOURCES);
  /// Keyed by name; a name defined in more than one file is keyed file#name.
  const defs = PAGE_FILES.flatMap((file) => [...componentsOf(SOURCES.get(file)!)].map(([name, body]) => ({ file, name, body })));
  const all = new Map<string, { file: string; body: string }>();
  for (const d of defs) all.set(defs.filter((x) => x.name === d.name).length > 1 ? `${d.file}#${d.name}` : d.name, { file: d.file, body: d.body });
  const offering = [...all].filter(([k, x]) => offers(x.file, k.split("#").pop()!, x.body)).map(([k]) => k);
  const isDrawer = (k: string) => /Drawer$/.test(k) && /<RecordEditor\b/.test(all.get(k)!.body);

  it("the files are every .tsx under the contract's pages, the two record pages included (no hand list)", () => {
    expect(PAGE_FILES).toContain(`${DIR}/certificates/[certId]/page.tsx`);
    expect(PAGE_FILES).toContain(`${DIR}/variations/[variationId]/page.tsx`);
    expect(PAGE_FILES).toContain(`${DIR}/payment-panels.tsx`);
    expect(PAGE_FILES.length).toBe(walk(DIR).filter((f) => f.endsWith(".tsx") && !f.startsWith(AWARD_DIR)).length);
  });

  it("offersAct follows what a component renders (self-test)", () => {
    const fake: Sources = new Map([
      ["src/app/z/a.tsx", `import { Leaf } from "./b";\nexport function Plain() {\n  return <Card><Badge /></Card>;\n}\nexport function Via() {\n  return <Card><Leaf /></Card>;\n}\nexport function Raw() {\n  return <form />;\n}\nexport function Unknown() {\n  return <SomeDrawer />;\n}\nexport function Attach() {\n  return <OwnerAttachments />;\n}\n`],
      ["src/app/z/b.tsx", `export function Leaf() {\n  return <RecordEditor />;\n}\n`],
    ]);
    const o = offersActIn(fake);
    const c = componentsOf(fake.get("src/app/z/a.tsx")!);
    expect(["Plain", "Via", "Raw", "Unknown", "Attach"].map((n) => [n, o("src/app/z/a.tsx", n, c.get(n)!)])).toEqual([["Plain", false], ["Via", true], ["Raw", true], ["Unknown", true], ["Attach", true]]);
    expect(offers(`${DIR}/payment-panels.tsx`, "AdvanceSection", all.get("AdvanceSection")!.body)).toBe(true);
    expect(offers(`${DIR}/payment-panels.tsx`, "PaymentSummaryCard", all.get("PaymentSummaryCard")!.body)).toBe(false);
  });

  it("every component that offers an act is a listed section, a page with its gates, gated by a listed parent, a dispatcher, or a drawer", () => {
    const unlisted = offering.filter((k) => !SECTION_FAMILIES[k] && !PAGE_GATES[k] && !GATED_BY_PARENT[k] && !NO_ACT[k] && !isDrawer(k));
    expect(unlisted).toEqual([]);
    for (const n of [...Object.keys(SECTION_FAMILIES), ...Object.keys(PAGE_GATES), ...Object.keys(GATED_BY_PARENT), ...Object.keys(NO_ACT)]) expect(all.has(n), n).toBe(true);
    for (const n of [...Object.keys(SECTION_FAMILIES), ...Object.keys(PAGE_GATES), ...Object.keys(GATED_BY_PARENT)]) expect(offering, n).toContain(n);
  });

  it("each listed section asks the table (actStatusBlocker, or actStatusFault) for each of its families and gates its drawers with it", () => {
    for (const [n, families] of Object.entries(SECTION_FAMILIES)) {
      const body = all.get(n)!.body;
      for (const fam of families) expect(body, `${n} ${fam}`).toMatch(new RegExp(`actStatus(?:Blocker|Fault)\\("${fam}", `));
      if (/<\w+Drawer\b/.test(body)) expect(body, n).toMatch(/<ActGate blocker=\{/);
    }
  });

  it("the certificate and variation pages ask one function for their gates and wrap their header's acts and their tabs in them", () => {
    for (const [n, patterns] of Object.entries(PAGE_GATES)) for (const re of patterns) expect(all.get(n)!.body, `${n} ${re}`).toMatch(re);
  });

  it("each component gated by a parent is rendered by it, and the chain ends at a page with its gates", () => {
    for (const [n, parent] of Object.entries(GATED_BY_PARENT)) {
      expect(all.get(parent)!.body, `${parent} renders ${n}`).toMatch(new RegExp(`<${n}\\b`));
      let top = parent;
      while (GATED_BY_PARENT[top]) top = GATED_BY_PARENT[top];
      expect(PAGE_GATES[top], `${n}: ${top}`).toBeDefined();
    }
  });

  it("the opening position and the advance (payment panels :157 and :550) put the table's refusal first", () => {
    expect(all.get("OpeningCard")!.body).toMatch(/const blocker = shut \?\? /);
    expect(all.get("AdvanceSection")!.body).toMatch(/const blocker = shut \?\? /);
  });
});

describe("BD-613-123's condition: every drawer or form-opening element inside a gated section is gated", () => {
  const sources = SOURCES;

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

  it("S-A: a const component, a default import and a re-export are followed; one the scan cannot read fails; icons are not followed (self-test)", () => {
    const fake: Sources = new Map([
      ["src/app/q/panel.tsx", `import Dflt from "./dflt";\nimport { Again } from "@/components/ui/field";\nimport { Wrapped } from "./wrapped";\nimport { Pkg } from "some-package";\nimport { Glyph } from "@/components/icons";\nimport type { Shape } from "./wrapped";\nexport function Section() {\n  const rows = useState<Shape>(null);\n  return <ActGate blocker={b}><Arrow /><Dflt /><Again /><Wrapped /><Memo /><Pkg /><Glyph /><Nowhere /></ActGate>;\n}\nconst Arrow = ({ x }: { x: string }) => <button />;\nconst Memo = memo(Arrow);\n`],
      ["src/app/q/dflt.tsx", `export default function Dflt() {\n  return <form />;\n}\n`],
      ["src/components/ui/field.tsx", `export { Again } from "./again";\n`],
      ["src/components/ui/again.tsx", `export const Again = () => (\n  <dialog />\n);\n`],
      ["src/app/q/wrapped.tsx", `export type Shape = { a: 1 };\nexport const Wrapped = forwardRef(function W() { return <form />; });\n`],
      ["src/components/icons.tsx", `export const Glyph = (p: IconProps) => (\n  <Icon {...p}><path /></Icon>\n);\n`],
    ]);
    const r = gateReach(fake, {});
    expect(r.violations.sort()).toEqual([
      "src/app/q/panel.tsx#Section > Again: <dialog",
      "src/app/q/panel.tsx#Section > Arrow: <button",
      "src/app/q/panel.tsx#Section > Dflt: <form",
      "src/app/q/panel.tsx#Section > Memo: unresolved",
      "src/app/q/panel.tsx#Section > Nowhere: unresolved",
      "src/app/q/panel.tsx#Section > Wrapped: unresolved",
    ]);
    expect([...r.unfollowed]).toEqual(["Glyph"]);
    expect(componentsOf(fake.get("src/app/q/panel.tsx")!).has("Arrow")).toBe(true);
    expect(componentsOf(fake.get("src/app/q/dflt.tsx")!).has("default")).toBe(true);
  });

  it("S-A: the one unfollowed file draws icons and opens nothing; no namespace import (a blind spot) exists in src", () => {
    expect(Object.keys(UNFOLLOWED_FILES)).toEqual(["src/components/icons.tsx"]);
    const icons = sources.get("src/components/icons.tsx")!;
    expect(RAW_OPENER.test(icons)).toBe(false);
    expect(icons).not.toMatch(/<RecordEditor\b|<Blocked\b|Drawer\b|useActGate/);
    for (const m of icons.matchAll(/^export (.*)$/gm)) expect(m[1], m[0]).toMatch(/^const [A-Z]\w* = \(p: IconProps\) => \($/);
    expect([...sources].filter(([f, src]) => f.endsWith(".tsx") && /^import \* as /m.test(src)).map(([f]) => f)).toEqual([]);
  });

  it("BD-613-129's reason holds: the shared pieces the scan does not follow open no drawer and record nothing", () => {
    for (const f of ["src/components/data-list.tsx", "src/components/tabs.tsx", "src/components/ui/more-text.tsx"]) expect(sources.get(f), f).not.toMatch(/<RecordEditor\b|Drawer\b|formAction|<form\b|<dialog\b|role="dialog"/);
  });

  it("over the product: no gated section reaches an ungated opener, and every named exception is reached", () => {
    const r = gateReach(sources, GATE_EXCEPTIONS);
    expect(r.roots.length).toBeGreaterThan(10);
    expect(r.violations).toEqual([]);
    // The panels' drawers counted by the scan, not by hand (the fix round's "83 of 83"): each one reached is gated.
    // The fix round's "83 of 83" counted the RecordEditors its four editors files define, not what is gated. Counted by the
    // scan instead: every drawer defined under the contract's pages is reached from a gated section (the certificate and
    // variation pages' too, since code re-review S-2).
    const defined = [...sources.keys()].filter((f) => f.startsWith(`${DIR}/`) && f.endsWith(".tsx")).flatMap((f) => [...componentsOf(sources.get(f)!).keys()].filter((n) => /Drawer$/.test(n)).map((n) => `${f}#${n}`));
    expect(defined.length).toBeGreaterThanOrEqual(83);
    expect(defined.filter((d) => !r.drawers.has(d))).toEqual([]);
    expect([...r.exceptionsUsed].sort()).toEqual(Object.keys(GATE_EXCEPTIONS).sort());
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
