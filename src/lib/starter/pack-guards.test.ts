import { describe, expect, it } from "vitest";

import GENERIC_PACK from "../../../prisma/packs/generic";
import DEV_FILL_PACK from "../../../prisma/dev-fill";
import RSAJ_PACK from "../../../prisma/rsaj/starter-pack";

import { ALLOWED_MODELS, planPacks, type PackSnapshot } from "./plan";
import type { StarterPack } from "./types";

/**
 * What a pack may write and name (step 4.8 L1, M4): the tables are an allow-list held to the three packs, and a class named by literal id is this organisation's
 * and, for a bank statement, SULIT.
 */
const snap = (over: Partial<PackSnapshot> = {}): PackSnapshot => ({
  now: new Date("2026-10-23T02:00:00Z"),
  rows: { Organisation: { id: "o1", timeZone: "Asia/Kuala_Lumpur" }, SecurityPolicy: { twoPersonChanges: false } },
  listSizes: {},
  demoIsLoaded: true,
  ...over,
});
const pack = (over: Partial<StarterPack> = {}): StarterPack => ({ name: "dev-fill", version: 1, provenance: "ASSUMED", groups: [], lists: [], ...over });

describe("the tables a pack may write", () => {
  it("are exactly those the three packs write", () => {
    const written = new Set([GENERIC_PACK, RSAJ_PACK, DEV_FILL_PACK].flatMap((p) => [...p.groups.map((g) => g.model), ...p.lists.map((l) => l.model)]));
    expect([...ALLOWED_MODELS].sort()).toEqual([...written].sort());
  });

  it.each(["CommitteeMember", "OpeningPanelMember", "ExerciseOpeningOfficer", "EvaluationTeamMember", "ReportingLine", "SoDelegation", "SpecialPermission", "ActAttribution", "SulitAccessEvent", "RoleCapability", "Capability", "AuditEntry", "Person"])(
    "refuse %s",
    (model) => {
      expect(planPacks([pack({ lists: [{ model, label: "L", rows: [] }] })], snap()).faults).toEqual([`dev-fill · L: a pack never writes ${model}.`]);
    },
  );
});

describe("a document class named by literal id", () => {
  const classes = (statement: string | null, org = "o1") => ({ dc1: { organisationId: org, classification: "INTERNAL" }, dc2: { organisationId: org, classification: statement } });
  const fill = (upload: string, statement: string) => pack({ groups: [{ model: "SupplierPolicy", label: "Classes", values: { supplierUploadClassId: upload, supplierBankStatementClassId: statement }, provenanceColumn: "uploadClassProvenance", source: "s" }] });

  it("is accepted when both are the organisation's and the statement's is SULIT", () => {
    expect(planPacks([fill("dc1", "dc2")], snap({ classes: classes("SULIT") })).faults).toEqual([]);
  });

  it("faults when it is another organisation's, and when it does not exist", () => {
    expect(planPacks([fill("dc1", "dc2")], snap({ classes: classes("SULIT", "o2") })).faults).toEqual([
      "Classes: supplierUploadClassId names a document class that is not this organisation's.",
      "Classes: supplierBankStatementClassId names a document class that is not this organisation's.",
    ]);
    expect(planPacks([fill("dc1", "gone")], snap({ classes: classes("SULIT") })).faults).toContain("Classes: supplierBankStatementClassId names a document class that is not this organisation's.");
  });

  it("faults when the statement's class is not SULIT", () => {
    expect(planPacks([fill("dc1", "dc2")], snap({ classes: classes("INTERNAL") })).faults.join(" ")).toMatch(/SULIT/);
  });
});
