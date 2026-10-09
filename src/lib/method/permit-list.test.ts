import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONFIG_FAULT_TEXT, scopePolicyFaults, type PolicyDraft } from "@/lib/scope/config";

import {
  classificationTaxonomies,
  deriveTaxonomies,
  ignoredMappingsText,
  ignoredPermitListMappings,
  PERMIT_LIST_MAPPING_FAULT_TEXT,
  permitListMappingFaults,
} from "./taxonomy";
import type { Taxonomy, TaxonomyMapping } from "./types";

/**
 * 64-C1 (against accepted 6.3): while the tender-documents policy names a taxonomy as its
 * regulator-permit list, nothing may treat it as a classification. The policy save already
 * refuses a list that classifies (6.4 C-2); these hold the other direction — a mapping into it
 * or conditioned on it, and the scope policy's panel reading it — and the warning for mappings
 * set up before the refusal existed.
 */

const on = new Date("2026-10-01T00:00:00Z");
const tax = (code: string, nameEn: string, values: string[]): Taxonomy => ({ code, nameEn, sortOrder: 0, retiredOn: null, values: values.map((v) => ({ code: v, nameEn: v, retiredOn: null })) });
const map = (m: Partial<TaxonomyMapping> & Pick<TaxonomyMapping, "contractTypeCode" | "taxonomyCode" | "valueCode">): TaxonomyMapping => ({ whenBasisCode: null, whenTaxonomyCode: null, whenValueCode: null, provenance: "ASSUMED", ...m });

const permits = tax("permits", "Regulator permits", ["cidb", "dosh"]);
const kind = tax("kind", "Contract kind", ["civil", "mech"]);
const intoPermits = map({ contractTypeCode: "WORKS", taxonomyCode: "permits", valueCode: "cidb" });
const onPermits = map({ contractTypeCode: "WORKS", taxonomyCode: "kind", valueCode: "mech", whenTaxonomyCode: "permits", whenValueCode: "dosh" });
const plain = map({ contractTypeCode: "WORKS", taxonomyCode: "kind", valueCode: "civil" });
const otherType = map({ contractTypeCode: "SUPPLY", taxonomyCode: "permits", valueCode: "dosh" });

describe("a contract-type mapping into the permit list, or conditioned on it, is refused", () => {
  it("a mapping into the permit list is refused on the classification field", () => {
    expect(permitListMappingFaults(intoPermits, "permits")).toEqual([{ code: "MAPS_INTO_PERMIT_LIST", field: "taxonomyCode" }]);
  });
  it("a mapping conditioned on the permit list is refused on the condition's field", () => {
    expect(permitListMappingFaults(onPermits, "permits")).toEqual([{ code: "CONDITIONED_ON_PERMIT_LIST", field: "whenTaxonomyCode" }]);
  });
  it("both at once are both refused", () => {
    expect(permitListMappingFaults({ taxonomyCode: "permits", whenTaxonomyCode: "permits" }, "permits").map((f) => f.code)).toEqual(["MAPS_INTO_PERMIT_LIST", "CONDITIONED_ON_PERMIT_LIST"]);
  });
  it("a mapping that touches another list is accepted", () => {
    expect(permitListMappingFaults(plain, "permits")).toEqual([]);
    expect(permitListMappingFaults({ taxonomyCode: "kind", whenTaxonomyCode: "other" }, "permits")).toEqual([]);
  });
  it("with no permit list named, nothing is refused: the list is only a list while the policy names it", () => {
    expect(permitListMappingFaults(intoPermits, null)).toEqual([]);
    expect(permitListMappingFaults(onPermits, null)).toEqual([]);
  });
  it("each refusal is a fixed sentence saying why and where the permit list is named", () => {
    for (const text of Object.values(PERMIT_LIST_MAPPING_FAULT_TEXT)) {
      expect(text).toContain("permit list named under Configuration, Tender documents");
      expect(text).toContain("name a different permit list there first");
      expect(text).not.toMatch(/permits|MAPS_|CONDITIONED_/);
    }
    expect(PERMIT_LIST_MAPPING_FAULT_TEXT.MAPS_INTO_PERMIT_LIST).toContain("never derived from a contract type, so this mapping would be ignored");
    expect(PERMIT_LIST_MAPPING_FAULT_TEXT.CONDITIONED_ON_PERMIT_LIST).toContain("this mapping would never apply");
  });
});

describe("why: derivation ignores such mappings (the claim the refusal and the warning make)", () => {
  it("with the permit list out of classification, the mapping into it derives nothing and the one conditioned on it never applies", () => {
    const live = classificationTaxonomies([permits, kind], ["permits"]);
    const out = deriveTaxonomies("WORKS", null, [], [intoPermits, onPermits, plain], live, on);
    expect(out.map((o) => [o.taxonomyCode, o.state, o.valueCode])).toEqual([["kind", "DERIVED", "civil"]]);
  });
  it("without a permit list the same rows do apply, more specific first", () => {
    const out = deriveTaxonomies("WORKS", null, [], [intoPermits, map({ ...onPermits, whenValueCode: "cidb" }), plain], [permits, kind], on);
    expect(out.map((o) => [o.taxonomyCode, o.state, o.valueCode])).toEqual([["permits", "DERIVED", "cidb"], ["kind", "DERIVED", "mech"]]);
  });
});

describe("mappings set up before the refusal are reported as ignored, not left silent", () => {
  const all = [intoPermits, onPermits, plain, otherType];
  it("for the exercise's contract type: each ignored mapping with why", () => {
    expect(ignoredPermitListMappings(all, "permits", "WORKS")).toEqual([
      { mapping: intoPermits, why: "MAPS_INTO_PERMIT_LIST" },
      { mapping: onPermits, why: "CONDITIONED_ON_PERMIT_LIST" },
    ]);
    expect(ignoredPermitListMappings(all, "permits", "SUPPLY")).toEqual([{ mapping: otherType, why: "MAPS_INTO_PERMIT_LIST" }]);
  });
  it("with no type given, every type's", () => {
    expect(ignoredPermitListMappings(all, "permits")).toHaveLength(3);
  });
  it("none when no permit list is named, or none touch it", () => {
    expect(ignoredPermitListMappings(all, null, "WORKS")).toEqual([]);
    expect(ignoredPermitListMappings([plain], "permits", "WORKS")).toEqual([]);
  });
  it("the warning names the list by its name, says why, and says where to act", () => {
    expect(ignoredMappingsText(1, "Regulator permits")).toBe(
      "1 mapping for this contract type maps into, or is conditioned on, Regulator permits. It is ignored: that list is the permit list named under Configuration, Tender documents, chosen on each exercise and never derived from the type. Remove it under Configuration, Reference data, or name a different permit list.",
    );
    expect(ignoredMappingsText(2, "Regulator permits")).toBe(
      "2 mappings for this contract type map into, or are conditioned on, Regulator permits. They are ignored: that list is the permit list named under Configuration, Tender documents, chosen on each exercise and never derived from the type. Remove them under Configuration, Reference data, or name a different permit list.",
    );
  });
});

describe("the scope policy's specification panel may not read the permit list", () => {
  const unset: PolicyDraft = {
    measurementStandardLabel: null, measurementStandardProvenance: null, bqPreparerQualificationCode: null, estimateLeadDays: null, estimateLeadProvenance: null,
    estimateCustodianRoleCode: null, estimateAuditRoleCode: null, estimateOverrideRoleCode: null, panelSignatoryLimit: null, panelSignatoryLimitProvenance: null,
    panelContractKindTaxonomyCode: null, panelProjectStatusTaxonomyCode: null,
  };
  type Known = Parameters<typeof scopePolicyFaults>[1];
  const known: Known = { qualifications: [], offices: [], lists: ["permits", "kind"], permitList: "permits" };
  const fields = (p: Partial<PolicyDraft>, k: Known = known) => scopePolicyFaults({ ...unset, ...p }, k).map((f) => `${f.field}:${f.code}`);

  it("either panel list naming the permit list is refused on its field", () => {
    expect(fields({ panelContractKindTaxonomyCode: "permits" })).toEqual(["panelContractKindTaxonomyCode:PERMIT_LIST"]);
    expect(fields({ panelProjectStatusTaxonomyCode: "permits" })).toEqual(["panelProjectStatusTaxonomyCode:PERMIT_LIST"]);
  });
  it("another list is accepted; with no permit list named the same list is accepted", () => {
    expect(fields({ panelContractKindTaxonomyCode: "kind", panelProjectStatusTaxonomyCode: "kind" })).toEqual([]);
    expect(fields({ panelContractKindTaxonomyCode: "permits" }, { ...known, permitList: null })).toEqual([]);
    expect(fields({ panelContractKindTaxonomyCode: "permits" }, { qualifications: [], offices: [], lists: ["permits"] })).toEqual([]);
  });
  it("an unknown list is still refused as unknown, not as the permit list", () => {
    expect(fields({ panelContractKindTaxonomyCode: "gone" }, { ...known, permitList: "gone" })).toEqual(["panelContractKindTaxonomyCode:UNKNOWN_LIST"]);
  });
  it("the refusal is a fixed sentence saying why and where", () => {
    expect(CONFIG_FAULT_TEXT.PERMIT_LIST).toBe(
      "That list is the permit list named under Configuration, Tender documents. Permits are chosen on each exercise and no exercise is classified in it, so the specification panel would find no value there. Choose another list, or name a different permit list there first.",
    );
  });
});

describe("the acts read the permit list under the organisation's lock, in the transaction that writes", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const fn = (src: string, name: string) => {
    const i = src.indexOf(`export async function ${name}(`);
    expect(i, `${name} exists`).toBeGreaterThan(-1);
    const next = src.indexOf("\nexport async function ", i + 10);
    return src.slice(i, next === -1 ? undefined : next);
  };
  it("saveTaxonomyMapping refuses before it creates, inside one transaction", () => {
    const body = fn(read("src/app/configuration/reference-data/actions.ts"), "saveTaxonomyMapping");
    const tx = body.slice(body.indexOf("db.$transaction"));
    expect(tx).toMatch(/FOR UPDATE[\s\S]*tenderDocumentPolicy\.findUnique[\s\S]*permitListMappingFaults\([\s\S]*taxonomyMapping\.create/);
    expect(body.slice(0, body.indexOf("db.$transaction"))).not.toMatch(/taxonomyMapping\.create|auditedCreate/);
  });
  it("saveScopePolicy passes the permit list read under its lock to the policy check", () => {
    const body = fn(read("src/app/configuration/scope/core.ts"), "saveScopePolicy");
    const tx = body.slice(body.indexOf("db.$transaction"));
    expect(tx).toMatch(/lockOrganisation[\s\S]*tenderDocumentPolicy\.findUnique[\s\S]*scopePolicyFaults\([^\n]*permitList \}\)[\s\S]*scopePolicy\.upsert/);
  });
  it("the exercise screen warns from the same rule", () => {
    // Founder, 2026-10-05: Classification and Contract type became the Overview, so the warning now lives in overview.tsx.
    expect(read("src/app/sourcing/[id]/overview.tsx")).toMatch(/ignoredPermitListMappings\(config\.mappings, permitList\.code, liveType\)[\s\S]*ignoredMappingsText\(ignored\.length, permitList\.nameEn\)/);
  });
});
