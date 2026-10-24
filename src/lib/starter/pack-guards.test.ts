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
    // ST-13: the RSAJ pack's expiry reminders.
    expect(ALLOWED_MODELS).toContain("NotificationRule");
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

describe("the class for returned award documents, named by literal id (Wave V V9)", () => {
  const fill = pack({ groups: [{ model: "DocumentStorePolicy", label: "Returned award documents", values: { awardReturnClassId: "dc2" }, source: "s" }] });
  const classes = (classification: string | null, org = "o1") => ({ dc2: { organisationId: org, classification } });

  it("is accepted when it is the organisation's and SULIT", () => {
    expect(planPacks([fill], snap({ classes: classes("SULIT") })).faults).toEqual([]);
  });

  it("faults when it is not SULIT, in the setting's own words", () => {
    expect(planPacks([fill], snap({ classes: classes("INTERNAL") })).faults).toEqual(["Returned award documents: A returned award holds the signatory's identity card number, so its class must be SULIT. Choose a SULIT class."]);
  });

  it("faults when it is another organisation's", () => {
    expect(planPacks([fill], snap({ classes: classes("SULIT", "o2") })).faults).toEqual(["Returned award documents: awardReturnClassId names a document class that is not this organisation's."]);
  });
});

describe("a group naming one demo row by its id (Wave V V9)", () => {
  const route = { model: "ContractType", label: "Supply · how it is paid", values: { paymentRoute: "DELIVERY_ORDER_INVOICE" }, source: "s", rowId: "ct3" };
  const devFill = (g = route) => pack({ setsTwoPersonOff: "DEMO_DATABASE_ONLY", groups: [g] });
  const withRow = (row: Record<string, unknown> | null) => snap({ rows: { ...snap().rows, "ContractType#ct3": row } });

  it("fills the row where the column is unset, updating it, never creating it", () => {
    const p = planPacks([devFill()], withRow({ id: "ct3", organisationId: "o1", paymentRoute: null }));
    expect(p.faults).toEqual([]);
    expect(p.writes.filter((w) => w.kind === "GROUP")).toEqual([expect.objectContaining({ model: "ContractType", rowId: "ct3", create: false, values: { paymentRoute: "DELIVERY_ORDER_INVOICE" }, before: { paymentRoute: null } })]);
  });

  it("skips the row where the column is set, so a second run writes nothing", () => {
    const p = planPacks([devFill()], withRow({ id: "ct3", organisationId: "o1", paymentRoute: "CERTIFIED_CLAIM" }));
    expect(p.writes.filter((w) => w.kind === "GROUP")).toEqual([]);
    expect(p.skips).toEqual([expect.objectContaining({ target: "Supply · how it is paid", reason: "GROUP_SET" })]);
  });

  it("faults where the row is missing or another organisation's, writing nothing", () => {
    for (const row of [null, { id: "ct3", organisationId: "o2", paymentRoute: null }]) {
      const p = planPacks([devFill()], withRow(row));
      expect(p.faults).toEqual(["dev-fill · Supply · how it is paid: there is no such ContractType row of this organisation."]);
      expect(p.writes).toEqual([]);
    }
  });

  it("is refused in any pack but the development fill", () => {
    expect(planPacks([pack({ name: "generic", groups: [route] })], withRow({ id: "ct3", organisationId: "o1", paymentRoute: null })).faults).toEqual(["generic · Supply · how it is paid: only the development fill names a row by its id."]);
  });
});
