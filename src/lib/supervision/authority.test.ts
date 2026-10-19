import { describe, expect, it } from "vitest";

import { capacityFor, hiddenActsFor, hiddenFor, hiddenNeedsFor, inForce, recorderFault, recorderFaultOver, type ActNeed, type DelegationFacts } from "./authority";
import { SUPERVISION_ACTS } from "./types";
import { delegationFaults, delegationState, latestActDay, revokeFaults } from "./delegation";
import { supervisionFaultWords } from "./labels";

/**
 * FR-SUP-002–004. The S.O. (Head of Division) is held by Aminah; Ravi is her Principal Representative from the
 * day his letter was issued, scoped to the diary and progress; Siti is a Specialist Representative whose letter
 * is not yet issued. A delegate as grantor is refused (no sub-delegation); an act outside the scope is refused.
 */

const so = { roleLabel: "Head of Division", holderIds: ["aminah"], actingIds: ["acting"] };
const ravi: DelegationFacts = { id: "d1", kind: "PRINCIPAL", delegatePersonId: "ravi", letterIssuedOn: "2026-10-02", revokedOn: null, scope: ["DIARY", "PROGRESS"] };
const siti: DelegationFacts = { id: "d2", kind: "SPECIALIST", delegatePersonId: "siti", letterIssuedOn: null, revokedOn: null, scope: ["VALUATION"] };
const ds = [ravi, siti];
const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

describe("who may be recorded for an act", () => {
  it("the S.O., or someone acting in the office, for anything", () => {
    expect(capacityFor("aminah", { soOnly: true }, so, ds, "2026-10-03").capacity).toEqual({ as: "SO" });
    expect(capacityFor("acting", { act: "OBSERVATION" }, so, ds, "2026-10-03").capacity).toEqual({ as: "SO" });
  });
  it("a representative in force, for an act in scope", () => {
    expect(capacityFor("ravi", { act: "DIARY" }, so, ds, "2026-10-03").capacity).toEqual({ as: "DELEGATE", delegationId: "d1", kind: "PRINCIPAL" });
    expect(codes(capacityFor("ravi", { act: "OBSERVATION" }, so, ds, "2026-10-03").faults)).toEqual(["NOT_IN_SCOPE"]);
  });
  it("not before the letter is issued, nor from the day it is revoked", () => {
    expect(codes(capacityFor("ravi", { act: "DIARY" }, so, ds, "2026-10-01").faults)).toEqual(["NOT_AUTHORISED"]);
    expect(codes(capacityFor("siti", { act: "VALUATION" }, so, ds, "2026-10-03").faults)).toEqual(["NOT_AUTHORISED"]);
    expect(inForce({ ...ravi, revokedOn: "2026-10-05" }, "2026-10-04")).toBe(true);
    expect(inForce({ ...ravi, revokedOn: "2026-10-05" }, "2026-10-05")).toBe(false);
  });
  it("the S.O.'s own acts, and the Principal Representative's", () => {
    expect(codes(capacityFor("ravi", { soOnly: true }, so, ds, "2026-10-03").faults)).toEqual(["NOT_SO"]);
    expect(capacityFor("ravi", { principalOrSo: true }, so, ds, "2026-10-03").capacity).toMatchObject({ as: "DELEGATE", kind: "PRINCIPAL" });
    expect(codes(capacityFor("someone", { principalOrSo: true }, so, ds, "2026-10-03").faults)).toEqual(["NOT_PRINCIPAL"]);
  });
  it("nobody, with no S.O. resolved", () => {
    expect(codes(capacityFor("aminah", { act: "DIARY" }, null, ds, "2026-10-03").faults)).toEqual(["NO_SO"]);
  });
  it("outside the scope says so in words", () => {
    expect(supervisionFaultWords(capacityFor("ravi", { act: "OBSERVATION" }, so, ds, "2026-10-03").faults[0]).en).toMatch(/"Record compliance observations" is outside their delegation's scope/);
  });
});

describe("making a delegation", () => {
  const ctx = { so, delegations: ds, today: "2026-10-03", variant: "CONVENTIONAL" as const, typeName: "Works", forms: { letter: "t1", notice: "t2" } };
  const ok = { kind: "SPECIALIST" as const, grantorId: "aminah", recorderId: null as string | null, delegate: { id: "lee", isActive: true }, competencyConfirmed: true, competencyNote: "Ten years on water mains.", scope: ["OBSERVATION" as const] };
  it("by the S.O., with the competency confirmation and a scope", () => {
    expect(delegationFaults(ok, ctx)).toEqual([]);
  });
  it("a delegate as grantor is refused: no sub-delegation", () => {
    expect(codes(delegationFaults({ ...ok, grantorId: "ravi" }, ctx))).toEqual(["SUB_DELEGATION"]);
  });
  it("nobody else delegates; not to oneself; not twice; not without the confirmation or a scope", () => {
    expect(codes(delegationFaults({ ...ok, grantorId: "x" }, ctx))).toEqual(["GRANTOR_NOT_SO"]);
    expect(codes(delegationFaults({ ...ok, delegate: { id: "aminah", isActive: true } }, ctx))).toEqual(["DELEGATE_IS_GRANTOR"]);
    expect(codes(delegationFaults({ ...ok, delegate: { id: "ravi", isActive: true } }, ctx))).toEqual(["ALREADY_DELEGATED"]);
    expect(codes(delegationFaults({ ...ok, competencyConfirmed: false }, ctx))).toEqual(["COMPETENCY_NOT_CONFIRMED"]);
    expect(codes(delegationFaults({ ...ok, competencyNote: "" }, ctx))).toEqual(["COMPETENCY_NOT_CONFIRMED"]);
    expect(codes(delegationFaults({ ...ok, scope: [] }, ctx))).toEqual(["SCOPE_EMPTY"]);
  });
  it("the officer who keys the S.O.'s delegation from their letter is never its delegate (review of Phase 2b)", () => {
    // X is a staff officer with no authority: they record "the S.O. delegates to X". The S.O.'s powers would be granted by one person and received by the same.
    expect(codes(delegationFaults({ ...ok, recorderId: "lee" }, ctx))).toEqual(["RECORDER_IS_DELEGATE"]);
    expect(supervisionFaultWords({ code: "RECORDER_IS_DELEGATE", level: "block" }).en).toMatch(/delegate to yourself/); // shortened by note 0005, founder 2026-10-19
    // Another officer keying it for the S.O. is as before; so is the S.O. delegating in their own session.
    expect(delegationFaults({ ...ok, recorderId: "clerk" }, ctx)).toEqual([]);
    expect(delegationFaults({ ...ok, recorderId: null }, ctx)).toEqual([]);
  });
  it("the letter pair: the type's variant and its forms, each unset blocking and naming the setting", () => {
    expect(codes(delegationFaults(ok, { ...ctx, variant: null }))).toEqual(["VARIANT_NOT_SET"]);
    expect(supervisionFaultWords(delegationFaults(ok, { ...ctx, variant: null })[0]).en).toMatch(/Set its delegation letter variant under Configuration › Reference data\.$/);
    expect(codes(delegationFaults(ok, { ...ctx, forms: { letter: "t1", notice: null } }))).toEqual(["FORMS_NOT_SET"]);
    expect(supervisionFaultWords(delegationFaults(ok, { ...ctx, forms: { letter: null, notice: null } })[0]).en).toMatch(/Set them under Configuration › Post-award\.$/);
  });
  it("revoking: once, with the reason, not in the future, not before it was made", () => {
    const r = { revokedOn: null, recordedOn: "2026-10-01", on: "2026-10-03", today: "2026-10-03", reason: "Transferred." };
    expect(revokeFaults(r)).toEqual([]);
    expect(codes(revokeFaults({ ...r, revokedOn: "2026-10-02", reason: "", on: "2026-09-30" }))).toEqual(["ALREADY_REVOKED", "REASON_REQUIRED", "BEFORE_RECORDED"]);
  });
  it("review 6: never on or before the representative's latest recorded act or signature", () => {
    const r = { revokedOn: null, recordedOn: "2026-10-01", on: "2026-10-03", today: "2026-10-05", reason: "Transferred." };
    expect(codes(revokeFaults({ ...r, latestAct: "2026-10-03" }))).toEqual(["BEFORE_LATEST_ACT"]);
    expect(revokeFaults({ ...r, latestAct: "2026-10-03" })[0].data).toEqual({ day: "2026-10-03" });
    expect(codes(revokeFaults({ ...r, latestAct: "2026-10-04" }))).toEqual(["BEFORE_LATEST_ACT"]);
    expect(revokeFaults({ ...r, latestAct: "2026-10-02" })).toEqual([]);
    expect(revokeFaults({ ...r, latestAct: null })).toEqual([]);
    expect(supervisionFaultWords(revokeFaults({ ...r, latestAct: "2026-10-03" })[0]).en).toMatch(/revoked from the day after/);
  });
  it("the latest day a person was recorded for anything", () => {
    const acts = [{ personId: "a", day: "2026-10-02" }, { personId: "a", day: "2026-10-04" }, { personId: "b", day: "2026-10-09" }, { personId: "a", day: null }, { personId: null, day: "2026-10-10" }];
    expect(latestActDay(acts, "a")).toBe("2026-10-04");
    expect(latestActDay(acts, "c")).toBeNull();
  });
  it("its state reads from its letter and its revocation", () => {
    expect(delegationState({ letterStatus: "DRAFT", revokedOn: null }, "2026-10-03")).toBe("LETTER_NOT_ISSUED");
    expect(delegationState({ letterStatus: "ISSUED", revokedOn: null }, "2026-10-03")).toBe("IN_FORCE");
    expect(delegationState({ letterStatus: "ISSUED", revokedOn: "2026-10-03" }, "2026-10-03")).toBe("REVOKED");
    expect(delegationState({ letterStatus: "VOID", revokedOn: null }, "2026-10-03")).toBe("LETTER_VOID");
  });
});

// FR-SUP-002–004 (Phase 3d): acts outside a representative's delegated scope are hidden from them, mapped from the session's person.
describe("what a representative is shown", () => {
  const ALL = SUPERVISION_ACTS;
  const hidden = (who: string, day: string, delegations: readonly DelegationFacts[] = ds) => hiddenActsFor(who, so, delegations, day, ALL);

  it("hides from a representative in force every act their letter does not list, and shows what it lists", () => {
    const h = hidden("ravi", "2026-10-03");
    expect(h).not.toContain("DIARY");
    expect(h).not.toContain("PROGRESS");
    expect(h).toEqual(ALL.filter((a) => a !== "DIARY" && a !== "PROGRESS"));
    // The act it hides is the act the action refuses, for every act.
    for (const a of ALL) expect(h.includes(a), a).toBe(capacityFor("ravi", { act: a }, so, ds, "2026-10-03").capacity == null);
  });

  it("hides nothing from the S.O., nor from someone acting in the office", () => {
    expect(hidden("aminah", "2026-10-03")).toEqual([]);
    expect(hidden("acting", "2026-10-03")).toEqual([]);
  });

  it("hides nothing from an officer who is no representative: a clerk entering the S.O.'s paper keeps the screen, and the action's refusal stays theirs", () => {
    expect(hidden("clerk", "2026-10-03")).toEqual([]);
  });

  it("hides nothing before the letter is issued or after it is revoked, when the person is no representative in force", () => {
    expect(hidden("ravi", "2026-10-01")).toEqual([]);
    expect(hidden("siti", "2026-10-03")).toEqual([]);
    expect(hidden("ravi", "2026-10-09", [{ ...ravi, revokedOn: "2026-10-05" }])).toEqual([]);
    expect(hidden("ravi", "2026-10-04", [{ ...ravi, revokedOn: "2026-10-05" }])).not.toEqual([]);
  });

  it("gives a representative holding two delegations the union of their scopes", () => {
    const second: DelegationFacts = { id: "d3", kind: "SPECIALIST", delegatePersonId: "ravi", letterIssuedOn: "2026-10-02", revokedOn: null, scope: ["VALUATION"] };
    const h = hidden("ravi", "2026-10-03", [ravi, second]);
    expect(h).not.toContain("VALUATION");
    expect(h).not.toContain("DIARY");
    expect(h).toContain("OBSERVATION");
  });

  it("hides nothing where the contract has no S.O. resolved: there is nothing to be a representative of", () => {
    expect(hiddenActsFor("ravi", null, ds, "2026-10-03", ALL)).toEqual([]);
  });
});

// FR-SUP-004 (Phase 3d, review): hiding is not enough. A representative could sign in, name the S.O. as the Person an act is recorded for from paper, and `capacityFor` would judge
// the S.O., who passes: the delegate's scope never asked. The officer who records is judged too.
describe("the officer who records is judged beside the Person it is recorded for", () => {
  const rf = (who: string | null, need: Parameters<typeof recorderFault>[1], day = "2026-10-03", delegations: readonly DelegationFacts[] = ds) => recorderFault(who, need, so, delegations, day);

  it("refuses a representative recording an act outside their scope, even for the S.O. (who would pass)", () => {
    // Ravi's letter lists the diary and progress. Recorded for Aminah (the S.O.), the Person passes, so only the recorder can refuse it.
    expect(capacityFor("aminah", { act: "OBSERVATION" }, so, ds, "2026-10-03").capacity).toEqual({ as: "SO" });
    expect(rf("ravi", { act: "OBSERVATION" })?.code).toBe("RECORDER_OUT_OF_SCOPE");
    expect(rf("ravi", { act: "CONTRACTOR_COMMUNICATION" })?.data).toMatchObject({ kind: "ACT", act: "CONTRACTOR_COMMUNICATION" });
    expect(rf("ravi", { act: "INSTRUCTION" })?.code).toBe("RECORDER_OUT_OF_SCOPE");
  });

  it("allows a representative to record what their own letter lists", () => {
    expect(rf("ravi", { act: "DIARY" })).toBeNull();
    expect(rf("ravi", { act: "PROGRESS" })).toBeNull();
  });

  it("refuses a representative recording the S.O.'s own act for them, and a Specialist the Principal Representative's", () => {
    expect(rf("ravi", { soOnly: true })?.data).toMatchObject({ kind: "SO" });
    // Ravi is a Principal Representative: the programme's approval is his (or the S.O.'s). A Specialist's is not.
    expect(rf("ravi", { principalOrSo: true })).toBeNull();
    const specialist: DelegationFacts = { id: "d9", kind: "SPECIALIST", delegatePersonId: "sam", letterIssuedOn: "2026-10-02", revokedOn: null, scope: ["VALUATION"] };
    expect(rf("sam", { principalOrSo: true }, "2026-10-03", [specialist])?.data).toMatchObject({ kind: "PRINCIPAL" });
  });

  it("does not judge the S.O., someone acting in the office, an officer who is no representative, or nobody", () => {
    expect(rf("aminah", { act: "OBSERVATION" })).toBeNull();
    expect(rf("acting", { soOnly: true })).toBeNull();
    expect(rf("clerk", { act: "OBSERVATION" })).toBeNull();
    expect(rf("clerk", { soOnly: true })).toBeNull();
    expect(rf(null, { act: "OBSERVATION" })).toBeNull();
  });

  it("does not judge a person whose letter is not issued yet, or is revoked: they are no representative in force", () => {
    expect(rf("ravi", { act: "OBSERVATION" }, "2026-10-01")).toBeNull();
    expect(rf("ravi", { act: "OBSERVATION" }, "2026-10-09", [{ ...ravi, revokedOn: "2026-10-05" }])).toBeNull();
  });

  it("judges nothing where the contract has no S.O. resolved: there is nothing to be a representative of", () => {
    expect(recorderFault("ravi", { act: "OBSERVATION" }, null, ds, "2026-10-03")).toBeNull();
  });

  it("agrees with what hiddenActsFor leaves off the screen: the acts hidden from a representative are the acts they cannot record for anyone", () => {
    const hidden = hiddenActsFor("ravi", so, ds, "2026-10-03", SUPERVISION_ACTS);
    for (const a of SUPERVISION_ACTS) expect(rf("ravi", { act: a }) != null, a).toBe(hidden.includes(a));
  });
});

// FR-SUP-004 (Phase 3d, review fix): the recorder is judged on the act's own day, which the form chooses, so back-dating an act to before the letter was issued made them "no representative"
// on that day. They are judged on the day it is recorded too.
describe("a representative cannot back-date an act to before their letter (the recorder is judged on the day it is recorded)", () => {
  const TODAY = "2026-10-08";
  const BEFORE_LETTER = "2026-09-30";
  const both = (day: string) => [{ so, day }, { so, day: TODAY }];
  const over = (who: string | null, need: ActNeed, actDay: string, delegations: readonly DelegationFacts[] = ds) => recorderFaultOver(who, need, both(actDay), delegations);

  it("judged on the act's day alone, the back-dated act of a representative passes (the hole)", () => {
    // Ravi's letter was issued on 2026-10-02 and lists the diary and progress. On 09-30 he was no representative, so the day alone clears him.
    expect(recorderFault("ravi", { act: "OBSERVATION" }, so, ds, BEFORE_LETTER)).toBeNull();
  });

  it("refuses it when the day it is recorded is also judged, with a date before the letter was issued", () => {
    expect(over("ravi", { act: "OBSERVATION" }, BEFORE_LETTER)?.code).toBe("RECORDER_OUT_OF_SCOPE");
    expect(over("ravi", { act: "CONTRACTOR_COMMUNICATION" }, BEFORE_LETTER)?.code).toBe("RECORDER_OUT_OF_SCOPE");
    expect(over("ravi", { soOnly: true }, BEFORE_LETTER)?.data).toMatchObject({ kind: "SO" });
  });

  it("still allows what the letter lists, back-dated or not", () => {
    expect(over("ravi", { act: "DIARY" }, BEFORE_LETTER)).toBeNull();
    expect(over("ravi", { act: "PROGRESS" }, TODAY)).toBeNull();
    expect(over("ravi", { principalOrSo: true }, BEFORE_LETTER)).toBeNull();
  });

  it("does not judge who is no representative on either day, or the S.O., or nobody", () => {
    expect(over("clerk", { act: "OBSERVATION" }, BEFORE_LETTER)).toBeNull();
    expect(over("aminah", { soOnly: true }, BEFORE_LETTER)).toBeNull();
    expect(over("acting", { act: "OBSERVATION" }, BEFORE_LETTER)).toBeNull();
    expect(over(null, { act: "OBSERVATION" }, BEFORE_LETTER)).toBeNull();
    // A letter not yet issued today is no representative today either.
    expect(over("siti", { act: "OBSERVATION" }, BEFORE_LETTER)).toBeNull();
  });

  it("judges a representative whose letter was in force on the act's day and is revoked today on the act's day", () => {
    const revoked = [{ ...ravi, revokedOn: "2026-10-05" }];
    expect(over("ravi", { act: "OBSERVATION" }, "2026-10-03", revoked)?.code).toBe("RECORDER_OUT_OF_SCOPE");
    expect(over("ravi", { act: "DIARY" }, "2026-10-03", revoked)).toBeNull();
  });

  it("uses the S.O. office of each day: someone who held it on the act's day is not judged on that day", () => {
    const earlier = { roleLabel: "Head of Division", holderIds: ["ravi"], actingIds: [] };
    expect(recorderFaultOver("ravi", { act: "OBSERVATION" }, [{ so: earlier, day: "2026-10-03" }, { so, day: TODAY }], ds)?.code).toBe("RECORDER_OUT_OF_SCOPE");
    expect(recorderFaultOver("ravi", { act: "OBSERVATION" }, [{ so: earlier, day: "2026-10-03" }], ds)).toBeNull();
  });

  it("judges the same day once and nothing where the contract has no S.O. resolved", () => {
    expect(recorderFaultOver("ravi", { act: "DIARY" }, [{ so, day: TODAY }, { so, day: TODAY }], ds)).toBeNull();
    expect(recorderFaultOver("ravi", { act: "OBSERVATION" }, [{ so: null, day: TODAY }], ds)).toBeNull();
    expect(recorderFaultOver("ravi", { act: "OBSERVATION" }, [], ds)).toBeNull();
  });
});

// FR-SUP-004 (Phase 3d, review fix): the S.O.'s own acts, and the acts of the Principal Representative or the S.O., are on no letter's scope list, so `hiddenActsFor` never left them off,
// and a representative was offered what the server refuses whatever their letter says.
describe("the acts no letter of delegation can give are hidden from a representative too", () => {
  const sam: DelegationFacts = { id: "d9", kind: "SPECIALIST", delegatePersonId: "sam", letterIssuedOn: "2026-10-02", revokedOn: null, scope: ["VALUATION"] };
  const all = [ravi, siti, sam];
  const day = "2026-10-03";
  const needs = (who: string, on = day, delegations: readonly DelegationFacts[] = all) => hiddenNeedsFor(who, so, delegations, on);

  it("hides the S.O.'s own acts from every representative, and the Principal Representative's acts from one who is not a Principal Representative", () => {
    expect(needs("ravi")).toEqual(["SO_ONLY"]);
    expect(needs("sam")).toEqual(["SO_ONLY", "PRINCIPAL_OR_SO"]);
  });

  it("hides nothing from the S.O., someone acting in the office, or an officer who is no representative", () => {
    expect(needs("aminah")).toEqual([]);
    expect(needs("acting")).toEqual([]);
    expect(needs("clerk")).toEqual([]);
  });

  it("hides nothing before the letter is issued, after it is revoked, or where no S.O. is resolved", () => {
    expect(needs("ravi", "2026-10-01")).toEqual([]);
    expect(needs("ravi", "2026-10-09", [{ ...ravi, revokedOn: "2026-10-05" }])).toEqual([]);
    expect(hiddenNeedsFor("ravi", null, all, day)).toEqual([]);
  });

  it("a representative holding a Principal Representative's letter among others is not hidden the Principal's acts", () => {
    const second: DelegationFacts = { ...sam, id: "d10", delegatePersonId: "ravi" };
    expect(needs("ravi", day, [second, ravi])).toEqual(["SO_ONLY"]);
    expect(needs("ravi", day, [second])).toEqual(["SO_ONLY", "PRINCIPAL_OR_SO"]);
  });

  it("hides exactly what the action refuses: for every need, every person and every day, hidden and refused are the same set", () => {
    const people = ["aminah", "acting", "clerk", "ravi", "siti", "sam", "nobody"];
    for (const who of people) {
      for (const on of ["2026-10-01", "2026-10-03", "2026-10-09"]) {
        const h = hiddenFor(who, so, all, on, SUPERVISION_ACTS);
        const live = all.some((d) => d.delegatePersonId === who && inForce(d, on));
        const representative = live && who !== "aminah" && who !== "acting";
        const needsOf: [ActNeed, string | null][] = [
          [{ soOnly: true }, "SO_ONLY"],
          [{ principalOrSo: true }, "PRINCIPAL_OR_SO"],
          ...SUPERVISION_ACTS.map((a): [ActNeed, string | null] => [{ act: a }, a]),
        ];
        for (const [need, key] of needsOf) {
          const refused = capacityFor(who, need, so, all, on).capacity == null;
          // For a person who is a representative in force, the screen leaves off exactly what the server refuses them. For anyone else nothing is hidden: their refusal is the action's.
          expect(h.includes(key as never), `${who} on ${on}: ${key}`).toBe(representative && refused);
          // And the recorder is refused exactly that too, for any Person it is recorded for.
          expect(recorderFault(who, need, so, all, on) != null, `${who} on ${on}: recorder ${key}`).toBe(representative && refused);
        }
      }
    }
  });
});
