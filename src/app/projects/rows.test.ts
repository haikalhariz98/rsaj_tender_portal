import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import type { CaseRow } from "@/lib/contract/case-load";
import { ENGLISH } from "@/lib/i18n/language";

import { buildCaseRows, buildCommencedRows, type CommencedVariation } from "./rows";

/**
 * L8 (product owner ruling of 2026-10-24): a reader who sees only the contract stages of a restricted case never sees its exercise's title, on the Projects rows, their
 * export (the same builder), the commenced-variations report, or the case's own header. Each fixture carries a sentinel title where the old code read it.
 */

const SENTINEL = "Sentinel restricted title 7731";
const cx = { derived: new Map(), inDelay: new Set<string>(), policy: null, today: "2026-10-24", lang: ENGLISH };

/// A contract-only row (CONTRACT_STAGES_ONLY): `award` is null. The contract side is typed without the title now; the sentinel stands where it used to be read.
const contractOnly = {
  awardId: "aw_1",
  contractId: "con_1",
  standing: { kind: "LIVE", stage: "ON_SITE" },
  visibility: "CONTRACT_STAGES_ONLY",
  contract: {
    id: "con_1", number: "KP/T/9/2026", status: "EXECUTED", contractSum: new Prisma.Decimal("1000.00"), contractDate: null, dateForCompletion: null, baselines: [],
    award: { id: "aw_1", reference: "AW/9/2026", awardeeName: "Syarikat Maju", exercise: { title: SENTINEL } },
  },
  award: null,
} as unknown as CaseRow;

describe("a Projects row held back to its contract stages (L8)", () => {
  const [row] = buildCaseRows([contractOnly], cx, { forExport: false });

  it("never carries the exercise title: not shown, searched or sorted", () => {
    expect(JSON.stringify(row)).not.toContain(SENTINEL);
    expect(JSON.stringify(buildCaseRows([contractOnly], cx, { forExport: true }))).not.toContain(SENTINEL);
  });

  it("is named by its contract number, with 'Title restricted' beneath, and sorts by that number", () => {
    expect(row!.cells.contract).toMatchObject({ kind: "link", text: "Contract KP/T/9/2026", sub: "Title restricted" });
    expect(row!.sortKeys).toEqual({ contract: "Contract KP/T/9/2026" });
    expect(row!.search).toContain("KP/T/9/2026");
    expect(row!.cells.contractor).toEqual({ kind: "text", text: "Syarikat Maju" });
  });
});

describe("the commenced-variations report (L8)", () => {
  const variation = (exerciseId: string) =>
    ({
      id: `var_${exerciseId}`, reference: "VO/1", description: "Extra drainage", estimate: new Prisma.Decimal("500.00"), commencedOn: new Date("2026-10-20T00:00:00Z"), approvals: [],
      contract: { id: "con_1", number: "KP/T/9/2026", award: { awardeeName: "Syarikat Maju", exerciseId, exercise: { title: SENTINEL } } },
    }) as unknown as CommencedVariation;

  it("keeps a variation of a hidden exercise listed, by its contract number and 'Title restricted', with the title neither shown nor searched", () => {
    const [row] = buildCommencedRows([variation("ex_hidden")], new Set(["ex_hidden"]), "2026-10-24", ENGLISH);
    expect(JSON.stringify(row)).not.toContain(SENTINEL);
    expect(row!.cells.contract).toMatchObject({ kind: "stack", title: "Title restricted", sub: "Contract KP/T/9/2026 · Syarikat Maju" });
    expect(row!.cells.age).toMatchObject({ title: "4 days" });
  });

  it("shows the title to a reader the exercise is open to", () => {
    const [row] = buildCommencedRows([variation("ex_open")], new Set(["ex_hidden"]), "2026-10-24", ENGLISH);
    expect(row!.cells.contract).toMatchObject({ title: SENTINEL });
    expect(row!.search).toContain(SENTINEL);
  });
});

describe("the case header (L8)", () => {
  it("shows the exercise title only to a reader who sees the whole case", () => {
    const page = readFileSync(join(__dirname, "[id]", "page.tsx"), "utf8");
    expect(page).toContain(`subtitle={visibility === "WHOLE" ? ex.title : t(H.titleRestricted)}`);
    expect(page).not.toMatch(/subtitle=\{ex\.title\}/);
  });
});
