import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SULIT_FIELDS, SULIT_SCOPES, type SulitScope } from "@/lib/sulit-fields";

import type { PermissionState } from "./permissions";
import {
  applyDecision,
  decide,
  estimateFigureAccess,
  exerciseVisible,
  fieldIsFor,
  grantedWords,
  mapSulit,
  namedAfterChangingPersonInCharge,
  namedAfterRemovingParticipant,
  namingFault,
  namedOn,
  namedOnEvaluation,
  namedOnExercise,
  refusalWords,
  SULIT_GRANT_BASES,
  SULIT_REFUSAL_BASES,
  sulitAccess,
  sulitGranted,
  sulitValue,
  sulitWithheld,
  type ExerciseNamedFacts,
  type SulitActor,
  type SulitContext,
} from "./sulit-access";

const person: SulitActor = { personId: "p1", isAdministrator: false, system: false };
const admin: SulitActor = { personId: "p9", isAdministrator: true, system: false };
const loader: SulitActor = { personId: null, isAdministrator: false, system: true };

const undecided: PermissionState = { state: "UNDECIDED" };
const held: PermissionState = { state: "ROLE", roleCodes: ["SEC"] };
const facts = (over: Partial<ExerciseNamedFacts> = {}): ExerciseNamedFacts => ({ participantIds: [], personInChargeId: null, proposalReviewerId: null, evaluationTeamIds: [], openingPanelIds: [], stepHolderIds: [], stepDeciderIds: [], committeeMemberIds: [], ...over });
const ctx = (over: Partial<SulitContext> = {}): SulitContext => ({ scope: "exercise", restricted: false, named: false, organisationPermission: undecided, ...over });

describe("the registry gives every SULIT field a scope", () => {
  it("each entry names one of the five scopes, and a second kind of record only from the same list", () => {
    for (const f of SULIT_FIELDS) {
      expect(SULIT_SCOPES, f.field).toContain(f.scope);
      for (const also of f.alsoIn ?? []) expect(SULIT_SCOPES, `${f.field} also in`).toContain(also);
    }
  });
  it("the department estimate belongs to a requisition and is also carried on an exercise", () => {
    expect(fieldIsFor("estimatedValue", "requisition")).toBe(true);
    expect(fieldIsFor("estimatedValue", "exercise")).toBe(true);
    expect(fieldIsFor("estimatedValue", "contract")).toBe(false);
  });
  it("a field is for its own scope only", () => {
    expect(fieldIsFor("score", "evaluation")).toBe(true);
    expect(fieldIsFor("score", "exercise")).toBe(false);
    expect(fieldIsFor("companyEstimate", "exercise")).toBe(true);
    expect(fieldIsFor("notAField", "exercise")).toBe(false);
  });
  it("every scope is used by at least one field (a scope nothing reads is a dead branch)", () => {
    for (const s of SULIT_SCOPES) expect(SULIT_FIELDS.some((f) => f.scope === s), s).toBe(true);
  });
});

describe("who is named on an exercise", () => {
  const f = facts({ participantIds: ["a"], personInChargeId: "b", proposalReviewerId: "c", evaluationTeamIds: ["d"], openingPanelIds: ["e"] });
  it("each way of being named is found, and nothing else is", () => {
    expect(namedOnExercise(f, "a")).toEqual(["PARTICIPANT"]);
    expect(namedOnExercise(f, "b")).toEqual(["PERSON_IN_CHARGE"]);
    expect(namedOnExercise(f, "c")).toEqual(["PROPOSAL_REVIEWER"]);
    expect(namedOnExercise(f, "d")).toEqual(["EVALUATION_TEAM"]);
    expect(namedOnExercise(f, "e")).toEqual(["OPENING_PANEL"]);
    expect(namedOnExercise(f, "z")).toEqual([]);
  });
  it("a person named two ways is named both", () => {
    expect(namedOnExercise(facts({ participantIds: ["a"], personInChargeId: "a" }), "a")).toEqual(["PARTICIPANT", "PERSON_IN_CHARGE"]);
  });
  it("the evaluation's resolver is narrower: its team, the participants and the person in charge, not the opening panel or the reviewer", () => {
    expect(namedOnEvaluation(f, "d")).toEqual(["EVALUATION_TEAM"]);
    expect(namedOnEvaluation(f, "a")).toEqual(["PARTICIPANT"]);
    expect(namedOnEvaluation(f, "b")).toEqual(["PERSON_IN_CHARGE"]);
    expect(namedOnEvaluation(f, "e")).toEqual([]);
    expect(namedOnEvaluation(f, "c")).toEqual([]);
  });
  it("the three scopes with no record of who is named name nobody", () => {
    for (const s of ["requisition", "contract", "supplier"] as const) expect(namedOn(s, f, "a"), s).toEqual([]);
  });
  it("no facts, or no person, names nobody", () => {
    expect(namedOn("exercise", null, "a")).toEqual([]);
    expect(namedOn("exercise", f, null)).toEqual([]);
  });
});

describe("a restricted exercise keeps someone who can see it", () => {
  it("removing the only participant leaves nobody", () => {
    expect(namedAfterRemovingParticipant(facts({ participantIds: ["a"] }), "a")).toEqual([]);
  });
  it("removing one of two leaves the other", () => {
    expect(namedAfterRemovingParticipant(facts({ participantIds: ["a", "b"] }), "a")).toEqual(["b"]);
  });
  it("the person in charge, the reviewer, the team and the panel stay named when a participant is removed", () => {
    expect(namedAfterRemovingParticipant(facts({ participantIds: ["a"], personInChargeId: "b", proposalReviewerId: "c", evaluationTeamIds: ["d"], openingPanelIds: ["e"] }), "a").sort()).toEqual(["b", "c", "d", "e"]);
  });
  it("a person named as a participant and another way stays named after the participant row goes", () => {
    expect(namedAfterRemovingParticipant(facts({ participantIds: ["a"], personInChargeId: "a" }), "a")).toEqual(["a"]);
  });
});

describe("sulitAccess", () => {
  it("grants a person named on the record", () => {
    expect(sulitAccess(person, ctx({ named: true }), "openingPrice")).toEqual({ state: "GRANTED", basis: "NAMED_ON_RECORD" });
  });
  it("grants the organisation-wide permission on an unrestricted exercise", () => {
    expect(sulitAccess(person, ctx({ organisationPermission: held }), "openingPrice")).toEqual({ state: "GRANTED", basis: "ORGANISATION_PERMISSION" });
  });
  it("the organisation-wide permission does not open a restricted exercise", () => {
    expect(sulitAccess(person, ctx({ restricted: true, organisationPermission: held }), "openingPrice")).toEqual({ state: "WITHHELD", basis: "RESTRICTED_NOT_NAMED" });
  });
  it("a named person is granted on a restricted exercise", () => {
    expect(sulitAccess(person, ctx({ restricted: true, named: true }), "openingPrice")).toEqual({ state: "GRANTED", basis: "NAMED_ON_RECORD" });
  });
  it("an administrator is always refused, even one who is named and one who holds the permission", () => {
    expect(sulitAccess(admin, ctx({ named: true }), "openingPrice")).toEqual({ state: "WITHHELD", basis: "ADMINISTRATOR" });
    expect(sulitAccess(admin, ctx({ organisationPermission: held }), "openingPrice")).toEqual({ state: "WITHHELD", basis: "ADMINISTRATOR" });
    expect(sulitAccess(admin, ctx({ restricted: true, named: true }), "openingPrice")).toEqual({ state: "WITHHELD", basis: "ADMINISTRATOR" });
  });
  it("a loader run is not a person and reads nothing", () => {
    expect(sulitAccess(loader, ctx({ named: true, organisationPermission: held }), "openingPrice")).toEqual({ state: "WITHHELD", basis: "NOT_A_PERSON" });
  });
  it("a person with no id is refused, never granted on a blank match", () => {
    expect(decide({ personId: null, isAdministrator: false, system: false }, ctx({ named: true }))).toEqual({ state: "WITHHELD", basis: "NOT_A_PERSON" });
  });
  it("tells undecided from withheld from held only for a department", () => {
    expect(sulitAccess(person, ctx({ organisationPermission: undecided }), "openingPrice").basis).toBe("NOT_NAMED_PERMISSION_UNDECIDED");
    expect(sulitAccess(person, ctx({ organisationPermission: { state: "WITHHELD", roleCodes: ["X"] } }), "openingPrice").basis).toBe("NOT_NAMED_PERMISSION_WITHHELD");
    expect(sulitAccess(person, ctx({ organisationPermission: { state: "SCOPED_ONLY", roleCodes: ["X"] } }), "openingPrice").basis).toBe("NOT_NAMED_PERMISSION_SCOPED");
    expect(sulitAccess(person, ctx({ organisationPermission: { state: "NOT_GRANTABLE" } }), "openingPrice").basis).toBe("NOT_NAMED_PERMISSION_NOT_HELD");
  });
  it("a requisition, contract or supplier value is reached only through the permission, and undecided is refused", () => {
    for (const [scope, field] of [["requisition", "estimatedValue"], ["contract", "matterRoutedValue"], ["supplier", "contactEmail"]] as [SulitScope, string][]) {
      expect(sulitAccess(person, ctx({ scope }), field), scope).toEqual({ state: "WITHHELD", basis: "NOT_NAMED_PERMISSION_UNDECIDED" });
      expect(sulitAccess(person, ctx({ scope, organisationPermission: held }), field), scope).toEqual({ state: "GRANTED", basis: "ORGANISATION_PERMISSION" });
    }
  });
  it("a field is shown only on the kind of record the registry names", () => {
    expect(sulitAccess(person, ctx({ scope: "exercise", named: true }), "score")).toEqual({ state: "WITHHELD", basis: "FIELD_NOT_FOR_THIS_RECORD" });
    expect(sulitAccess(person, ctx({ named: true }), "notRegistered")).toEqual({ state: "WITHHELD", basis: "FIELD_NOT_FOR_THIS_RECORD" });
  });
  it("is deterministic over every scope and field: no field in the registry is refused as unregistered on its own scope", () => {
    for (const f of SULIT_FIELDS) expect(sulitAccess(person, ctx({ scope: f.scope, named: true }), f.field).state, f.field).toBe("GRANTED");
  });
});

describe("a restricted exercise is hidden (FR-MTD-007)", () => {
  const f = facts({ participantIds: ["a"], evaluationTeamIds: ["d"] });
  it("an unrestricted exercise is visible to everyone, an administrator included", () => {
    expect(exerciseVisible(person, false, f)).toBe(true);
    expect(exerciseVisible(admin, false, f)).toBe(true);
  });
  it("a restricted one is visible only to the people named on it", () => {
    expect(exerciseVisible({ ...person, personId: "a" }, true, f)).toBe(true);
    expect(exerciseVisible({ ...person, personId: "d" }, true, f)).toBe(true);
    expect(exerciseVisible(person, true, f)).toBe(false);
  });
  it("an administrator does not see a restricted exercise, even one who is named", () => {
    expect(exerciseVisible({ ...admin, personId: "a" }, true, f)).toBe(false);
  });
  it("a loader run is not hidden from what it loads, and a nameless actor is hidden", () => {
    expect(exerciseVisible(loader, true, f)).toBe(true);
    expect(exerciseVisible({ personId: null, isAdministrator: false, system: false }, true, f)).toBe(false);
  });
  it("an exercise with nobody named is visible to nobody who is signed in", () => {
    expect(exerciseVisible(person, true, facts())).toBe(false);
  });
});

describe("the company estimate's figure (FR-EST-008)", () => {
  it("is granted only where there is no fault", () => {
    expect(estimateFigureAccess(person, null)).toEqual({ state: "GRANTED", basis: "IN_CUSTODY" });
  });
  it("each fault is carried as its own refusal", () => {
    for (const fault of ["SEALED", "CUSTODY_NOT_SET", "NOT_IN_CUSTODY", "CUSTODY_DAY_UNKNOWN"] as const) expect(estimateFigureAccess(person, fault)).toEqual({ state: "WITHHELD", basis: fault });
  });
  it("an administrator and a loader run are refused whatever the custody", () => {
    expect(estimateFigureAccess(admin, null)).toEqual({ state: "WITHHELD", basis: "ADMINISTRATOR" });
    expect(estimateFigureAccess(loader, null)).toEqual({ state: "WITHHELD", basis: "NOT_A_PERSON" });
  });
});

describe("Sulit<T>", () => {
  it("a withheld value carries no value, whatever was passed", () => {
    const s = applyDecision({ state: "WITHHELD", basis: "NOT_NAMED_PERMISSION_UNDECIDED" }, "exercise", () => {
      throw new Error("must not be read");
    });
    expect(s.state).toBe("WITHHELD");
    expect("value" in s).toBe(false);
    expect(sulitValue(s)).toBeNull();
  });
  it("a granted value is read, and mapped", () => {
    const s = applyDecision({ state: "GRANTED", basis: "NAMED_ON_RECORD" }, "exercise", 5);
    expect(sulitValue(mapSulit(s, (n) => n * 2))).toBe(10);
    expect(mapSulit(sulitWithheld<number>("ADMINISTRATOR", "exercise"), (n) => n * 2).state).toBe("WITHHELD");
  });
  it("the withheld value says why in words", () => {
    const s = sulitWithheld("NOT_NAMED_PERMISSION_UNDECIDED", "requisition");
    expect(s.state === "WITHHELD" && s.words.en).toMatch(/not yet decided/);
    expect(sulitGranted(1, "IN_CUSTODY").state).toBe("GRANTED");
  });
});

describe("the Secretariat and Internal Audit read the evaluation, and the estimate once disclosed (rulings of 2026-10-08 on log lines 1735 and 1736)", () => {
  const person = { personId: "p", isAdministrator: false, system: false };
  const ctx = (over: Partial<Parameters<typeof sulitAccess>[1]> = {}) => ({ scope: "evaluation" as const, restricted: false, named: false, organisationPermission: { state: "UNDECIDED" as const }, ...over });

  it("a holder of the office reads the evaluation scope, told by which office, ahead of the permission", () => {
    expect(sulitAccess(person, ctx({ evaluationOffice: "SECRETARIAT_OFFICE" }), "score")).toEqual({ state: "GRANTED", basis: "SECRETARIAT_OFFICE" });
    expect(sulitAccess(person, ctx({ evaluationOffice: "INTERNAL_AUDIT_OFFICE" }), "totalScore")).toEqual({ state: "GRANTED", basis: "INTERNAL_AUDIT_OFFICE" });
  });

  it("nobody who holds no office (or whose office is unset) is let in on that account", () => {
    expect(sulitAccess(person, ctx({ evaluationOffice: null }), "score")).toMatchObject({ state: "WITHHELD", basis: "NOT_NAMED_PERMISSION_UNDECIDED" });
    expect(sulitAccess(person, ctx(), "score")).toMatchObject({ state: "WITHHELD" });
  });

  it("does not open a restricted exercise: the named list prevails", () => {
    expect(sulitAccess(person, ctx({ evaluationOffice: "SECRETARIAT_OFFICE", restricted: true }), "score")).toEqual({ state: "WITHHELD", basis: "RESTRICTED_NOT_NAMED" });
  });

  it("opens only the evaluation scope, not what the exercise itself carries", () => {
    expect(sulitAccess(person, ctx({ scope: "exercise", evaluationOffice: "SECRETARIAT_OFFICE" }), "openingPrice")).toMatchObject({ state: "WITHHELD" });
    expect(sulitAccess(person, ctx({ scope: "exercise", evaluationOffice: "INTERNAL_AUDIT_OFFICE" }), "bqRate")).toMatchObject({ state: "WITHHELD" });
  });

  it("an administrator account is refused whatever office it holds", () => {
    expect(sulitAccess({ ...person, isAdministrator: true }, ctx({ evaluationOffice: "SECRETARIAT_OFFICE" }), "score")).toEqual({ state: "WITHHELD", basis: "ADMINISTRATOR" });
  });

  it("says in words which office let the reader in, and has a basis the log may hold", () => {
    expect(grantedWords("SECRETARIAT_OFFICE").en).toMatch(/Secretariat/);
    expect(grantedWords("INTERNAL_AUDIT_OFFICE").en).toMatch(/Internal Audit/);
    expect(SULIT_GRANT_BASES).toContain("SECRETARIAT_OFFICE");
    expect(SULIT_GRANT_BASES).toContain("INTERNAL_AUDIT_OFFICE");
  });

  it("the estimate: sealed stays sealed to a reader of the evaluation, and disclosed it is read by a reader of the evaluation when the custody list refuses", () => {
    for (const reader of ["NAMED_ON_RECORD", "SECRETARIAT_OFFICE", "INTERNAL_AUDIT_OFFICE"] as const) {
      expect(estimateFigureAccess(person, "SEALED", reader)).toEqual({ state: "WITHHELD", basis: "SEALED" });
      for (const fault of ["CUSTODY_NOT_SET", "NOT_IN_CUSTODY", "CUSTODY_DAY_UNKNOWN"] as const) expect(estimateFigureAccess(person, fault, reader), `${fault} ${reader}`).toEqual({ state: "GRANTED", basis: reader });
    }
    // The custody list keeps its own basis, and a reader of the evaluation is not asked when it grants.
    expect(estimateFigureAccess(person, null, "SECRETARIAT_OFFICE")).toEqual({ state: "GRANTED", basis: "IN_CUSTODY" });
    // Nobody else is let in, and an administrator or a loader run never is.
    expect(estimateFigureAccess(person, "NOT_IN_CUSTODY", null)).toEqual({ state: "WITHHELD", basis: "NOT_IN_CUSTODY" });
    expect(estimateFigureAccess({ ...person, isAdministrator: true }, "NOT_IN_CUSTODY", "NAMED_ON_RECORD")).toEqual({ state: "WITHHELD", basis: "ADMINISTRATOR" });
    expect(estimateFigureAccess({ personId: null, isAdministrator: false, system: true }, "NOT_IN_CUSTODY", "NAMED_ON_RECORD")).toEqual({ state: "WITHHELD", basis: "NOT_A_PERSON" });
  });
});

describe("a requisition and a contract matter are named by their route (ruling of 2026-10-08, the amendment of the ruling on log line 1526)", () => {
  const routed = { requesterId: "req", stepHolderIds: ["hold"], stepDeciderIds: ["dec"] };

  it("a requisition names its requester, a holder of a pending step and a decider, each as what they are", () => {
    expect(namedOn("requisition", null, "req", routed, ["estimatedValue"])).toEqual(["REQUESTER"]);
    expect(namedOn("requisition", null, "hold", routed, ["estimatedValue"])).toEqual(["STEP_HOLDER"]);
    expect(namedOn("requisition", null, "dec", routed, ["estimatedValue"])).toEqual(["STEP_DECIDER"]);
    expect(namedOn("requisition", null, "other", routed, ["estimatedValue"])).toEqual([]);
    expect(namedOn("requisition", null, "req", null, ["estimatedValue"])).toEqual([]);
  });

  it("a contract names its matter's deciders for the amount they decide on, and for nothing else of the contract", () => {
    for (const field of ["waitingValue", "matterAmount", "matterRoutedValue"]) expect(namedOn("contract", null, "hold", routed, [field]), field).toEqual(["STEP_HOLDER"]);
    for (const field of ["estimateRate", "tenderedLineAmount", "correctedLineAmount", "arithmeticVarianceAmount", "certificateComputedAmount", "signatureSupportedUpTo", "icNumber", "documentBytes"]) expect(namedOn("contract", null, "hold", routed, [field]), field).toEqual([]);
    // Asked with another field alongside, the amount does not carry it, and an unspecified ask names nobody.
    expect(namedOn("contract", null, "hold", routed, ["waitingValue", "estimateRate"])).toEqual([]);
    expect(namedOn("contract", null, "hold", routed, [])).toEqual([]);
    expect(namedOn("contract", null, "hold", null, ["waitingValue"])).toEqual([]);
  });

  it("a supplier is named by nothing, and an administrator is refused whatever the route says", () => {
    expect(namedOn("supplier", null, "req", routed, ["contactName"])).toEqual([]);
    const admin = { personId: "hold", isAdministrator: true, system: false };
    expect(sulitAccess(admin, { scope: "requisition", restricted: false, named: true, organisationPermission: { state: "UNDECIDED" } }, "estimatedValue")).toEqual({ state: "WITHHELD", basis: "ADMINISTRATOR" });
  });

  it("the refusal for a requisition names the two ways in, in words", () => {
    expect(refusalWords("NOT_NAMED_PERMISSION_UNDECIDED", "requisition").en).toMatch(/^You are not the officer it was raised for and you do not decide its route/);
    expect(refusalWords("NOT_NAMED_PERMISSION_UNDECIDED", "contract").en).toMatch(/^No list names/);
  });
});

describe("the words", () => {
  it("every refusal has an English and a Malay sentence, none a code, for every scope", () => {
    for (const basis of SULIT_REFUSAL_BASES) {
      for (const scope of [...SULIT_SCOPES, "estimate" as const]) {
        const w = refusalWords(basis, scope);
        expect(w.en.length, `${basis} en`).toBeGreaterThan(10);
        expect(w.ms.length, `${basis} ms`).toBeGreaterThan(10);
        expect(w.en, basis).not.toMatch(/[A-Z]{3,}_[A-Z_]+|sulit\.read/);
      }
    }
  });
  it("a scope with no list says nobody is named, and one with a list says you are not", () => {
    expect(refusalWords("NOT_NAMED_PERMISSION_UNDECIDED", "supplier").en).toMatch(/^No list names/);
    expect(refusalWords("NOT_NAMED_PERMISSION_UNDECIDED", "exercise").en).toMatch(/^You are not named/);
  });
  it("every granting basis has words", () => {
    for (const b of SULIT_GRANT_BASES) expect(grantedWords(b).en.length).toBeGreaterThan(10);
    expect(grantedWords("NAMED_ON_RECORD", ["PARTICIPANT", "EVALUATION_TEAM"]).en).toBe("Shown because you are a named participant and on the evaluation team.");
  });
});

describe("the access log's CHECKs are held to the code's lists", () => {
  const sql = readFileSync(join(process.cwd(), "prisma/migrations/20261008110100_sulit_access_event/migration.sql"), "utf8");
  // Changed for the rulings of 2026-10-08 on log lines 1735 and 1736 (two granting bases, SECRETARIAT_OFFICE and INTERNAL_AUDIT_OFFICE): the basis CHECK is rebuilt by a later migration,
  // so the list is read from the LAST migration that writes it, the one the database ends with. The first migration's other CHECKs are read from the first.
  const lastBasisCheck = readdirSync(join(process.cwd(), "prisma/migrations"))
    .sort()
    .map((d) => join(process.cwd(), "prisma/migrations", d, "migration.sql"))
    .filter((f) => existsSync(f))
    .map((f) => readFileSync(f, "utf8"))
    .filter((t) => t.includes('ADD CONSTRAINT "SulitAccessEvent_basis_matches_outcome" CHECK'))
    .at(-1)!;
  const listAfter = (re: RegExp, from: string = sql) => [...(re.exec(from)?.[1] ?? "").matchAll(/'(\w+)'/g)].map((m) => m[1]);
  // Changed for Phase 4b (a creditor profile has its own scope, 'creditorProfile'): the scope CHECK is rebuilt by migration 20261013100000, so, as the bases are, its list is read from the LAST
  // migration that writes it, the one the database ends with.
  const lastScopeCheck = readdirSync(join(process.cwd(), "prisma/migrations"))
    .sort()
    .map((d) => join(process.cwd(), "prisma/migrations", d, "migration.sql"))
    .filter((f) => existsSync(f))
    .map((f) => readFileSync(f, "utf8"))
    .filter((t) => t.includes('ADD CONSTRAINT "SulitAccessEvent_scope_known" CHECK'))
    .at(-1)!;
  it("the scope list is the registry's", () => {
    expect(listAfter(/"scope" IN \(([^)]*)\)/, lastScopeCheck)).toEqual([...SULIT_SCOPES]);
  });
  it("the granted and withheld bases are the code's, and NOT_LOGGED is never stored", () => {
    expect(listAfter(/"outcome" = 'GRANTED' AND "basis" IN \(([^)]*)\)/, lastBasisCheck)).toEqual([...SULIT_GRANT_BASES]);
    expect(listAfter(/"outcome" = 'WITHHELD' AND "basis" IN \(([^)]*)\)/, lastBasisCheck)).toEqual(SULIT_REFUSAL_BASES.filter((b) => b !== "NOT_LOGGED"));
    // Changed for Phase 4b: migration 20261013100000 also holds triggers after its CHECKs, so the file no longer ENDS with the basis CHECK. What this asserted is that the CHECK refuses an
    // unknown value (it is written `IS TRUE`), and that is asserted of the statement itself, which is stricter than the end of a file.
    expect(lastBasisCheck).toMatch(/ADD CONSTRAINT "SulitAccessEvent_basis_matches_outcome" CHECK \(.*\) IS TRUE\);/);
  });
  it("every CHECK is written so that an unknown refuses", () => {
    const checks = sql.match(/ADD CONSTRAINT "\w+" CHECK \(.*\);/g) ?? [];
    expect(checks.length).toBe(4);
    for (const c of checks) expect(c).toMatch(/IS TRUE\);$/);
  });
});

describe("naming a person on an exercise is an authorised act (FR-MTD-007, Phase 3a review)", () => {
  const person = { personId: "p_actor", isAdministrator: false, system: false };
  const fault = (over: Partial<Parameters<typeof namingFault>[0]> = {}) => namingFault({ actor: person, actorNamed: false, holdsPermission: false, targets: ["p_other"], ...over });

  it("refuses someone who is not named on the exercise and holds nothing: an undecided permission refuses", () => {
    expect(fault()).toBe("NOT_NAMED");
  });
  it("lets someone already named name others", () => {
    expect(fault({ actorNamed: true })).toBeNull();
  });
  it("lets a holder of the permission name others, but never themselves", () => {
    expect(fault({ holdsPermission: true })).toBeNull();
    expect(fault({ holdsPermission: true, targets: ["p_actor"] })).toBe("SELF");
    expect(fault({ holdsPermission: true, targets: ["p_other", "p_actor"] })).toBe("SELF");
  });
  it("refuses someone who is not named from naming themselves, whatever else they hold", () => {
    expect(fault({ targets: ["p_actor"] })).toBe("SELF");
  });
  it("the slot an act gives its own actor (the proposal's reviewer) needs only being named or holding the permission", () => {
    expect(fault({ targets: ["p_actor"], selfAllowed: true })).toBe("NOT_NAMED");
    expect(fault({ targets: ["p_actor"], selfAllowed: true, holdsPermission: true })).toBeNull();
    expect(fault({ targets: ["p_actor"], selfAllowed: true, actorNamed: true })).toBeNull();
  });
  it("an administrator account names no one else, named or not; a loader run is the operator's own process", () => {
    expect(fault({ actor: { ...person, isAdministrator: true }, actorNamed: true })).toBe("ADMINISTRATOR");
    expect(fault({ actor: { ...person, isAdministrator: true }, targets: ["p_actor"], selfAllowed: true })).toBeNull();
    expect(fault({ actor: { personId: null, isAdministrator: false, system: true } })).toBeNull();
  });
  it("a person with no identity names nobody", () => {
    expect(fault({ actor: { personId: null, isAdministrator: false, system: false } })).toBe("NOT_NAMED");
  });
  it("a restricted exercise keeps someone named when its person in charge is changed or cleared", () => {
    const f = facts({ personInChargeId: "p_actor" });
    // A holder of a step or a member of a committee, worked out from the routes, is not a person the exercise keeps (ruling of 2026-10-08 on log line 1711).
    expect(namedAfterChangingPersonInCharge({ ...f, stepHolderIds: ["p_step"], committeeMemberIds: ["p_seat"] }, null)).toEqual([]);
    expect(namedAfterChangingPersonInCharge(f, null)).toEqual([]);
    expect(namedAfterChangingPersonInCharge(f, "p_other")).toEqual(["p_other"]);
    expect(namedAfterChangingPersonInCharge({ ...f, participantIds: ["p_x"] }, null)).toEqual(["p_x"]);
  });
});
