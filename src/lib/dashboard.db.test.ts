import { beforeAll, describe, expect, it } from "vitest";

import type { AwardStatus, InstrumentKind } from "@/lib/award/types";
import { caseStage, caseStageKey } from "@/lib/contract/case-stage";
import { caseVisibility } from "@/lib/contract/case-visibility";
import type { ContractStatus } from "@/lib/contract/types";
import { loadDashboard, pipelineCounts } from "@/lib/dashboard";
import { db } from "@/lib/db";
import { hiddenExerciseIds, type Reader } from "@/lib/auth/sulit-store";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

/**
 * The dashboard's pipeline counts against the scratch database (GN-03; AC-9b, AC-12, AC-18): requisitions, sourcing and contracts counted by the
 * database, a restricted exercise left out for a reader not named on it, and the contract count agreeing with the pure `caseStage` and
 * `caseVisibility` on every fixture. The test makes its own organisation, so the figures are exact rather than deltas.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
let organisationId = "";
let requisitionId = "";
let outsider = "";
let named = "";
let restrictedExerciseId = "";
const reader = (personId: string): Reader => ({ organisationId, organisationCode: "DASH_TEST", personId, isAdministrator: false, sessionId: `sess_${randomId()}`, sourceAddress: "198.51.100.9" }) as Reader;

interface Case {
  name: string;
  awardStatus: AwardStatus;
  instrument?: InstrumentKind;
  contract: ContractStatus | null;
  commencedOn?: string;
  restricted?: boolean;
}
// One exercise and one award per row. `restricted` rows sit on a restricted exercise the outsider is not named on.
const CASES: Case[] = [
  { name: "draft award", awardStatus: "DRAFT", contract: null },
  { name: "issued, preparation started", awardStatus: "ISSUED", contract: "IN_PREPARATION" },
  { name: "accepted, no contract", awardStatus: "ACCEPTED", contract: null },
  { name: "accepted, stamped", awardStatus: "ACCEPTED", contract: "STAMPED" },
  { name: "accepted, active", awardStatus: "ACCEPTED", contract: "ACTIVE" },
  { name: "indent commenced, no possession", awardStatus: "ISSUED", instrument: "WORK_INDENT", contract: null, commencedOn: "2026-10-05" },
  { name: "practically complete", awardStatus: "ACCEPTED", contract: "PRACTICALLY_COMPLETE" },
  { name: "closed", awardStatus: "ACCEPTED", contract: "CLOSED" },
  { name: "terminated", awardStatus: "ACCEPTED", contract: "TERMINATED" },
  { name: "cancelled before issue", awardStatus: "CANCELLED", contract: null },
  { name: "restricted, before issue", awardStatus: "DRAFT", contract: null, restricted: true },
  { name: "restricted, approved", awardStatus: "APPROVED", contract: null, restricted: true },
  { name: "restricted, contract exists, active", awardStatus: "ACCEPTED", contract: "ACTIVE", restricted: true },
  { name: "restricted, contract exists, awarding", awardStatus: "ISSUED", contract: "NUMBER_ALLOCATED", restricted: true },
];

beforeAll(async () => {
  organisationId = (await db.organisation.create({ data: { code: `DASH_${randomId()}`, name: "Dashboard test organisation", timeZone: "Asia/Kuala_Lumpur" } })).id;
  outsider = (await makePerson(organisationId, `Dash outsider ${randomId()}`)).id;
  named = (await makePerson(organisationId, `Dash named ${randomId()}`)).id;
  const requisition = (status: "DRAFT" | "ENDORSED" | "APPROVED" | "RETURNED" | "RECALLED" | "SOURCING" | "REJECTED" | "CLOSED") =>
    db.requisition.create({
      data: {
        organisationId, reference: `DT/REQ/${randomId()}`, requestingUnitCode: "DT_DEPT", requestingPersonId: named, title: "Dashboard test requisition", justification: "Tests.", needStatement: "None.",
        costCentreCode: "DT_CC", accountCode: "DT_AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), estimatedValue: "1000.00", raisedOn: day("2026-10-01"), status,
      },
    });
  // In the pipeline: ENDORSED, APPROVED x2, RETURNED, RECALLED. Not in it: DRAFT, SOURCING, REJECTED, CLOSED.
  for (const s of ["ENDORSED", "APPROVED", "APPROVED", "RETURNED", "RECALLED", "DRAFT", "SOURCING", "REJECTED", "CLOSED"] as const) requisitionId = (await requisition(s)).id;

  const exercise = (restricted: boolean, status: "DRAFT" | "CANCELLED" = "DRAFT") =>
    db.sourcingExercise.create({ data: { organisationId, reference: `DT/EX/${randomId()}`, requisitionId, title: "Dashboard test exercise", estimatedValue: "1000.00", sourcingMethodCode: "DT_METHOD", restricted, status } });
  const award = (exerciseId: string, over: Partial<Case> & { name: string }) =>
    db.award.create({
      data: {
        organisationId, reference: `DT/AW/${randomId()}`, exerciseId, instrumentKind: over.instrument ?? "LETTER_OF_ACCEPTANCE", awardeeName: over.name, awardedValue: "1000.00", completionPeriod: 30, completionUnit: "DAYS",
        status: over.awardStatus ?? "DRAFT", commencedOn: over.commencedOn ? day(over.commencedOn) : null,
      },
    });
  // Sourcing: two open, one cancelled, one restricted, and one whose only award is cancelled (still sourcing).
  await exercise(false);
  await exercise(false);
  await exercise(false, "CANCELLED");
  restrictedExerciseId = (await exercise(true)).id;
  await award((await exercise(false)).id, { name: "Cancelled awardee", awardStatus: "CANCELLED" });

  for (const c of CASES) {
    const a = await award((await exercise(!!c.restricted)).id, c);
    if (c.contract) await db.contract.create({ data: { organisationId, number: `DT/CON/${randomId()}`, numberSource: "SERIES", numberedOn: day("2026-10-02"), awardId: a.id, contractSum: "1000.00", status: c.contract } });
  }
  await db.exerciseParticipant.create({ data: { exerciseId: restrictedExerciseId, personId: named } });
});

describe("pipelineCounts (GN-03, AC-12)", () => {
  it("counts requisitions raised and not yet with sourcing, and splits approved from back with the requester", async () => {
    const p = await pipelineCounts(organisationId, []);
    expect(p.requisitions).toEqual({ total: 5, approvedWaiting: 2, backWithRequester: 2 });
  });

  it("counts sourcing: not cancelled, no live award, and a restricted exercise left out for a reader not named on it", async () => {
    const hiddenFromOutsider = await hiddenExerciseIds(db, reader(outsider));
    expect(hiddenFromOutsider).toContain(restrictedExerciseId);
    const open = await pipelineCounts(organisationId, hiddenFromOutsider);
    const whole = await pipelineCounts(organisationId, await hiddenExerciseIds(db, reader(named)));
    // Two open, the one whose award is cancelled, and the exercise of the case cancelled before issue: 4. Every other case has a live award, so its
    // exercise is the Contracts card's. The named reader also has the restricted exercise.
    expect(open.sourcing.total).toBe(4);
    expect(whole.sourcing.total).toBe(5);
    expect(open.sourcing.phases).toEqual([{ status: "DRAFT", count: 4 }]);
  });

  it("counts contracts by stage, and a restricted case before issue is left out of the outsider's count (AC-18)", async () => {
    const hidden = await hiddenExerciseIds(db, reader(outsider));
    const p = await pipelineCounts(organisationId, hidden);
    // Hand-written from AC-17 and AC-18. Awarding: draft; issued with preparation started; the restricted one whose contract exists (kept after issue).
    // Signing: accepted with no contract; accepted and stamped. On site: active; indent commenced; the restricted active one (kept after issue).
    expect(p.contracts).toEqual({ total: 8, awarding: 3, signing: 2, onSite: 3 });
    // Nothing hidden: the two restricted awards before issue are counted as well.
    expect((await pipelineCounts(organisationId, [])).contracts).toEqual({ total: 10, awarding: 5, signing: 2, onSite: 3 });
  });

  it.each([["outsider"], ["named"]])("the database filters agree with caseStage and caseVisibility on every fixture, for the %s", async (who) => {
    const hidden = await hiddenExerciseIds(db, reader(who === "named" ? named : outsider));
    const awards = await db.award.findMany({ where: { organisationId }, include: { contract: { select: { status: true } }, exercise: { select: { restricted: true } } } });
    const expected = { AWARDING: 0, SIGNING: 0, ON_SITE: 0 };
    for (const a of awards) {
      const vis = caseVisibility({ restricted: a.exercise.restricted, actorNamed: a.exercise.restricted && !hidden.includes(a.exerciseId), system: false, issued: !!a.contract });
      if (vis === "HIDDEN") continue;
      const key = caseStageKey(
        caseStage({
          award: { status: a.status as AwardStatus, instrumentKind: a.instrumentKind as InstrumentKind },
          contract: a.contract ? { status: a.contract.status as ContractStatus } : null,
          commencement: { commencedOn: a.commencedOn ? a.commencedOn.toISOString().slice(0, 10) : null },
        }),
      );
      if (key === "AWARDING" || key === "SIGNING" || key === "ON_SITE") expected[key]++;
    }
    const p = await pipelineCounts(organisationId, hidden);
    expect(p.contracts).toEqual({ total: expected.AWARDING + expected.SIGNING + expected.ON_SITE, awarding: expected.AWARDING, signing: expected.SIGNING, onSite: expected.ON_SITE });
  });

  it("loadDashboard carries the same counts and no longer carries the committed total, decided count or votes outstanding", async () => {
    const hidden = await hiddenExerciseIds(db, reader(outsider));
    const d = await loadDashboard(organisationId, hidden);
    expect(d!.pipeline).toEqual(await pipelineCounts(organisationId, hidden));
    for (const gone of ["committedSen", "committedWithoutAmount", "decidedCount", "votesOutstanding", "exercises"]) expect(d).not.toHaveProperty(gone);
  });
});
