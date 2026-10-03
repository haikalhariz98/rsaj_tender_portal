import { describe, expect, it } from "vitest";

import { fieldsNamed, renderWith } from "@/lib/templates/merge";

import { freezeTerms, searchVariants, SEARCH_VARIANTS_MAX, termCodesIn, termFaults, termSaveFaults, termValues, type Term } from "./terms";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

/// FR-CRT-011's examples (spec Appendix D), as fixture rows: the product ships no term.
const DLP: Term = { code: "dlp", canonicalEn: "Defects Liability Period", canonicalMs: "Tempoh Liabiliti Kecacatan", aliases: ["Tempoh Tanggungan Kecacatan"] };
const CMGD: Term = { code: "cmgd", canonicalEn: null, canonicalMs: "Perakuan Siap Memperbaiki Kecacatan", aliases: ["Perakuan Siap Membaiki Kecacatan"] };
const CLAUSE: Term = { code: "clause", canonicalEn: "Clause", canonicalMs: "Klausa", aliases: ["Fasal"] };
const TERMS = [DLP, CMGD, CLAUSE];

describe("search by any variant (FR-CRT-011)", () => {
  it('worked example: a search for "Tempoh Tanggungan Kecacatan" also searches "Tempoh Liabiliti Kecacatan", and the other way round', () => {
    expect(searchVariants("Tempoh Tanggungan Kecacatan", TERMS)).toEqual(["Tempoh Tanggungan Kecacatan", "Defects Liability Period", "Tempoh Liabiliti Kecacatan"]);
    expect(searchVariants("Tempoh Liabiliti Kecacatan", TERMS)).toContain("Tempoh Tanggungan Kecacatan");
  });
  it("ignores letter case, keeps the rest of the query, and swaps the whole phrase", () => {
    expect(searchVariants("tamat tempoh tanggungan kecacatan 2026", [DLP])).toEqual(["tamat tempoh tanggungan kecacatan 2026", "tamat Defects Liability Period 2026", "tamat Tempoh Liabiliti Kecacatan 2026"]);
  });
  it("Klausa and Fasal find each other", () => {
    expect(searchVariants("Fasal 43", [CLAUSE])).toEqual(["Fasal 43", "Clause 43", "Klausa 43"]);
  });
  it("with no term, or none matching, the query stands alone; an empty query searches nothing", () => {
    expect(searchVariants("DEMO/CERT/00231", [])).toEqual(["DEMO/CERT/00231"]);
    expect(searchVariants("DEMO/CERT/00231", TERMS)).toEqual(["DEMO/CERT/00231"]);
    expect(searchVariants("   ", TERMS)).toEqual([]);
  });
  it("is capped, the query as typed first", () => {
    const many: Term[] = Array.from({ length: 20 }, (_, i) => ({ code: `t${String(i).padStart(2, "0")}`, canonicalEn: `word${i}`, canonicalMs: null, aliases: [`alias${i}a`, `alias${i}b`] }));
    const q = many.map((t) => t.canonicalEn).join(" ");
    const out = searchVariants(q, many);
    expect(out).toHaveLength(SEARCH_VARIANTS_MAX);
    expect(out[0]).toBe(q);
  });
});

describe("the canonical term in generated text", () => {
  it("a form citing {{term:dlp}} prints the canonical wording in its language", () => {
    const frozen = freezeTerms(termCodesIn(fieldsNamed("Tempoh: {{term:dlp}}")), TERMS);
    expect(frozen).toEqual([{ code: "dlp", en: "Defects Liability Period", ms: "Tempoh Liabiliti Kecacatan" }]);
    const wl = { has: (k: string) => k.startsWith("term:"), label: (k: string) => k };
    expect(renderWith("Tempoh: {{term:dlp}}", termValues(frozen, "MS"), wl).paragraphs).toEqual(["Tempoh: Tempoh Liabiliti Kecacatan"]);
    expect(renderWith("Period: {{term:dlp}}", termValues(frozen, "EN"), wl).paragraphs).toEqual(["Period: Defects Liability Period"]);
  });
  it("a term not configured, or with no wording in the text's language, is refused, named", () => {
    expect(codes(termFaults([{ lang: "EN", fields: ["term:nope"] }], TERMS, "Form A"))).toEqual(["UNKNOWN_TERM"]);
    const f = termFaults([{ lang: "EN", fields: ["term:cmgd"] }, { lang: "MS", fields: ["term:cmgd"] }], TERMS, "Form A");
    expect(codes(f)).toEqual(["TERM_NO_WORDING"]);
    expect(f[0].data).toEqual({ form: "Form A", terms: "cmgd (English)" });
    expect(termFaults([{ lang: "MS", fields: ["term:cmgd", "contract.number"] }], TERMS, "Form A")).toEqual([]);
  });
});

describe("saving a term", () => {
  it("a well-formed term is accepted", () => expect(termSaveFaults(DLP, [CMGD, CLAUSE])).toEqual([]));
  it("needs a code and one canonical wording", () => {
    expect(codes(termSaveFaults({ ...DLP, code: "DLP" }, []))).toEqual(["TERM_CODE"]);
    expect(codes(termSaveFaults({ ...DLP, canonicalEn: " ", canonicalMs: null }, []))).toEqual(["TERM_CANONICAL_REQUIRED"]);
    expect(codes(termSaveFaults(DLP, [{ ...CLAUSE, code: "dlp" }]))).toEqual(["TERM_CODE_TAKEN"]);
  });
  it("an alias is not the canonical wording, not repeated, and no wording is another term's", () => {
    expect(codes(termSaveFaults({ ...DLP, aliases: ["tempoh liabiliti kecacatan"] }, []))).toEqual(["TERM_ALIAS_IS_CANONICAL"]);
    expect(codes(termSaveFaults({ ...DLP, aliases: ["A", "a"] }, []))).toEqual(["TERM_ALIAS_REPEATED"]);
    expect(codes(termSaveFaults({ ...CLAUSE, code: "clause2" }, [CLAUSE]))).toEqual(["TERM_WORDING_TAKEN"]);
  });
});
