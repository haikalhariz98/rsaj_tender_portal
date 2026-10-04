import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 6.13 Part B run 1a (B4; Rule 1, BD-613-102): Part B's settings on the post-award policy and the contract type's typed
 * twins (FR-MTD-012). Each ships unset, with its provenance: no default in the schema, no DEFAULT in the migration, and
 * the spec's figures (five years, 5%, 120 days, RM300,000) appear nowhere in them. Ranges hold once set (CHECKs). The
 * claims committee is Restrict (BD-613-102). Read by runs 1b to 5; until then nothing reads them.
 */

const ROOT = path.join(__dirname, "../../..");
const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
const sql = readFileSync(path.join(ROOT, "prisma/migrations/20261004100401_post_award_part_b_settings/migration.sql"), "utf8");
const statements = sql.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--")).join("\n");
const model = (name: string) => new RegExp(`\\nmodel ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema)![1];
const enumValues = (name: string) => new RegExp(`\\nenum ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema)![1].split("\n").map((l) => l.trim()).filter((l) => /^[A-Z_]+$/.test(l));
const fieldLine = (m: string, f: string) => m.split("\n").find((l) => new RegExp(`^\\s+${f}\\s`).test(l)) ?? "";

const POLICY: Record<string, string> = {
  ladAntiOppressionDays: "Int?",
  weatherGuidance: "String?",
  ladWaiverApplication: "LadWaiverApplication?",
  designBondPct: "Decimal?",
  designBondYears: "Int?",
  performanceBondReleaseAt: "ReleaseEvent?",
  retentionBalanceReleaseAt: "ReleaseEvent?",
  nominatedBondPct: "Decimal?",
  nominatedQuotationCeiling: "Decimal?",
  nominationLetterForms: "NominationLetterForms?",
  retenderCapDays: "Int?",
  lossDaysComposition: "LossDaysComposition?",
  finalPreviousBasis: "FinalPreviousBasis?",
};
// Run 1a fix round (review S7, stricter): the release and nominated settings each have their own provenance
// (part-b-provenance.test.ts), in place of releaseProvenance and nominatedProvenance. Residual round (BD-613-124,
// stricter): the design bond's rate and years, and the re-tender cap and the loss-days composition, likewise, in place
// of designBondProvenance and terminationProvenance.
const PROVENANCE = ["ladAntiOppressionProvenance", "weatherGuidanceProvenance", "ladWaiverProvenance", "designBondPctProvenance", "designBondYearsProvenance", "performanceBondReleaseProvenance", "retentionBalanceReleaseProvenance", "nominatedBondProvenance", "nominatedQuotationCeilingProvenance", "nominationLetterFormsProvenance", "retenderCapProvenance", "lossDaysCompositionProvenance", "finalAccountProvenance"];

describe("the post-award policy's Part B settings", () => {
  const m = model("PostAwardPolicy");
  it("each is nullable, with no default, and has its provenance", () => {
    for (const [f, type] of Object.entries(POLICY)) {
      const line = fieldLine(m, f);
      expect(line, f).toContain(type);
      expect(line, f).not.toContain("@default");
    }
    for (const p of PROVENANCE) expect(fieldLine(m, p), p).toMatch(/Provenance\?/);
    expect(fieldLine(m, "designBondPct")).toContain("@db.Decimal(9, 4)");
    expect(fieldLine(m, "nominatedBondPct")).toContain("@db.Decimal(9, 4)");
    expect(fieldLine(m, "nominatedQuotationCeiling")).toContain("@db.Decimal(18, 2)");
  });
  it("the switches' values (OD-B7, B8, B19, B2, B9)", () => {
    expect(enumValues("LadWaiverApplication")).toEqual(["NEXT_CERTIFICATE", "FINAL_ACCOUNT"]);
    expect(enumValues("ReleaseEvent")).toEqual(["MAKING_GOOD", "FINAL_PAYMENT"]);
    expect(enumValues("NominationLetterForms")).toEqual(["ONE_FORM", "PER_LETTER"]);
    expect(enumValues("LossDaysComposition")).toEqual(["CAPPED_RETENDER_PLUS_PERIOD", "DAYS_TO_NEW_COMPLETION"]);
    expect(enumValues("FinalPreviousBasis")).toEqual(["BEFORE_DEDUCTIONS", "AS_PAID"]);
  });
  it("the migration adds them with no DEFAULT and changes no row; the ranges are CHECKed once set", () => {
    expect(statements).not.toMatch(/\bDEFAULT\b/);
    expect(statements).not.toMatch(/^\s*(UPDATE|INSERT|DELETE)\b/m);
    expect(statements).toContain(`ADD CONSTRAINT "PostAwardPolicy_lad_anti_oppression_days" CHECK ("ladAntiOppressionDays" IS NULL OR "ladAntiOppressionDays" > 0);`);
    expect(statements).toContain(`ADD CONSTRAINT "PostAwardPolicy_design_bond" CHECK (("designBondPct" IS NULL OR ("designBondPct" > 0 AND "designBondPct" <= 100)) AND ("designBondYears" IS NULL OR "designBondYears" > 0));`);
    expect(statements).toContain(`ADD CONSTRAINT "PostAwardPolicy_nominated" CHECK (("nominatedBondPct" IS NULL OR ("nominatedBondPct" > 0 AND "nominatedBondPct" <= 100)) AND ("nominatedQuotationCeiling" IS NULL OR "nominatedQuotationCeiling" > 0));`);
    expect(statements).toContain(`ADD CONSTRAINT "PostAwardPolicy_retender_cap_days" CHECK ("retenderCapDays" IS NULL OR "retenderCapDays" > 0);`);
    for (const l of sql.split("\n").filter((x) => x.trim().startsWith("--"))) expect(l, l).not.toContain(";");
  });
  it("no spec figure is written as a setting (BD-613-102): none of 5, 120 or 300000 appears in the migration's statements", () => {
    expect(statements).not.toMatch(/\b(120|300000|300,000)\b/);
    expect(statements).not.toMatch(/[^.\d]5(\.0+)?\b(?!\))/);
  });
});

describe("the contract type's typed twins (FR-MTD-012, BD-613-7)", () => {
  const m = model("ContractType");
  it("eotInstrumentKind and completionVariant, nullable; the text fields kept as their labels", () => {
    expect(fieldLine(m, "eotInstrumentKind")).toMatch(/EotInstrumentKind\?/);
    expect(fieldLine(m, "completionVariant")).toMatch(/CompletionVariant\?/);
    expect(enumValues("EotInstrumentKind")).toEqual(["EXTENSION_OF_TIME", "CONTRACT_PERIOD", "BOTH"]);
    expect(enumValues("CompletionVariant")).toEqual(["STANDARD", "IT"]);
    for (const label of ["eotInstrument", "completionInstrument", "claimsApprovalCommitteeCode"]) expect(fieldLine(m, label), label).toMatch(/String\?/);
  });
  it("claimsCommitteeId names a committee, onDelete Restrict (BD-613-102)", () => {
    expect(m).toMatch(/claimsCommittee\s+Committee\?\s+@relation\("ContractTypeClaimsCommittee", fields: \[claimsCommitteeId\], references: \[id\], onDelete: Restrict\)/);
    expect(statements).toContain(`ALTER TABLE "ContractType" ADD CONSTRAINT "ContractType_claimsCommitteeId_fkey" FOREIGN KEY ("claimsCommitteeId") REFERENCES "Committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`);
  });
});
