import { describe, expect, it } from "vitest";

import { SPEC_BASES, SPEC_MAPPINGS, SPEC_METHODS, SPEC_TAXONOMIES, SPEC_TYPES } from "./fixture";
import { behaviourProfile } from "./profile";
import { classificationSnapshotOf, isClassificationSnapshot } from "./snapshot";
import { deriveTaxonomies } from "./taxonomy";

const on = new Date("2026-09-30T00:00:00Z");

describe("the decided record (snapshot on the move into preparation)", () => {
  const cfg = { types: SPEC_TYPES, bases: SPEC_BASES, taxonomies: SPEC_TAXONOMIES, policy: { dominanceSharePct: "50.0000", provenance: "ASSUMED" as const } };
  const ev = {
    method: SPEC_METHODS[0],
    derivation: { state: "DERIVED", code: "WORK", sharePct: "70.0000" },
    type: { state: "DERIVED" as const, code: "WORK" },
    taxonomies: deriveTaxonomies("WORK", "DS", [], SPEC_MAPPINGS, SPEC_TAXONOMIES, on),
  };
  it("holds the method's flags, the type's twelve behaviours, the threshold with its provenance, the basis and the taxonomies", () => {
    const s = classificationSnapshotOf(ev, cfg, "DS", (c) => c, behaviourProfile)!;
    expect(isClassificationSnapshot(s)).toBe(true);
    expect(s.method.flags.requiresNameApproval).toBe(false);
    expect(s.contractType.profile).toHaveLength(12);
    expect(s.policy).toEqual({ dominanceSharePct: "50.0000", provenance: "ASSUMED" });
    expect(s.basis.nameEn).toBe("Drawings and specification");
    expect(s.taxonomies.find((t) => t.taxonomy === "REPORT")?.value).toBe("REPORT_DB");
  });
  it("does not change when the configuration later does", () => {
    const s = classificationSnapshotOf(ev, cfg, "DS", (c) => c, behaviourProfile)!;
    const frozen = JSON.stringify(s);
    SPEC_TYPES[0].defectsLiabilityApplies = false;
    try {
      expect(JSON.stringify(s)).toBe(frozen);
    } finally {
      SPEC_TYPES[0].defectsLiabilityApplies = true;
    }
  });
  it("is not written without a method, type and basis", () => {
    expect(classificationSnapshotOf(ev, cfg, null, (c) => c, behaviourProfile)).toBeNull();
    expect(classificationSnapshotOf({ ...ev, method: null }, cfg, "DS", (c) => c, behaviourProfile)).toBeNull();
  });
});
