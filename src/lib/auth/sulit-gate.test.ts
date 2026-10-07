import { describe, expect, it } from "vitest";

import type { PermissionState } from "./permissions";
import { fieldsOfScope } from "@/lib/sulit-fields";

import { sulitAccessAll, sulitGranted, sulitWithheld, through, type SulitActor, type SulitContext } from "./sulit-access";

/**
 * A record's several fields asked at once, and a value held to the answer (Phase 3b). A tab that shows a dozen figures of one evaluation asks the rule once, logs
 * once, and holds every figure to the answer, so a withheld record carries none of them.
 */

const person: SulitActor = { personId: "p1", isAdministrator: false, system: false };
const admin: SulitActor = { personId: "p9", isAdministrator: true, system: false };
const loader: SulitActor = { personId: null, isAdministrator: false, system: true };
const undecided: PermissionState = { state: "UNDECIDED" };
const ctx = (over: Partial<SulitContext> = {}): SulitContext => ({ scope: "evaluation", restricted: false, named: false, organisationPermission: undecided, ...over });

describe("a record's several fields are asked at once", () => {
  const named = ctx({ named: true });
  it("the answer is the record's, the same for every field it carries", () => {
    const fields = fieldsOfScope("evaluation");
    expect(fields.length).toBeGreaterThan(5);
    expect(sulitAccessAll(person, named, fields)).toEqual({ state: "GRANTED", basis: "NAMED_ON_RECORD" });
    expect(sulitAccessAll(person, ctx(), fields)).toEqual({ state: "WITHHELD", basis: "NOT_NAMED_PERMISSION_UNDECIDED" });
  });
  it("a field the record does not carry refuses all, and so does asking for none", () => {
    expect(sulitAccessAll(person, named, ["score", "openingPrice"])).toEqual({ state: "WITHHELD", basis: "FIELD_NOT_FOR_THIS_RECORD" });
    expect(sulitAccessAll(person, named, [])).toEqual({ state: "WITHHELD", basis: "FIELD_NOT_FOR_THIS_RECORD" });
  });
  it("an administrator and a loader run are refused, as for one field", () => {
    expect(sulitAccessAll(admin, named, ["score"])).toEqual({ state: "WITHHELD", basis: "ADMINISTRATOR" });
    expect(sulitAccessAll(loader, named, ["score"])).toEqual({ state: "WITHHELD", basis: "NOT_A_PERSON" });
  });
  it("fieldsOfScope lists a field under its own scope and under those it is also carried on", () => {
    expect(fieldsOfScope("exercise")).toContain("estimatedValue");
    expect(fieldsOfScope("requisition")).toContain("estimatedValue");
    expect(fieldsOfScope("evaluation")).not.toContain("estimatedValue");
    expect(fieldsOfScope("contract")).toContain("icNumber");
    expect(fieldsOfScope("exercise")).toContain("icNumber");
  });
});

describe("a value held to a gate (through)", () => {
  it("is the value, with the gate's basis, where the gate is granted; a thunk is read only then", () => {
    let reads = 0;
    const s = through(sulitGranted(true as const, "ORGANISATION_PERMISSION"), () => {
      reads++;
      return "RM 1.00";
    });
    expect(s).toEqual({ state: "GRANTED", value: "RM 1.00", basis: "ORGANISATION_PERMISSION" });
    expect(reads).toBe(1);
  });
  it("is the gate itself where it is withheld, carrying no value, and never reads the thunk", () => {
    let reads = 0;
    const s = through(sulitWithheld<true>("NOT_NAMED_PERMISSION_UNDECIDED", "evaluation"), () => {
      reads++;
      return "RM 1.00";
    });
    expect(s.state).toBe("WITHHELD");
    expect(JSON.stringify(s)).not.toContain("RM 1.00");
    expect(reads).toBe(0);
  });
});
