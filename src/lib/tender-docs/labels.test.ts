import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { BEHAVIOUR_KEYS } from "@/lib/method/profile";

import { appendixFaultText, behaviourFaultText, datesFaultText, PACK_KIND_LABEL, PACK_STATUS_LABEL, PART_CONTENT_LABEL, PART_ROLE_LABEL, PART_SOURCE_LABEL, PART_STATE_LABEL, partFaultText, routeFaultText, startFaultText } from "./labels";
import { PACK_KINDS, PACK_PART_STATES, PART_CONTENTS, PART_ROLES, PART_SOURCES, TENDER_PACK_STATUSES } from "./types";

/**
 * Codes never reach a screen (AGENTS.md rule 5): every value and finding has words, the
 * words carry no code, and each refusal says what to do.
 */

const CODE = /\b[A-Z][A-Z0-9]+_[A-Z0-9_]+\b/;
const f = (code: string, data: Record<string, string | number | null> = { part: "2. Form of tender", template: "Form of tender", field: "Field", fields: "{{x}}", role: "CONDITIONS", section: "S", holder: "H", text: "The words the engine gave for it.", behaviour: "pricingBasis", where: "BILL", appendix: 1 }) => ({ code, level: "block" as const, data });

const FAMILIES: [string, (x: ReturnType<typeof f>) => string, string[]][] = [
  ["part", partFaultText, ["PACK_NOT_DRAFT", "EXERCISE_NOT_IN_PREPARATION", "TEMPLATE_NOT_SET", "TEMPLATE_BODY_EMPTY", "TEMPLATE_LANGUAGE_NOT_SET", "TEMPLATE_UNKNOWN_FIELD", "BESPOKE_FROM_LIBRARY", "BQ_PART_WITHOUT_BQ", "UPLOAD_MISSING", "APPENDIX_INCOMPLETE", "ALREADY_READY", "ALREADY_OMITTED", "MANDATORY_OMITTED", "MANDATORY_UNSET", "OMIT_REASON_REQUIRED", "NOT_A_TEMPLATE_PART", "PART_NOT_READY", "DECLARATION_PART_MISSING", "DECLARATION_NOT_MANDATORY", "NO_PARTS"]],
  ["start", startFaultText, ["EXERCISE_NOT_IN_PREPARATION", "PREPARED_BEFORE_ASSEMBLY", "NO_PACK_FOR_METHOD", "LIVE_PACK_EXISTS", "PACK_APPROVED", "NO_PACK", "BASIS_NOT_SET", "COMPOSITION_NOT_SET", "DUPLICATE_ROLE", "NO_CONDITIONS_PART"]],
  ["appendix", appendixFaultText, ["FIELD_NOT_SET", "FIELD_NOT_VALID", "PC_SUM_TEXT_REQUIRED", "SECTIONS_REQUIRED", "SECTIONS_NOT_EXPECTED", "SECTION_LAD_NOT_SET", "VARIATION_LIMIT_NOT_SET", "DLP_MONTHS_NOT_EXPECTED", "APPENDIX_NOT_STARTED"]],
  ["behaviour", behaviourFaultText, ["PROFILE_NOT_RECORDED", "BEHAVIOUR_NOT_SET", "DLP_MONTHS_REQUIRED", "DLP_NOT_FOR_TYPE", "NOMINATION_NOT_FOR_TYPE", "BOND_FORMS_REQUIRED"]],
  ["dates", datesFaultText, ["TIME_ZONE_NOT_SET", "DATES_REQUIRED", "DATE_NOT_VALID", "CLOSING_TIME_NOT_VALID", "START_IN_PAST", "CLOSING_NOT_AFTER_START"]],
  ["route", routeFaultText, ["NO_ISSUE_IN_FORCE", "ROUTE_NO_METHOD_KEY", "ROUTE_NO_RULE", "ROUTE_HAS_COMMITTEE_STEP", "ROUTE_REFUSED", "ROUTE_ERROR", "ROUTE_OPEN"]],
];

describe("every finding has words of its own, with no code in them", () => {
  for (const [family, text, codes] of FAMILIES) {
    it.each(codes)(`${family}: %s`, (code) => {
      const t = text(f(code));
      expect(t.length).toBeGreaterThan(10);
      expect(t, t).not.toMatch(CODE);
    });
  }
  it("each family's fallback is never what a known code reads", () => {
    for (const [, text, codes] of FAMILIES) {
      const fallback = text(f("NOT_A_REAL_CODE"));
      for (const c of codes) expect(text(f(c))).not.toBe(fallback);
    }
  });
  it("every behaviour is named in words", () => {
    for (const k of BEHAVIOUR_KEYS) expect(behaviourFaultText(f("BEHAVIOUR_NOT_SET", { behaviour: k }))).not.toMatch(/behaviour is not set|[a-z][A-Z]/);
  });
});

describe("every vocabulary value has a label", () => {
  it.each([
    [PACK_KIND_LABEL, PACK_KINDS],
    [PART_ROLE_LABEL, PART_ROLES],
    [PART_CONTENT_LABEL, PART_CONTENTS],
    [PART_SOURCE_LABEL, PART_SOURCES],
    [PACK_STATUS_LABEL, TENDER_PACK_STATUSES],
    [PART_STATE_LABEL, PACK_PART_STATES],
  ] as [Record<string, string>, readonly string[]][])("%#", (labels, values) => {
    expect(Object.keys(labels).sort()).toEqual([...values].sort());
    for (const v of values) expect(labels[v]).not.toMatch(CODE);
  });
});

describe("restriction and stamp wording comes from configuration, never a customer's literal (6.4 conditions)", () => {
  it("no source file outside a test writes a restriction stamp's words", () => {
    const root = process.cwd();
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((x) => {
        const p = join(d, x);
        if (statSync(p).isDirectory()) return x === "generated" ? [] : walk(p);
        return /\.(ts|tsx)$/.test(x) && !/\.test\.tsx?$/.test(x) ? [p] : [];
      });
    const all = [...walk(join(root, "src")), ...walk(join(root, "prisma"))];
    // The stamp's words, anywhere.
    expect(all.filter((p) => /untuk\s+bumiputera\s+sahaja|for\s+bumiputera\s+only/i.test(readFileSync(p, "utf8"))).map((p) => relative(root, p))).toEqual([]);
    // The restriction itself, anywhere the tender documents are made: it is configuration.
    const tenderDocs = all.filter((p) => /src\/lib\/tender-docs|src\/app\/sourcing|configuration\/tender-documents|demo-tender-docs/.test(relative(root, p)));
    expect(tenderDocs.filter((p) => /bumiputera/i.test(readFileSync(p, "utf8"))).map((p) => relative(root, p))).toEqual([]);
  });
});
