import { fieldLabel } from "@/lib/audit/diff";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { closing, lex } from "@/lib/scan/source";

import { custodyItemLabel, estimateEventLabel, formationCheckLabel, historyEntityLabel, historyValueWords, policyLabel, reconciliationLabel, RECORD_TYPE_WORDS, securityLabel } from "./entity-labels";
import { auditCsv } from "./export";

/**
 * 612-C2 (ruled at 6.13 planning; AGENTS.md rule 5): History and the export read a trail row's record through
 * the label maps when read; stored rows are never rewritten; a code fragment the maps do not cover shows as the
 * record type's name; the named writers (checks and reconciliations, securities and insurance, suppliers, the
 * method fixture, and the demo's estimate events) take their labels from the maps; and a source scan fails on
 * an audit writer that builds a label or a value from a code.
 */

describe("a stored label is read through the maps", () => {
  const K = "Contract XI202600799 · Contoh Supplies Enterprise";
  it("checks and reconciliations (6.12)", () => {
    expect(historyEntityLabel("FormationCheck", `${K} · check sor adjustment`)).toBe(`${K} · check: Schedule of Rates adjustment checked`);
    expect(historyEntityLabel("FormationCheck", `${K} · check arithmetic`)).toBe(`${K} · check: Arithmetical errors corrected`);
    expect(historyEntityLabel("ContractReconciliation", `${K} · reconciliation tender table document`)).toBe(`${K} · reconciliation: Against the Tender Table Document`);
    expect(historyEntityLabel("CustodyItem", `${K} · original: contract`)).toBe(`${K} · original: The signed Contract Document`);
  });
  it("securities and insurance (6.11)", () => {
    expect(historyEntityLabel("SecurityInstrument", "DEMO/AWD/0005/2026 · performance bond")).toBe("DEMO/AWD/0005/2026 · Performance bond");
    expect(historyEntityLabel("InsurancePolicy", "DEMO/AWD/0005/2026 · workmens compensation policy")).toBe("DEMO/AWD/0005/2026 · Workmen's compensation insurance policy");
    expect(historyEntityLabel("InsurancePolicy", "DEMO/AWD/0005/2026 · car policy")).toBe("DEMO/AWD/0005/2026 · Contractor's all risks insurance policy");
  });
  it("the demo's company-estimate events (6.2), read as the product writes them", () => {
    expect(historyEntityLabel("EstimateEvent", "DEMO/EX/1 · Company estimate · retained")).toBe("DEMO/EX/1 · Company estimate · copy retained");
    expect(historyEntityLabel("EstimateEvent", "DEMO/EX/1 · Company estimate · copy retained")).toBe("DEMO/EX/1 · Company estimate · copy retained");
    expect(historyEntityLabel("EstimateEvent", "DEMO/EX/1 · Company estimate · lodged")).toBe("DEMO/EX/1 · Company estimate · lodged");
  });
  it("a fragment no map covers shows as the record type's name, never the code", () => {
    expect(historyEntityLabel("FormationCheck", `${K} · check something new`)).toBe(`${K} · ${RECORD_TYPE_WORDS.FormationCheck.en}`);
    expect(historyEntityLabel("SecurityInstrument", "AW · surety bond")).toBe("AW · Security");
  });
  it("labels written in words, and every other entity, are as stored", () => {
    for (const [e, l] of [
      ["FormationCheck", `${K} · ${formationCheckLabel("SOR_ADJUSTMENT")}`],
      ["ContractReconciliation", `${K} · ${reconciliationLabel("DRAWINGS")}`],
      ["CustodyItem", `${K} · ${custodyItemLabel("POLICY")}`],
      ["SecurityInstrument", securityLabel("AW", "RETENTION_BOND")],
      ["InsurancePolicy", policyLabel("AW", "WORKS")],
      ["EstimateEvent", `EX · ${estimateEventLabel("RETAINED")}`],
      ["Award", "anything at all"],
    ] as const) expect(historyEntityLabel(e, l)).toBe(l);
  });
  it("what the writers write now reads as the legacy label reads", () => {
    expect(historyEntityLabel("FormationCheck", `${K} · check sor adjustment`)).toBe(`${K} · ${formationCheckLabel("SOR_ADJUSTMENT")}`);
    expect(historyEntityLabel("InsurancePolicy", "AW · works policy")).toBe(policyLabel("AW", "WORKS"));
  });
  it("a supplier approval's 'judged under' list reads its states in words", () => {
    expect(historyValueWords("ApplicationDecision", "judgedUnder", "Works board certificate: not checked; Trading licence: valid")).toBe("Works board certificate: Lodged, not checked; Trading licence: Valid");
    expect(historyValueWords("ApplicationDecision", "judgedUnder", "Works board certificate: Valid")).toBe("Works board certificate: Valid");
    expect(historyValueWords("ApplicationDecision", "outcome", "approved")).toBe("approved");
    expect(historyValueWords("Award", "judgedUnder", "x: not checked")).toBe("x: not checked");
  });
  it("the export reads the same way (stored rows unchanged)", () => {
    const row = { id: "a1", at: new Date("2026-10-01T02:00:00Z"), entity: "FormationCheck", entityLabel: `${K} · check sor adjustment`, entityId: "k1", action: "UPDATE", changes: [], reason: "", unattributed: true, actorName: null };
    const csv = auditCsv([row as never], "Asia/Kuala_Lumpur");
    expect(csv).toContain("check: Schedule of Rates adjustment checked");
    expect(csv).not.toContain("check sor adjustment");
  });
});

// ------------------------------------------------------------------ the scan

const ROOT = path.join(__dirname, "../../..");
function files(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((f) => {
    const rel = path.join(dir, f);
    if (rel === path.join("src", "generated")) return [];
    return statSync(path.join(ROOT, rel)).isDirectory() ? files(rel) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [rel] : [];
  });
}

/// A lowercased or underscore-replaced value is a label only where it is read from a label map (`X_LABEL[…]`,
/// `X_WORDS[…]`, a Words' `.en`/`.ms`, or a label column); anything else is a code made into words.
const FROM_MAP = /(?:[A-Z][A-Z0-9_]*(?:_LABEL|_WORDS|_TEXT)\s*\[[^\]]*\](?:\.(?:en|ms))?|\.(?:en|ms)|\b(?:labelEn|labelMs|nameEn|nameMs|label|name)|Label\([^)]*\)(?:\.(?:en|ms))?)$/;

export function codeWords(file: string, src: string): string[] {
  const out: string[] = [];
  const m = lex(src, { only: "comments" });
  const shut = lex(src);
  for (const x of m.matchAll(/\b(audit|writeAudit|entry)\s*\(/g)) {
    if (/function\s*$/.test(m.slice(Math.max(0, x.index! - 12), x.index!))) continue;
    const open = x.index! + x[0].length - 1;
    const args = src.slice(open, closing(shut, open) + 1);
    for (const y of args.matchAll(/((?:[\w$]+|\][\w.]*|\))(?:\s*\.\s*[\w$]+|\s*\[[^\]]*\])*)\s*\.\s*toLowerCase\(\)/g)) {
      if (!FROM_MAP.test(y[1].replace(/\s+/g, ""))) out.push(`${file} · ${x[1]} · ${y[1].replace(/\s+/g, "")}.toLowerCase()`);
    }
    if (/\.replace\(\s*\/_\/g/.test(args)) out.push(`${file} · ${x[1]} · replace on a key`);
  }
  return out;
}

describe("no audit writer builds a label or a value from a code (the scan)", () => {
  const scanned = [...files("src"), ...files("prisma")].map((file) => ({ file, src: readFileSync(path.join(ROOT, file), "utf8") }));
  it("covers the app, the libraries and the demo", () => {
    const names = scanned.map((s) => s.file);
    for (const f of ["src/app/projects/[id]/actions.ts", "src/app/awards/actions.ts", "src/app/suppliers/actions.ts", "prisma/demo-contracts.ts", "prisma/demo-award.ts", "prisma/demo-suppliers.ts", "src/lib/method/fixture.ts"]) expect(names).toContain(path.normalize(f));
  });
  it("finds none", () => {
    expect(scanned.flatMap((s) => codeWords(s.file, s.src))).toEqual([]);
  });
  it("the method fixture words its rules from a map, never from their keys", () => {
    const fx = readFileSync(path.join(ROOT, "src/lib/method/fixture.ts"), "utf8");
    expect(fx).not.toMatch(/ruleKey\.toLowerCase\(\)/);
  });
  // The fixtures write a template expression as «…» (lint: no template syntax in a plain string).
  const T = (s: string) => s.replace(/«/g, "$" + "{");
  it("catches each form (self-tests)", () => {
    expect(codeWords("x.ts", T("await audit(c, \"FormationCheck\", k.id, `check «k.kind.toLowerCase().replace(/_/g, \" \")}`, \"UPDATE\", []);"))).toEqual(["x.ts · audit · k.kind.toLowerCase()", "x.ts · audit · replace on a key"]);
    expect(codeWords("x.ts", T("entry(\"CustodyItem\", id, `original: «kind.toLowerCase()}`, \"CREATE\", at, []);"))).toEqual(["x.ts · entry · kind.toLowerCase()"]);
    expect(codeWords("x.ts", T("await audit(tx, o, \"D\", id, l, \"CREATE\", diffFields(null, { judgedUnder: m.map((x) => `«x.type}: «x.state.toLowerCase()}`).join(\"; \") }));"))).toEqual(["x.ts · audit · x.state.toLowerCase()"]);
    expect(codeWords("x.ts", T("await audit(tx, o, \"P\", id, `«ref} · scope: «DELIVERABLE_LABEL[p.kind].toLowerCase()}`, \"CREATE\", []);"))).toEqual([]);
    expect(codeWords("x.ts", T("await audit(tx, o, \"P\", id, `«OFFICE_RULE_WORDS[b.officeRule].en.toLowerCase()}`, \"CREATE\", []);"))).toEqual([]);
    expect(codeWords("x.ts", T("// audit(c, \"X\", id, `«kind.toLowerCase()}`)\nconst s = 1;"))).toEqual([]);
  });
});

describe("a sign-in account's trail reads in words (Phase 1b)", () => {
  it("its standing is never a code, in History's values or the export's", () => {
    expect(historyValueWords("StaffAccount", "status", "PENDING_ACTIVATION")).toBe("Waiting for activation");
    expect(historyValueWords("StaffAccount", "status", "DISABLED")).toBe("Disabled");
    expect(historyValueWords("StaffAccount", "status", "ACTIVE")).toBe("Active");
    // What is not its standing, or not its trail, is as stored.
    expect(historyValueWords("StaffAccount", "loginName", "ahmad.z")).toBe("ahmad.z");
    expect(historyValueWords("Requisition", "status", "DISABLED")).toBe("DISABLED");
    expect(historyValueWords("StaffAccount", "status", null)).toBeNull();
  });

  it("its display language reads as the language's name and the field as words (N1)", () => {
    expect(historyValueWords("StaffAccount", "uiLanguage", "MS")).toBe("Bahasa Malaysia");
    expect(historyValueWords("StaffAccount", "uiLanguage", "EN")).toBe("English");
    expect(historyValueWords("StaffAccount", "uiLanguage", null)).toBeNull();
    expect(historyValueWords("Requisition", "uiLanguage", "MS")).toBe("MS");
    expect(fieldLabel("uiLanguage")).toBe("Display language");
  });
});
