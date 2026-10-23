import { describe, expect, it } from "vitest";

import { LOAD_DAY, planPacks, type PackSnapshot } from "./plan";
import type { StarterPack } from "./types";

const NOW = new Date("2026-10-23T02:00:00Z");
const snap = (over: Partial<PackSnapshot> = {}): PackSnapshot => ({
  now: NOW,
  rows: { Organisation: { id: "o1", timeZone: "Asia/Kuala_Lumpur" }, SecurityPolicy: { twoPersonChanges: false }, ...over.rows },
  listSizes: over.listSizes ?? {},
  demoIsLoaded: over.demoIsLoaded ?? false,
});

const limits = (values: Record<string, unknown> = { portalDailyLimit: 200, portalDailyLimitPerNumber: 3 }) => ({ model: "SupplierPolicy", label: "Daily limits", values, provenanceColumn: "portalLimitProvenance", source: "s" });
const classes = (code = "internal") => ({ model: "DocumentClass", label: "Document class", rows: [{ code, values: { nameEn: "Internal", classification: "INTERNAL" }, source: "s" }] });
const classGroup = { model: "SupplierPolicy", label: "Upload classes", values: { supplierUploadClassId: { ref: "DocumentClass:internal" } }, provenanceColumn: "uploadClassProvenance", source: "s" };
const pack = (over: Partial<StarterPack> = {}): StarterPack => ({ name: "generic", version: 1, provenance: "ASSUMED", groups: [], lists: [], ...over });

describe("planPacks: the fill rules (ADR 0043 D1)", () => {
  it("writes a group whose columns are all unset, with its provenance", () => {
    const p = planPacks([pack({ groups: [limits()] })], snap());
    expect(p.faults).toEqual([]);
    expect(p.writes).toMatchObject([{ kind: "GROUP", model: "SupplierPolicy", create: true, values: { portalDailyLimit: 200, portalDailyLimitPerNumber: 3, portalLimitProvenance: "ASSUMED" } }]);
  });

  it("skips a group with one column set, whole, and a group fully set", () => {
    const partly = planPacks([pack({ groups: [limits()] })], snap({ rows: { SupplierPolicy: { portalDailyLimit: 50, portalDailyLimitPerNumber: null } } }));
    expect(partly.writes).toEqual([]);
    expect(partly.skips).toMatchObject([{ target: "Daily limits", reason: "GROUP_PARTLY_SET" }]);
    const set = planPacks([pack({ groups: [limits()] })], snap({ rows: { SupplierPolicy: { portalDailyLimit: 50, portalDailyLimitPerNumber: 2 } } }));
    expect(set.skips).toMatchObject([{ reason: "GROUP_SET" }]);
  });

  it("reads an empty list column as unset", () => {
    const g = { model: "DocumentStorePolicy", label: "Upload rules", values: { allowedMediaTypes: ["application/pdf"], maxBytes: 10n }, provenanceColumn: "provenance", source: "s" };
    const p = planPacks([pack({ groups: [g] })], snap({ rows: { DocumentStorePolicy: { allowedMediaTypes: [], maxBytes: null, provenance: "ASSUMED" } } }));
    expect(p.writes).toMatchObject([{ kind: "GROUP", create: false }]);
  });

  it("skips a list that is not empty", () => {
    const p = planPacks([pack({ lists: [classes()] })], snap({ listSizes: { DocumentClass: 2 } }));
    expect(p.writes).toEqual([]);
    expect(p.skips).toMatchObject([{ target: "Document class", reason: "LIST_NOT_EMPTY" }]);
  });

  it("resolves a reference to a row the run writes, and skips the group when that row is skipped", () => {
    const fresh = planPacks([pack({ lists: [classes()], groups: [classGroup] })], snap());
    expect(fresh.writes.map((w) => w.kind)).toEqual(["ROW", "GROUP"]);
    const skipped = planPacks([pack({ lists: [classes()], groups: [classGroup] })], snap({ listSizes: { DocumentClass: 1 } }));
    expect(skipped.writes).toEqual([]);
    expect(skipped.skips.map((s) => s.reason)).toEqual(["LIST_NOT_EMPTY", "REFERENCE_SKIPPED"]);
  });

  it("loads packs in the order given, and the first wins", () => {
    const first = pack({ name: "rsaj", provenance: "STATED", groups: [limits({ portalDailyLimit: 100, portalDailyLimitPerNumber: 1 })], lists: [classes("rsaj_internal")] });
    const second = pack({ groups: [limits()], lists: [classes()] });
    const p = planPacks([first, second], snap());
    expect(p.writes.map((w) => w.pack)).toEqual(["rsaj", "rsaj"]);
    expect(p.writes[1]).toMatchObject({ values: { portalDailyLimit: 100, portalLimitProvenance: "STATED" } });
    expect(p.skips).toMatchObject([
      { pack: "generic", reason: "LIST_NOT_EMPTY" },
      { pack: "generic", reason: "GROUP_SET" },
    ]);
  });

  it("refuses everything on one fault", () => {
    const bad = { model: "SupplierPolicy", label: "Typo", values: { portalDailyLimt: 1 }, source: "s" };
    const p = planPacks([pack({ groups: [limits(), bad], lists: [classes()] })], snap());
    expect(p.writes).toEqual([]);
    expect(p.faults).toEqual(["generic · Typo: SupplierPolicy has no column portalDailyLimt."]);
  });

  it("refuses a reference that names no row of any pack, a table a pack never writes, the switch column, and a value the product refuses", () => {
    expect(planPacks([pack({ groups: [{ ...classGroup, values: { supplierUploadClassId: { ref: "DocumentClass:nope" } } }] })], snap()).faults[0]).toMatch(/names no row/);
    expect(planPacks([pack({ lists: [{ model: "RolePermission", label: "Grants", rows: [] }] })], snap()).faults).toEqual(["generic · Grants: a pack never writes RolePermission."]);
    expect(planPacks([pack({ groups: [{ model: "SecurityPolicy", label: "S", values: { twoPersonChanges: false }, source: "s" }] })], snap()).faults).toEqual(["generic · S: a pack never sets SecurityPolicy.twoPersonChanges."]);
    const short = planPacks([pack({ groups: [{ model: "SecurityPolicy", label: "S", values: { passwordMinLength: 4 }, source: "s" }] })], snap());
    expect(short.faults).toHaveLength(1);
    expect(short.writes).toEqual([]);
    const series = { model: "NumberingSeries", label: "Numbering", rows: [{ code: "requisition", values: { key: "requisition", nameEn: "R", pattern: "REQ/{SERIAL}", resetOn: "CALENDAR_YEAR" }, source: "s" }] };
    expect(planPacks([pack({ lists: [series] })], snap()).faults).toEqual(["Numbering · requisition: RESET_WITHOUT_PERIOD"]);
  });

  it("takes the organisation's day for a dated row, in the time zone the same run sets", () => {
    const destinations = { model: "RejectionDestination", label: "When rejected", rows: [{ code: "requisition", values: { domain: "requisition", kind: "RETURN_TO_ORIGINATOR", effectiveFrom: LOAD_DAY }, source: "s" }] };
    const tz = { model: "Organisation", label: "Time zone", values: { timeZone: "Asia/Kuala_Lumpur" }, source: "s" };
    const p = planPacks([pack({ lists: [destinations], groups: [tz] })], snap({ rows: { Organisation: { id: "o1", timeZone: null } } }));
    expect(p.faults).toEqual([]);
    expect(p.writes[0]).toMatchObject({ values: { effectiveFrom: new Date("2026-10-23T00:00:00Z") } });
    expect(planPacks([pack({ lists: [destinations] })], snap({ rows: { Organisation: { id: "o1", timeZone: null } } })).faults[0]).toMatch(/time zone/);
  });
});

describe("planPacks: approval by another admin (SP-3, SP-23)", () => {
  it("refuses while the switch is on, and where there is no row (a missing row reads as on)", () => {
    expect(planPacks([pack({ groups: [limits()] })], snap({ rows: { SecurityPolicy: { twoPersonChanges: true } } })).faults[0]).toMatch(/is on/);
    expect(planPacks([pack({ groups: [limits()] })], snap({ rows: { SecurityPolicy: null } })).faults[0]).toMatch(/is on/);
  });

  it("creates a new organisation's first row with the switch off, first, when a pack in the run says so", () => {
    const later = pack({ setsTwoPersonOff: "WHEN_CREATING_ROW", groups: [{ model: "SecurityPolicy", label: "Sign-in", values: { passwordMinLength: 12 }, source: "s" }] });
    const p = planPacks([pack({ name: "rsaj", provenance: "STATED", groups: [limits()] }), later], snap({ rows: { SecurityPolicy: null } }));
    expect(p.faults).toEqual([]);
    expect(p.writes.map((w) => [w.kind, w.pack])).toEqual([["SWITCH_OFF", "generic"], ["GROUP", "rsaj"], ["GROUP", "generic"]]);
    expect(p.writes[0]).toMatchObject({ create: true });
    expect(p.writes[2]).toMatchObject({ create: false });
  });

  it("never changes an existing row's switch", () => {
    const g = pack({ setsTwoPersonOff: "WHEN_CREATING_ROW", groups: [limits()] });
    expect(planPacks([g], snap({ rows: { SecurityPolicy: { twoPersonChanges: true } } })).faults[0]).toMatch(/is on/);
    expect(planPacks([g], snap()).writes.map((w) => w.kind)).toEqual(["GROUP"]);
  });

  it("lets the development fill turn it off only on a database holding the demonstration", () => {
    const fill = pack({ name: "dev-fill", setsTwoPersonOff: "DEMO_DATABASE_ONLY" });
    for (const on of [true, false]) expect(planPacks([fill], snap({ rows: { SecurityPolicy: { twoPersonChanges: on } } })).faults[0]).toMatch(/demonstration/);
    const p = planPacks([fill], snap({ demoIsLoaded: true, rows: { SecurityPolicy: { twoPersonChanges: true } } }));
    expect(p.writes).toMatchObject([{ kind: "SWITCH_OFF", create: false, actor: "Development fill (founder's instruction 2026-10-23)" }]);
    expect(planPacks([fill], snap({ demoIsLoaded: true })).writes).toEqual([]);
  });
});
