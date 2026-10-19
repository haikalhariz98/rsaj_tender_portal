import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { toPosix } from "@/lib/scan/files";

import { MATTER_KINDS, type MatterKind } from "./labels";
import { MATTER_AMOUNT_SULIT, matterAmountIsSulit, SULIT_AMOUNT_KINDS, surfaceChipsAmounts } from "./matter-amount";
import { TABLE_PREFILL_KEYS, tablePrefillFromQuery, tablingQuery } from "./table-prefill";

/**
 * Every screen that renders a committee matter's amount, with the matter kinds it can show.
 * A screen that can show a kind whose amount is SULIT (a requisition's gate matter: its amount
 * is the department estimate) must carry the chip, proved by `chip` in its source. A screen that
 * shows only kinds that are not SULIT needs none; a screen that lists matters but shows no
 * amount says so (`chip: "NO_AMOUNT"`), and fails the day it starts showing one.
 */
interface Surface {
  file: string;
  what: string;
  kinds: "ANY" | readonly MatterKind[];
  /// Where in the file the surface is, where the file holds more than one: from `region` to
  /// `regionEnd` (or to the end of the function it opens).
  region?: string;
  regionEnd?: string;
  chip: RegExp | "NO_AMOUNT" | null;
}

// Phase 3b, a deliberate change to the patterns below (logged): a screen no longer chips an amount, it holds it to the reader's answer. The agenda draws `matter.amount.sulit` with
// `<SulitValue of>`, the sitting's History judges each row by its matter (`historyAmount`), and the drawer's hint says the amount is SULIT and may be left blank. The rule that
// every surface is held here, and chips what its kinds can show, is unchanged.
const SURFACES: readonly Surface[] = [
  { file: "src/app/page.tsx", what: "dashboard, Committee matters waiting (Value column)", kinds: "ANY", region: 'title={t(D.committeeTitle)}', regionEnd: "rows={data.queue", chip: /key: "value", label: (?:"Value"|t\(D\.value\))[^}]*\bsulit: true/ },
  { file: "src/components/committee/decision-panel.tsx", what: "sitting agenda, each matter's panel", kinds: "ANY", chip: /\{matter\.amount\.sulit \? <SulitValue of=\{matter\.amount\.sulit\} \/>/ },
  { file: "src/app/committees/[id]/page.tsx", what: "sitting History, a matter's amount", kinds: "ANY", chip: /historyAmount\(\{[^}]*\}\)[\s\S]*<SulitValue of=\{amount\.sulit\} \/>/ },
  { file: "src/app/committees/editors.tsx", what: "sitting, Table a matter drawer's Amount", kinds: "ANY", chip: /name: "amount", label: "Amount", hint: "SULIT:/ },
  { file: "src/app/requisitions/[id]/page.tsx", what: "requisition, Committee matters card", kinds: ["REQUISITION"], region: "function CommitteeMatters(", chip: "NO_AMOUNT" },
  // C-3 (wave C step C4): ApprovalPanel moved out of the award page; the surface is unchanged.
  { file: "src/app/projects/[id]/award/approval-panel.tsx", what: "award, the committee step's decision amount", kinds: ["EXERCISE"], chip: null },
];

/// Where a screen reads committee matters, and where it renders an amount.
const MATTER_SOURCE = /\bDecisionPanel\b|\bcommitteeDecisions?\b|\bCommitteeDecision\b|\.decisions\b|data\.queue\b|\brecordOf\(|\btableMatter\b/;
const RENDERS_AMOUNT = /\.amount\b|name: "amount"|field === "amount"/;

const root = process.cwd();
const read = (f: string) => readFileSync(join(root, f), "utf8");
function screens(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(join(root, p)).isDirectory()) return screens(p);
    return /\.tsx$/.test(name) ? [toPosix(p)] : [];
  });
}
/// A function's body, from its declaration to the first line that closes it.
function regionOf(source: string, start: string, until = "\n}\n"): string {
  const at = source.indexOf(start);
  if (at === -1) return "";
  const end = source.indexOf(until, at);
  return source.slice(at, end === -1 ? undefined : end);
}

describe("a matter's amount is SULIT by its kind (keyed on MatterKind)", () => {
  it("every kind is decided or says it is not, and a requisition's gate matter is SULIT", () => {
    expect(Object.keys(MATTER_AMOUNT_SULIT).sort()).toEqual([...MATTER_KINDS].sort());
    expect(MATTER_AMOUNT_SULIT.REQUISITION.sulit).toBe(true);
    expect(matterAmountIsSulit("REQUISITION")).toBe(true);
    // Ruled not chipped: the awarded value (question to RSAJ, carried).
    expect(matterAmountIsSulit("EXERCISE")).toBe(false);
    for (const k of MATTER_KINDS) expect(MATTER_AMOUNT_SULIT[k].why, k).toMatch(/\.$/);
  });
  it("not decided, or no kind at all (a manual matter), reads as SULIT, never as open", () => {
    expect(matterAmountIsSulit(null)).toBe(true);
    for (const k of MATTER_KINDS.filter((x) => MATTER_AMOUNT_SULIT[x].sulit === null)) expect(matterAmountIsSulit(k), k).toBe(true);
    expect(SULIT_AMOUNT_KINDS).toContain("REQUISITION");
    expect(surfaceChipsAmounts("ANY")).toBe(true);
    expect(surfaceChipsAmounts(["EXERCISE"])).toBe(false);
    expect(surfaceChipsAmounts(["EXERCISE", "REQUISITION"])).toBe(true);
  });
});

describe("every screen that renders a committee matter's amount chips it where its kind is SULIT", () => {
  for (const s of SURFACES) {
    it(`${s.what} (${s.file})`, () => {
      const source = read(s.file);
      const region = s.region ? regionOf(source, s.region, s.regionEnd) : source;
      expect(region, `${s.region} not found in ${s.file}`).not.toBe("");
      if (s.chip === "NO_AMOUNT") {
        // It lists matters that may be SULIT: the day it shows an amount, it must chip it.
        if (/\bamount\b/.test(region)) expect(region, `${s.what} renders an amount without the SULIT chip`).toMatch(/<SulitValue>|sulit: true/);
        return;
      }
      if (surfaceChipsAmounts(s.kinds)) expect(region, `${s.what} renders a SULIT matter amount without the chip`).toMatch(s.chip ?? /<SulitValue>|sulit: true/);
    });
  }

  it("no screen renders a matter's amount without being held here", () => {
    const listed = new Set(SURFACES.map((s) => s.file));
    const missing = [...screens("src/app"), ...screens("src/components")]
      .filter((f) => !/\.test\./.test(f))
      .filter((f) => {
        const src = read(f);
        return MATTER_SOURCE.test(src) && RENDERS_AMOUNT.test(src);
      })
      .filter((f) => !listed.has(f));
    expect(missing, "a screen renders a committee matter's amount: add it to SURFACES with the kinds it shows").toEqual([]);
  });

  it("each surface held here still renders matters, so none is stale", () => {
    for (const s of SURFACES) expect(MATTER_SOURCE.test(read(s.file)), s.file).toBe(true);
  });
});

describe("no tabling link carries an amount in its URL", () => {
  it("the link names the record; the amount is read on the server", () => {
    const q = new URLSearchParams(tablingQuery({ subject: "Gate", domain: "requisition_gate", act: "R", matterKind: "REQUISITION", matterRef: "REQ/1", source: { kind: "requisition", id: "r1" } }));
    expect(q.get("requisitionId")).toBe("r1");
    expect(q.has("amount")).toBe(false);
    expect(q.has("value")).toBe(false);
    expect(new URLSearchParams(tablingQuery({ subject: "A", domain: "d", act: "A", matterKind: "EXERCISE", matterRef: "X/1", source: { kind: "award", id: "a1" } })).get("awardId")).toBe("a1");
  });
  it("an amount in the query (an old link) is never copied into the drawer", () => {
    expect(TABLE_PREFILL_KEYS).not.toContain("amount");
    const p = tablePrefillFromQuery({ table: "1", subject: "Gate", amount: "250000.00", requisitionId: "r1" });
    expect(p).toEqual({ values: { subject: "Gate" }, source: { kind: "requisition", id: "r1" } });
    expect(tablePrefillFromQuery({ subject: "Gate" })).toBeNull();
  });
  it("no screen builds a committees link with an amount or value in it", () => {
    const bad: string[] = [];
    for (const f of [...screens("src/app"), ...screens("src/components")]) {
      read(f).split("\n").forEach((line, i) => {
        if (/\/committees\//.test(line) && /[?&{,]\s*(amount|value)\s*[:=]/.test(line)) bad.push(`${f}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
