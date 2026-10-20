import { describe, expect, it } from "vitest";

import { clauseConfigFaults, clauseFaults, clauseFieldValues, clausesCited, liveClauses, nextBodyVersion, overrideFaults, type ClauseFacts } from "./clauses";
import { packWhitelist, templateFieldRefusals } from "./fields";
import { freezePack } from "./freeze";
import { templateFaults } from "./pack";
import type { PackPartFacts, TemplateFacts } from "./types";

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

/// SK004 §7.3.4's clause, as a test fixture: the product ships none (FR-DOC-011).
const ANTI_CORRUPTION: ClauseFacts = {
  code: "anti_corruption", titleEn: "Anti-corruption clause", titleMs: "Klausa antirasuah",
  bodyEn: "The Contractor shall not offer or give any gratification to any person in connection with this Contract.",
  bodyMs: "Kontraktor tidak boleh menawarkan atau memberi apa-apa suapan kepada mana-mana orang berhubung dengan Kontrak ini.",
  bodyVersion: 2, mandatoryInAgreements: true, retiredOn: null,
};
const OPTIONAL: ClauseFacts = { ...ANTI_CORRUPTION, code: "site_rules", titleEn: "Site rules", bodyMs: null, bodyVersion: 1, mandatoryInAgreements: false };
const TODAY = "2026-10-01";

const template = (bodyEn: string, x: Partial<TemplateFacts> = {}): TemplateFacts => ({ id: "t", code: "conditions", nameEn: "Conditions of contract", formCode: "F-203", revisionDate: null, bodyEn, bodyMs: null, primaryLanguage: null, bodyVersion: 4, ...x });
const conditions = (x: Partial<PackPartFacts> = {}): PackPartFacts => ({
  partCode: "c", printedNumber: "3", sortOrder: 30, label: "Conditions of contract", role: "CONDITIONS", content: "STANDARD", source: "TEMPLATE", mandatory: true, inTableDocument: true, templateCode: "conditions",
  template: template("General conditions.\n\n{{clause:anti_corruption}}"), state: "READY", omittedReason: "", liveUploads: 0, ...x,
});
const override = { clauseCode: "anti_corruption", clauseTitle: "Anti-corruption clause", personName: "Aisyah Rahman", reason: "Legal endorses the clause as embedded in the client's own form." };

describe("FR-DOC-011: every agreement carries the mandatory clause", () => {
  it("a conditions template citing the clause passes", () => {
    expect(clauseFaults([conditions()], [ANTI_CORRUPTION, OPTIONAL], [], TODAY)).toEqual([]);
  });
  it("a template without it blocks, naming the clause and the template", () => {
    expect(clauseFaults([conditions({ template: template("General conditions only.") })], [ANTI_CORRUPTION], [], TODAY)).toEqual([
      { code: "CLAUSE_MISSING", level: "block", data: { part: "3. Conditions of contract", clause: "Anti-corruption clause", template: "Conditions of contract" } },
    ]);
  });
  // Founder, 2026-10-20: English only. This pinned a clause cited in English but not in the Malay text the template also held; only the English text is issued and judged now.
  it("cited in English: present, whatever a stored Malay text says", () => {
    expect(codes(clauseFaults([conditions({ template: template("{{clause:anti_corruption}}", { bodyMs: "Syarat am.", primaryLanguage: "MS" }) })], [ANTI_CORRUPTION], [], TODAY))).toEqual([]);
    expect(codes(clauseFaults([conditions({ template: template("General conditions only.", { bodyMs: "{{clause:anti_corruption}}", primaryLanguage: "MS" }) })], [ANTI_CORRUPTION], [], TODAY))).toEqual(["CLAUSE_MISSING"]);
  });
  it("an uploaded agreement cannot be read: the clause is not taken as present", () => {
    expect(codes(clauseFaults([conditions({ source: "UPLOAD", template: null, liveUploads: 1 })], [ANTI_CORRUPTION], [], TODAY))).toEqual(["CLAUSE_NOT_CHECKABLE"]);
  });
  it("acceptance: it cannot be removed without a legal-endorsement override, which names the Person and the reason", () => {
    const without = [conditions({ template: template("General conditions only.") })];
    expect(codes(clauseFaults(without, [ANTI_CORRUPTION], [override], TODAY))).toEqual(["CLAUSE_OVERRIDDEN"]);
    expect(clauseFaults(without, [ANTI_CORRUPTION], [override], TODAY)[0]).toMatchObject({ level: "info", data: { person: "Aisyah Rahman" } });
    // An override for another clause does not cover this one.
    expect(codes(clauseFaults(without, [ANTI_CORRUPTION], [{ ...override, clauseCode: "site_rules" }], TODAY))).toEqual(["CLAUSE_MISSING"]);
  });
  it("a clause whose 'mandatory' is not set blocks (unset is not optional); a retired clause is not required", () => {
    expect(codes(clauseFaults([conditions()], [{ ...ANTI_CORRUPTION, mandatoryInAgreements: null }], [], TODAY))).toEqual(["CLAUSE_MANDATORY_UNSET"]);
    expect(clauseFaults([conditions({ template: template("No clause.") })], [{ ...ANTI_CORRUPTION, retiredOn: "2026-09-30" }], [], TODAY)).toEqual([]);
    expect(liveClauses([{ ...ANTI_CORRUPTION, retiredOn: "2026-10-02" }], TODAY)).toHaveLength(1);
  });
  it("the conditions part omitted, with a mandatory clause configured: blocks", () => {
    expect(codes(clauseFaults([conditions({ state: "OMITTED", mandatory: false, omittedReason: "x" })], [ANTI_CORRUPTION], [], TODAY))).toEqual(["AGREEMENT_PART_MISSING"]);
  });
  // Founder, 2026-10-20: English only. A clause cited in a Malay text with no Malay words used to block, naming the language; no Malay text is issued, so it is not judged.
  it("a clause cited in a stored Malay text with no Malay words is not judged", () => {
    const p = conditions({ template: template("{{clause:anti_corruption}} {{clause:site_rules}}", { bodyMs: "{{clause:anti_corruption}} {{clause:site_rules}}", primaryLanguage: "MS" }) });
    expect(clauseFaults([p], [ANTI_CORRUPTION, OPTIONAL], [], TODAY)).toEqual([]);
  });
});

describe("a clause is cited from the template and frozen with its text version", () => {
  it("the whitelist takes a live clause's citation; an unknown or retired one is refused, never printed", () => {
    const wl = packWhitelist(liveClauses([ANTI_CORRUPTION], TODAY));
    expect(templateFaults(template("{{clause:anti_corruption}}"), wl)).toEqual([]);
    expect(codes(templateFaults(template("{{clause:bribery}}"), wl))).toEqual(["TEMPLATE_UNKNOWN_FIELD"]);
    // The pack's fixed whitelist alone refuses any clause (fails safe).
    expect(codes(templateFaults(template("{{clause:anti_corruption}}")))).toEqual(["TEMPLATE_UNKNOWN_FIELD"]);
  });
  it("frozen: the clause's words in English only, its version in the manifest", () => {
    const p = conditions({ template: template("General conditions.\n\n{{clause:anti_corruption}}", { bodyMs: "Syarat am.\n\n{{clause:anti_corruption}}", primaryLanguage: "MS" }) });
    const { documents, manifest } = freezePack({
      parts: [{ ...p, files: [] }],
      fields: {},
      fieldsByLanguage: { EN: clauseFieldValues([ANTI_CORRUPTION], "EN"), MS: clauseFieldValues([ANTI_CORRUPTION], "MS") },
      whitelist: packWhitelist([ANTI_CORRUPTION]),
      clauses: [ANTI_CORRUPTION],
      bill: null,
      appendix: null,
    });
    expect(documents.find((d) => d.language === "EN")!.renderedText).toBe(`General conditions.\n\n${ANTI_CORRUPTION.bodyEn}`);
    // Founder, 2026-10-20: English only. The Malay text the template also holds is no longer frozen.
    expect(documents.find((d) => d.language === "MS")).toBeUndefined();
    expect(manifest[0].clauses).toEqual([{ code: "anti_corruption", title: "Anti-corruption clause", bodyVersion: 2 }]);
    expect(clausesCited(conditions({ template: template("None.") }), [ANTI_CORRUPTION])).toEqual([]);
  });
  it("a template's save accepts a configured clause's citation and refuses one not configured", () => {
    const award = (k: string) => k === "awardee.name";
    expect(templateFieldRefusals(["clause:anti_corruption", "exercise.title", "awardee.name"], award, ["anti_corruption"])).toEqual([]);
    expect(templateFieldRefusals(["clause:bribery", "nonsense"], award, ["anti_corruption"])).toEqual(["clause:bribery", "nonsense"]);
  });
});

describe("recording a legal-endorsement override", () => {
  const ok = { packStatus: "DRAFT" as const, exerciseStatus: "DOCUMENTS_IN_PREPARATION" as const, clause: ANTI_CORRUPTION, today: TODAY, existing: [], person: { isActive: true }, reason: "Endorsed by Legal." };
  it("on a draft, for a live mandatory clause, by an active Person, with the reason", () => {
    expect(overrideFaults(ok)).toEqual([]);
    expect(codes(overrideFaults({ ...ok, packStatus: "SUBMITTED" }))).toEqual(["PACK_NOT_EDITABLE"]);
    expect(codes(overrideFaults({ ...ok, clause: OPTIONAL }))).toEqual(["CLAUSE_NOT_MANDATORY"]);
    expect(codes(overrideFaults({ ...ok, clause: { ...ANTI_CORRUPTION, retiredOn: "2026-09-01" } }))).toEqual(["CLAUSE_NOT_MANDATORY"]);
    expect(codes(overrideFaults({ ...ok, existing: [{ clauseCode: "anti_corruption" }] }))).toEqual(["ALREADY_OVERRIDDEN"]);
    expect(codes(overrideFaults({ ...ok, person: null, reason: " " }))).toEqual(["PERSON_REQUIRED", "REASON_REQUIRED"]);
    expect(codes(overrideFaults({ ...ok, person: { isActive: false } }))).toEqual(["PERSON_NOT_ACTIVE"]);
  });
});

describe("configuring a clause", () => {
  it("a code of its own, a title, English text without merge fields, and where it comes from", () => {
    const c = { code: "anti_corruption", titleEn: "Anti-corruption", bodyEn: "Words.", bodyMs: null, provenance: "STATED" };
    expect(clauseConfigFaults(c, [])).toEqual([]);
    expect(codes(clauseConfigFaults({ ...c, code: "Anti Corruption" }, []))).toEqual(["CODE_REQUIRED"]);
    expect(codes(clauseConfigFaults(c, [{ id: "other", code: "anti_corruption" }]))).toEqual(["CODE_TAKEN"]);
    expect(clauseConfigFaults({ ...c, id: "same" }, [{ id: "same", code: "anti_corruption" }])).toEqual([]);
    expect(codes(clauseConfigFaults({ ...c, titleEn: " ", bodyEn: " ", provenance: null }, []))).toEqual(["TITLE_REQUIRED", "BODY_REQUIRED", "PROVENANCE_REQUIRED"]);
    expect(codes(clauseConfigFaults({ ...c, bodyMs: "Kata {{exercise.title}}" }, []))).toEqual(["BODY_HAS_FIELD"]);
  });
  it("its text version rises only when its words change", () => {
    expect(nextBodyVersion(null, { bodyEn: "a", bodyMs: null })).toBe(1);
    expect(nextBodyVersion({ bodyEn: "a", bodyMs: null, bodyVersion: 3 }, { bodyEn: "a", bodyMs: null })).toBe(3);
    expect(nextBodyVersion({ bodyEn: "a", bodyMs: null, bodyVersion: 3 }, { bodyEn: "a", bodyMs: "b" })).toBe(4);
  });
});

describe("which templates cite a clause (U1: the clause rows say where it is carried from)", () => {
  const t = (nameEn: string, bodyEn: string | null, bodyMs: string | null = null) => ({ nameEn, bodyEn, bodyMs });
  it("names each template that cites the clause in either language, and none that does not", async () => {
    const { templatesCiting } = await import("./fields");
    const ts = [t("Conditions of contract", "General.\n\n{{clause:integrity}}"), t("Letter of acceptance", "Dear {{awardee.name}}"), t("Syarat", null, "Umum.\n\n{{clause:integrity}}"), t("Another clause", "{{clause:other}}")];
    expect(templatesCiting("integrity", ts)).toEqual(["Conditions of contract", "Syarat"]);
    expect(templatesCiting("absent", ts)).toEqual([]);
  });
});
