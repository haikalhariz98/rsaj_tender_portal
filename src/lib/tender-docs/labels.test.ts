import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { BEHAVIOUR_KEYS } from "@/lib/method/profile";

import { EXERCISE_STATUS_LABEL } from "@/lib/method/labels";

import { ASSURANCE_KIND_LABEL, clauseConfigFaultText, conditionsFaultText, confirmFaultText, overrideFaultText, restrictionQuestion } from "./conditions-labels";
import { ASSURANCE_KINDS } from "./assurance";

import { appendixCardOf, appendixFaultText, appendixHref, findingHref, findingsSummary, IF_REFUSED_TEXT, TENDERING_STATE_LABEL, tenderingStepLabel, tenderingRouteTone, tenderingStepTone, behaviourFaultText, datesFaultText, PACK_KIND_LABEL, PACK_STATUS_LABEL, PART_CONTENT_LABEL, PART_ROLE_LABEL, PART_SOURCE_LABEL, PART_STATE_LABEL, partFaultText, periodText, trailLabel, routeFaultText, startFaultText, tenderingRouteLabel } from "./labels";
import { APPENDIX_FIELD_LABEL } from "./appendix";
import { PACK_KINDS, PACK_PART_STATES, PART_CONTENTS, PART_ROLES, PART_SOURCES, TENDER_PACK_STATUSES } from "./types";

/**
 * Codes never reach a screen (AGENTS.md rule 5): every value and finding has words, the
 * words carry no code, and each refusal says what to do.
 */

const CODE = /\b[A-Z][A-Z0-9]+_[A-Z0-9_]+\b/;
const f = (code: string, data: Record<string, string | number | null> = { part: "2. Form of tender", template: "Form of tender", field: "Field", fields: "{{x}}", role: "CONDITIONS", section: "S", holder: "H", text: "The words the engine gave for it.", behaviour: "pricingBasis", where: "BILL", appendix: 1, body: "A registry", qualifier: "Grade", clause: "Anti-corruption clause", person: "A person", reason: "A reason", language: "Malay", count: 2, kind: "NO_AMBIGUITY" }) => ({ code, level: "block" as const, data });

const FAMILIES: [string, (x: ReturnType<typeof f>) => string, string[]][] = [
  ["part", partFaultText, ["PACK_NOT_DRAFT", "EXERCISE_NOT_IN_PREPARATION", "TEMPLATE_NOT_SET", "TEMPLATE_BODY_EMPTY", "TEMPLATE_LANGUAGE_NOT_SET", "TEMPLATE_UNKNOWN_FIELD", "BESPOKE_FROM_LIBRARY", "BQ_PART_WITHOUT_BQ", "UPLOAD_MISSING", "APPENDIX_INCOMPLETE", "ALREADY_READY", "ALREADY_OMITTED", "MANDATORY_OMITTED", "MANDATORY_UNSET", "OMIT_REASON_REQUIRED", "NOT_A_TEMPLATE_PART", "PART_NOT_READY", "DECLARATION_PART_MISSING", "DECLARATION_NOT_MANDATORY", "NO_PARTS"]],
  ["start", startFaultText, ["EXERCISE_NOT_IN_PREPARATION", "PREPARED_BEFORE_ASSEMBLY", "NO_PACK_FOR_METHOD", "LIVE_PACK_EXISTS", "PACK_APPROVED", "NO_PACK", "BASIS_NOT_SET", "COMPOSITION_NOT_SET", "DUPLICATE_ROLE", "NO_CONDITIONS_PART"]],
  ["appendix", appendixFaultText, ["FIELD_NOT_SET", "FIELD_NOT_VALID", "PC_SUM_TEXT_REQUIRED", "SECTIONS_REQUIRED", "SECTIONS_NOT_EXPECTED", "SECTION_LAD_NOT_SET", "VARIATION_LIMIT_NOT_SET", "DLP_MONTHS_NOT_EXPECTED", "APPENDIX_NOT_STARTED"]],
  ["behaviour", behaviourFaultText, ["PROFILE_NOT_RECORDED", "BEHAVIOUR_NOT_SET", "DLP_MONTHS_REQUIRED", "DLP_NOT_FOR_TYPE", "NOMINATION_NOT_FOR_TYPE", "BOND_FORMS_REQUIRED"]],
  ["dates", datesFaultText, ["TIME_ZONE_NOT_SET", "DATES_REQUIRED", "DATE_NOT_VALID", "CLOSING_TIME_NOT_VALID", "START_IN_PAST", "CLOSING_NOT_AFTER_START", "DATES_DIFFER_FROM_DOCUMENTS"]],
  ["conditions", conditionsFaultText, [
    "ELIGIBILITY_NOT_SET", "BODY_NOT_CONFIGURED", "BODY_RETIRED", "QUALIFIERS_REQUIRED", "QUALIFIERS_NOT_TAKEN", "GROUP_NOT_VALID", "BODY_TWICE_IN_GROUP",
    "NOTICE_PART_MISSING", "NOTICE_LACKS_ELIGIBILITY", "NOTICE_NOT_CHECKED", "RESTRICTION_NOT_ANSWERED", "STAMP_NOT_SET", "UPLOADS_NOT_STAMPED",
    "REGULATED_NOT_ANSWERED", "PERMIT_LIST_NOT_SET", "PERMIT_NOT_CHOSEN", "PERMIT_NOT_ON_LIST", "INSTRUCTIONS_PART_MISSING", "PERMIT_NOT_IN_INSTRUCTIONS", "INSTRUCTIONS_NOT_CHECKED", "PERMIT_FIELD_NOT_REGULATED", "PERMIT_NAME_MS_MISSING",
    "CLAUSE_MANDATORY_UNSET", "AGREEMENT_PART_MISSING", "CLAUSE_MISSING", "CLAUSE_NOT_CHECKABLE", "CLAUSE_LANGUAGE_MISSING", "CLAUSE_OVERRIDDEN",
    "ASSURANCE_POLICY_NOT_SET", "ASSURANCE_MISSING", "ASSURANCE_NOT_REQUIRED", "TABLE_DOCUMENT_UNSET", "TABLE_DOCUMENT_EMPTY",
  ]],
  ["confirm", confirmFaultText, ["PACK_NOT_EDITABLE", "TIME_ZONE_NOT_SET", "ALREADY_CONFIRMED", "NOT_NEEDED", "PERSON_REQUIRED", "PERSON_NOT_ACTIVE", "DAY_REQUIRED", "DAY_IN_FUTURE", "DAY_BEFORE_PACK"]],
  ["override", overrideFaultText, ["PACK_NOT_EDITABLE", "CLAUSE_NOT_MANDATORY", "ALREADY_OVERRIDDEN", "PERSON_REQUIRED", "PERSON_NOT_ACTIVE", "REASON_REQUIRED"]],
  ["clause config", clauseConfigFaultText, ["CODE_REQUIRED", "CODE_TAKEN", "TITLE_REQUIRED", "BODY_REQUIRED", "BODY_HAS_FIELD", "PROVENANCE_REQUIRED"]],
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

describe("increment 2's vocabulary", () => {
  it("each assurance kind has words; the restriction is asked in the customer's words, or says they are not set", () => {
    expect(Object.keys(ASSURANCE_KIND_LABEL).sort()).toEqual([...ASSURANCE_KINDS].sort());
    expect(restrictionQuestion("Restricted to eligible bidders")).toBe("Restricted to eligible bidders");
    expect(restrictionQuestion(null)).toMatch(/not set/);
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

describe("the tendering route card says the documents were returned, not refused (carry d)", () => {
  it("a rejected route reads Returned for amendment; other statuses as an exercise route", () => {
    expect(tenderingRouteLabel("REJECTED", [])).toBe("Returned for amendment");
    expect(tenderingRouteLabel("REJECTED", [])).not.toMatch(/refused/i);
    expect(tenderingRouteLabel("PENDING", [])).toBe("Awaiting approval for tendering");
    expect(tenderingRouteLabel("APPROVED", [])).toBe("Approved for tendering");
    expect(tenderingRouteLabel("RECALLED", [{ code: "WITHDRAWN_ON_CANCEL" }])).toBe("Withdrawn: exercise cancelled");
  });
  it("the read model and the screen label the route and its earlier routes through it", () => {
    for (const f of ["src/lib/tender-docs/read.ts", "src/app/sourcing/[id]/documents/workspace.tsx"]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src, f).not.toMatch(/nameRouteLabel\(/);
      expect(src.match(/tenderingRouteLabel\(/g)?.length, f).toBe(2);
    }
  });
  it("the exercise's History reads a tendering route's status through it, by the route's id", () => {
    const src = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/page.tsx"), "utf8");
    expect(src).toMatch(/if \(field === "status" && tenderingRouteIds\.has\(entityId\)\) return tenderingRouteLabel\(value, null\);/);
    expect(src).toMatch(/tenderingRouteIds=\{new Set\(tenderingRoutesOf\(ex\.approvalInstances\)\.map\(\(i\) => i\.id\)\)\}/);
  });
});

describe("one label per state, wherever it is shown (UX 2)", () => {
  it("the route, the pack, the exercise and the step say the same words", () => {
    expect(TENDERING_STATE_LABEL).toEqual({ WITH_APPROVAL: "Awaiting approval for tendering", APPROVED: "Approved for tendering", RETURNED: "Returned for amendment" });
    expect(tenderingRouteLabel("PENDING", [])).toBe(PACK_STATUS_LABEL.SUBMITTED);
    expect(tenderingRouteLabel("PENDING", [])).toBe(EXERCISE_STATUS_LABEL.PENDING_APPROVAL_FOR_TENDERING);
    expect(tenderingRouteLabel("APPROVED", [])).toBe(PACK_STATUS_LABEL.APPROVED);
    expect(tenderingRouteLabel("APPROVED", [])).toBe(EXERCISE_STATUS_LABEL.APPROVED_FOR_TENDERING);
    expect(tenderingRouteLabel("REJECTED", [])).toBe(PACK_STATUS_LABEL.RETURNED);
    expect(tenderingStepLabel("REJECTED")).toBe(PACK_STATUS_LABEL.RETURNED);
    expect(tenderingStepLabel("DONE")).toBe("Done");
    expect(tenderingStepLabel("PENDING")).toBe("Pending");
  });
  it("a returned route and step are amber, never the red of a refusal", () => {
    expect(tenderingRouteTone("REJECTED")).toBe("warn");
    expect(tenderingStepTone("REJECTED")).toBe("warn");
    expect(tenderingRouteTone("APPROVED")).toBe("ok");
    expect(tenderingStepTone("DONE")).toBe("ok");
  });
  it("no label in the tendering vocabulary says refused or pending approval", () => {
    for (const w of [...Object.values(TENDERING_STATE_LABEL), ...Object.values(PACK_STATUS_LABEL), EXERCISE_STATUS_LABEL.PENDING_APPROVAL_FOR_TENDERING]) expect(w).not.toMatch(/refused|pending approval|rejected/i);
  });
  it("the refusal line is the one fixed sentence, with no configuration or provenance in it (Q-3)", () => {
    expect(IF_REFUSED_TEXT).toBe("If refused: the documents come back for amendment and the exercise returns to preparation.");
    expect(IF_REFUSED_TEXT).not.toMatch(/configured|stated|assumed|observed|provenance/i);
  });
  it("the findings subtitle counts what blocks and what is only to note", () => {
    expect(findingsSummary(4, 1)).toBe("4 to put right · 1 to note");
    expect(findingsSummary(2, 0)).toBe("2 to put right");
    expect(findingsSummary(0, 1)).toBe("Nothing blocks submission · 1 to note");
    expect(findingsSummary(0, 0)).toBe("Nothing blocks submission.");
  });
});

describe("a finding links to where it is put right (UX 3, 9)", () => {
  const fin = (code: string, data?: Record<string, string | number | null>) => ({ code, level: "block" as const, data });
  it("an Appendix finding lands on the card that holds the field", () => {
    expect(findingHref("e1", "appendix", fin("FIELD_NOT_SET", { field: "Liquidated damages a day" }))).toBe("/sourcing/e1/appendix#liquidated-damages");
    expect(findingHref("e1", "appendix", fin("FIELD_NOT_SET", { field: "Minimum workmen's compensation insurance" }))).toBe("/sourcing/e1/appendix#insurance");
    expect(findingHref("e1", "appendix", fin("SECTIONS_REQUIRED"))).toBe("/sourcing/e1/appendix#sectional-completion");
    expect(findingHref("e1", "appendix", fin("VARIATION_LIMIT_NOT_SET", { holder: "H" }))).toBe("/sourcing/e1/appendix#variation-limits");
    expect(appendixCardOf(fin("FIELD_NOT_SET", { field: "A field nobody named" }))).toBeNull();
    expect(appendixHref("e1", fin("FIELD_NOT_SET", { field: "A field nobody named" }))).toBe("/sourcing/e1/appendix");
  });
  it("every field of the Appendix has a card", () => {
    for (const label of Object.values(APPENDIX_FIELD_LABEL)) expect(appendixCardOf(fin("FIELD_NOT_SET", { field: label })), label).not.toBeNull();
  });
  it("a bill finding opens the Bill of quantities section; an estimate finding the estimate's", () => {
    expect(findingHref("e1", "scope", fin("BQ_NOT_FINALISED"))).toBe("/sourcing/e1?tab=scope&section=bq");
    expect(findingHref("e1", "scope", fin("BQ_REVISION_OPEN"))).toBe("/sourcing/e1?tab=scope&section=bq");
    expect(findingHref("e1", "scope", fin("ESTIMATE_NOT_LODGED"))).toBe("/sourcing/e1?tab=scope&section=estimate");
    expect(findingHref("e1", "scope", fin("PANEL_NOT_VERIFIED"))).toBe("/sourcing/e1?tab=scope");
    expect(findingHref("e1", "readiness", fin("BQ_PART_WITHOUT_BQ"))).toBe("/sourcing/e1?tab=scope&section=bq");
  });
  it("a part finding lands on the parts, the dates on the submit card", () => {
    expect(findingHref("e1", "readiness", fin("PART_NOT_READY"))).toBe("/sourcing/e1?tab=documents#parts");
    expect(findingHref("e1", "dates", fin("DATES_REQUIRED"))).toBe("/sourcing/e1?tab=documents#submit");
  });
});

describe("small wording rules (UX 22)", () => {
  it("a period leaves out its zero part", () => {
    expect(periodText(2, 0)).toBe("2 months");
    expect(periodText(1, 3)).toBe("1 month 3 days");
    expect(periodText(0, 10)).toBe("10 days");
    expect(periodText(0, 0)).toBe("0 months");
  });
  it("a trail row that names the pack the old way reads as the new ones do", () => {
    expect(trailLabel("DEMO/SX/0005/2026 · Tender pack v2 · part 9, Drawings")).toBe("DEMO/SX/0005/2026 · Tender documents v2 · part 9, Drawings");
    expect(trailLabel("Tender documents v2 · Appendix")).toBe("Tender documents v2 · Appendix");
  });
});
