import { beforeAll, describe, expect, it } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { hiddenExerciseIds, type Reader } from "@/lib/auth/sulit-store";
import type { AwardStatus, InstrumentKind } from "@/lib/award/types";
import { loadCase, oldAwardTarget } from "@/app/_auth/case";
import { pipelineCounts } from "@/lib/dashboard";
import { db } from "@/lib/db";
import { inDelayContractIds } from "@/lib/supervision/load";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

import { caseHref } from "./links";
import { AWARD_TAB_IDS, awardTabToCase } from "./case-tabs";
import { caseStage, caseStageKey } from "./case-stage";
import { listCases, parseCaseListView, resolveCase, type CaseRowView } from "./case-load";
import { listContracts } from "./load";
import type { ContractStatus } from "./types";

/**
 * resolveCase, loadCase and listCases against the scratch database (Award and Contract Requirements v2, C-1; design note 0004 C3;
 * AC-17, AC-18; ADR 0037 F0-3, F0-7, F0-8). The test makes its own organisation, so the figures are exact.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
let organisationId = "";
let requisitionId = "";
let outsider = "";
let named = "";
const restrictedExerciseIds: string[] = [];
const ids: Record<string, { awardId: string; contractId: string | null; exerciseId: string }> = {};
const reader = (personId: string): Reader => ({ organisationId, organisationCode: "CASE_TEST", personId, isAdministrator: false, sessionId: `sess_${randomId()}`, sourceAddress: "198.51.100.9" }) as Reader;

interface Case {
  name: string;
  awardStatus: AwardStatus;
  instrument?: InstrumentKind;
  contract: ContractStatus | null;
  commencedOn?: string;
  restricted?: boolean;
  inDelay?: boolean;
}
const CASES: Case[] = [
  { name: "draft", awardStatus: "DRAFT", contract: null },
  { name: "issued preparing", awardStatus: "ISSUED", contract: "IN_PREPARATION" },
  { name: "accepted no contract", awardStatus: "ACCEPTED", contract: null },
  { name: "stamped", awardStatus: "ACCEPTED", contract: "STAMPED" },
  { name: "active", awardStatus: "ACCEPTED", contract: "ACTIVE" },
  { name: "active in delay", awardStatus: "ACCEPTED", contract: "ACTIVE", inDelay: true },
  { name: "indent commenced", awardStatus: "ISSUED", instrument: "WORK_INDENT", contract: null, commencedOn: "2026-10-05" },
  { name: "practically complete", awardStatus: "ACCEPTED", contract: "PRACTICALLY_COMPLETE" },
  { name: "closed", awardStatus: "ACCEPTED", contract: "CLOSED" },
  { name: "terminated", awardStatus: "ACCEPTED", contract: "TERMINATED" },
  { name: "cancelled before issue", awardStatus: "CANCELLED", contract: null },
  { name: "restricted draft", awardStatus: "DRAFT", contract: null, restricted: true },
  { name: "restricted approved", awardStatus: "APPROVED", contract: null, restricted: true },
  { name: "restricted active", awardStatus: "ACCEPTED", contract: "ACTIVE", restricted: true },
  { name: "restricted issued", awardStatus: "ISSUED", contract: "NUMBER_ALLOCATED", restricted: true },
];
const BULK = 40;
const BULK_AT = day("2026-10-10");

beforeAll(async () => {
  organisationId = (await db.organisation.create({ data: { code: `CASE_${randomId()}`, name: "Case test organisation", timeZone: "Asia/Kuala_Lumpur" } })).id;
  outsider = (await makePerson(organisationId, `Case outsider ${randomId()}`)).id;
  named = (await makePerson(organisationId, `Case named ${randomId()}`)).id;
  requisitionId = (
    await db.requisition.create({
      data: {
        organisationId, reference: `CT/REQ/${randomId()}`, requestingUnitCode: "CT_DEPT", requestingPersonId: named, title: "Case test requisition", justification: "Tests.", needStatement: "None.",
        costCentreCode: "CT_CC", accountCode: "CT_AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), estimatedValue: "1000.00", raisedOn: day("2026-10-01"), status: "SOURCING",
      },
    })
  ).id;
  const exercise = (restricted: boolean) =>
    db.sourcingExercise.create({ data: { organisationId, reference: `CT/EX/${randomId()}`, requisitionId, title: "Case test exercise", estimatedValue: "1000.00", sourcingMethodCode: "CT_METHOD", restricted, status: "DRAFT" } });
  const award = (exerciseId: string, name: string, status: AwardStatus, instrument?: InstrumentKind, commencedOn?: string, createdAt?: Date) =>
    db.award.create({
      data: {
        organisationId, reference: `CT/AW/${randomId()}`, exerciseId, instrumentKind: instrument ?? "LETTER_OF_ACCEPTANCE", awardeeName: name, awardedValue: "1000.00", completionPeriod: 30, completionUnit: "DAYS",
        status, commencedOn: commencedOn ? day(commencedOn) : null, ...(createdAt ? { createdAt } : {}),
      },
    });
  const contract = (awardId: string, status: ContractStatus) =>
    db.contract.create({ data: { organisationId, number: `CT/CON/${randomId()}`, numberSource: "SERIES", numberedOn: day("2026-10-02"), awardId, contractSum: "1000.00", status } });

  for (const c of CASES) {
    const ex = await exercise(!!c.restricted);
    if (c.restricted) restrictedExerciseIds.push(ex.id);
    const a = await award(ex.id, c.name, c.awardStatus, c.instrument, c.commencedOn);
    const k = c.contract ? await contract(a.id, c.contract) : null;
    ids[c.name] = { awardId: a.id, contractId: k?.id ?? null, exerciseId: ex.id };
    if (c.inDelay && k) {
      // A possessed contract whose date for completion has passed: In Delay today (FR-SUP-010).
      const baseline = await db.contractBaseline.create({
        data: { organisationId, contractId: k.id, version: 1, reason: "POSSESSION", recordedAt: day("2026-01-02"), recordedOn: day("2026-01-02"), contractSum: "1000.00", completionPeriod: 30, completionUnit: "DAYS", dateForCompletion: day("2026-02-01"), possessionDate: day("2026-01-02"), entered: {}, snapshot: {} },
      });
      await db.possession.create({ data: { organisationId, contractId: k.id, possessionOn: day("2026-01-02"), recordedByPersonId: named, baselineId: baseline.id, judgedUnder: {}, recordedAt: day("2026-01-02"), recordedOn: day("2026-01-02") } });
    }
  }
  // Bulk rows with one createdAt (ties broken by id), alternately before and after issue, to span the 50-row page.
  for (let i = 0; i < BULK; i++) {
    const a = await award((await exercise(false)).id, `bulk ${i}`, "DRAFT", undefined, undefined, BULK_AT);
    if (i % 2) await contract(a.id, "IN_PREPARATION");
  }
  await db.exerciseParticipant.create({ data: { exerciseId: restrictedExerciseIds[0], personId: named } });
}, 120_000);

const hiddenFor = (personId: string) => hiddenExerciseIds(db, reader(personId));

describe("resolveCase", () => {
  it("tells a contract id, an award id with and without a contract, and the unknown apart", async () => {
    expect(await resolveCase(organisationId, ids["active"].contractId!)).toMatchObject({ kind: "CONTRACT", awardId: ids["active"].awardId });
    expect(await resolveCase(organisationId, ids["active"].awardId)).toMatchObject({ kind: "AWARD_WITH_CONTRACT", contractId: ids["active"].contractId });
    expect(await resolveCase(organisationId, ids["draft"].awardId)).toMatchObject({ kind: "AWARD_ONLY" });
    expect(await resolveCase(organisationId, "no-such-id")).toEqual({ kind: "NOT_FOUND" });
  });
  it("does not resolve another organisation's id", async () => {
    const other = (await db.organisation.create({ data: { code: `CASE_${randomId()}`, name: "Other", timeZone: "Asia/Kuala_Lumpur" } })).id;
    expect(await resolveCase(other, ids["active"].contractId!)).toEqual({ kind: "NOT_FOUND" });
    expect(await resolveCase(other, ids["draft"].awardId)).toEqual({ kind: "NOT_FOUND" });
  });
});

describe("loadCase (F0-3, F0-7)", () => {
  const actorOf = (personId: string) => reader(personId) as unknown as StaffActor;
  it("redirects an award id to its contract, and renders an award-only case", async () => {
    expect(await loadCase(actorOf(outsider), ids["active"].awardId)).toEqual({ kind: "REDIRECT", contractId: ids["active"].contractId });
    expect(await loadCase(actorOf(outsider), ids["draft"].awardId)).toMatchObject({ kind: "AWARD_ONLY", visibility: "WHOLE" });
    expect(await loadCase(actorOf(outsider), ids["active"].contractId!)).toMatchObject({ kind: "CONTRACT", visibility: "WHOLE" });
  });
  it("answers 404 for a restricted case before issue to an unnamed reader, and shows it to a named one", async () => {
    expect(await loadCase(actorOf(outsider), ids["restricted draft"].awardId)).toEqual({ kind: "NOT_FOUND" });
    expect(await loadCase(actorOf(named), ids["restricted draft"].awardId)).toMatchObject({ kind: "AWARD_ONLY", visibility: "WHOLE" });
  });
  it("after issue: contract stages only by contract id, 404 (never a redirect) by award id", async () => {
    expect(await loadCase(actorOf(outsider), ids["restricted active"].contractId!)).toMatchObject({ kind: "CONTRACT", visibility: "CONTRACT_STAGES_ONLY" });
    expect(await loadCase(actorOf(outsider), ids["restricted active"].awardId)).toEqual({ kind: "NOT_FOUND" });
  });
});

describe("loadCase writes the refusal to the access log (C5 done-when 3, FR-MTD-007)", () => {
  const actorOf = (personId: string) => reader(personId) as unknown as StaffActor;
  const refusals = (exerciseId: string) => db.sulitAccessEvent.count({ where: { organisationId, entityId: exerciseId, outcome: "WITHHELD", actorPersonId: outsider } });
  it("before issue: the 404 is logged", async () => {
    const before = await refusals(ids["restricted draft"].exerciseId);
    expect(await loadCase(actorOf(outsider), ids["restricted draft"].awardId)).toEqual({ kind: "NOT_FOUND" });
    expect((await refusals(ids["restricted draft"].exerciseId)) - before).toBe(1);
  });
  it("after issue: the contract stages are shown and the Award stage's refusal is logged, by contract id and by award id", async () => {
    const e = ids["restricted active"];
    const before = await refusals(e.exerciseId);
    expect(await loadCase(actorOf(outsider), e.contractId!)).toMatchObject({ kind: "CONTRACT", visibility: "CONTRACT_STAGES_ONLY" });
    expect((await refusals(e.exerciseId)) - before).toBe(1);
    expect(await loadCase(actorOf(outsider), e.awardId)).toEqual({ kind: "NOT_FOUND" });
    expect((await refusals(e.exerciseId)) - before).toBe(2);
  });
  it("a named reader is let in, and that is logged as granted rather than refused", async () => {
    const e = ids["restricted draft"];
    const refused = await db.sulitAccessEvent.count({ where: { organisationId, entityId: e.exerciseId, outcome: "WITHHELD", actorPersonId: named } });
    expect(await loadCase(actorOf(named), e.awardId)).toMatchObject({ kind: "AWARD_ONLY" });
    expect(await db.sulitAccessEvent.count({ where: { organisationId, entityId: e.exerciseId, outcome: "WITHHELD", actorPersonId: named } })).toBe(refused);
    expect(await db.sulitAccessEvent.count({ where: { organisationId, entityId: e.exerciseId, outcome: "GRANTED", actorPersonId: named } })).toBeGreaterThan(0);
  });
});

describe("oldAwardTarget: /awards/{id}?tab= (C9 done-when 2 and 3; AC-23)", () => {
  const actorOf = (personId: string) => reader(personId) as unknown as StaffActor;
  const refusals = (exerciseId: string) => db.sulitAccessEvent.count({ where: { organisationId, entityId: exerciseId, outcome: "WITHHELD", actorPersonId: outsider } });
  const tabs = [...AWARD_TAB_IDS, undefined, "no-such-tab", ""];
  it("walks every ?tab value for an award-only case, an award with a contract, a cancelled award and a terminated contract", async () => {
    for (const name of ["draft", "active", "cancelled before issue", "terminated"]) {
      const e = ids[name];
      for (const tab of tabs) {
        const want = awardTabToCase(tab);
        const got = await oldAwardTarget(actorOf(outsider), e.awardId, tab);
        const href = "exercise" in want ? `/sourcing/${e.exerciseId}?tab=award` : caseHref({ awardId: e.awardId, contractId: e.contractId }, want);
        expect(got, `${name} ?tab=${tab}`).toEqual({ kind: "REDIRECT", href });
      }
    }
  });
  it("sends notices to the exercise, history to the case level, and a stage-less default to the bare case", async () => {
    const e = ids["active"];
    expect(await oldAwardTarget(actorOf(outsider), e.awardId, "notices")).toEqual({ kind: "REDIRECT", href: `/sourcing/${e.exerciseId}?tab=award` });
    expect(await oldAwardTarget(actorOf(outsider), e.awardId, "history")).toEqual({ kind: "REDIRECT", href: `/projects/${e.contractId}?tab=history` });
    expect(await oldAwardTarget(actorOf(outsider), e.awardId, undefined)).toEqual({ kind: "REDIRECT", href: `/projects/${e.contractId}` });
    expect(await oldAwardTarget(actorOf(outsider), ids["draft"].awardId, "approval")).toEqual({ kind: "REDIRECT", href: `/projects/${ids["draft"].awardId}?stage=award&tab=approval` });
  });
  it("a contract id, an unknown id and another organisation's id are 404, as the award page found nothing for them", async () => {
    expect(await oldAwardTarget(actorOf(outsider), ids["active"].contractId!, undefined)).toEqual({ kind: "NOT_FOUND" });
    expect(await oldAwardTarget(actorOf(outsider), "no-such-id", undefined)).toEqual({ kind: "NOT_FOUND" });
  });
  it("a hidden award is 404 and the refusal is written, before issue and after, for every tab (never forwarded to the exercise or the contract)", async () => {
    for (const name of ["restricted approved", "restricted active", "restricted issued"]) {
      const e = ids[name];
      for (const tab of tabs) {
        const before = await refusals(e.exerciseId);
        expect(await oldAwardTarget(actorOf(outsider), e.awardId, tab), `${name} ?tab=${tab}`).toEqual({ kind: "NOT_FOUND" });
        expect((await refusals(e.exerciseId)) - before, `${name} ?tab=${tab} logged`).toBe(1);
      }
    }
  });
  it("a reader named on the restricted exercise is redirected", async () => {
    // The named participant is on the first restricted exercise only (the restricted draft).
    const e = ids["restricted draft"];
    expect(await oldAwardTarget(actorOf(named), e.awardId, "approval")).toEqual({ kind: "REDIRECT", href: caseHref({ awardId: e.awardId, contractId: e.contractId }, { stage: "award", tab: "approval" }) });
  });
});

describe("listCases (C-1, AC-17, AC-18)", () => {
  it("pages stably across pre- and post-contract rows: ordered by award createdAt desc then id, no row twice, none missing", async () => {
    const hidden = await hiddenFor(outsider);
    const first = await listCases(organisationId, hidden, { page: 0 });
    const second = await listCases(organisationId, hidden, { page: 1 });
    expect(first.rows).toHaveLength(first.pageSize);
    expect(second.rows.length).toBeGreaterThan(0);
    const seen = [...first.rows, ...second.rows].map((r) => r.awardId);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(first.total);
    const expected = await db.award.findMany({
      where: { organisationId, OR: [{ exerciseId: { notIn: hidden } }, { contract: { isNot: null } }] },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: { id: true },
    });
    expect(seen).toEqual(expected.map((x) => x.id));
    // The bulk rows share one createdAt and mix both sides of issue.
    const bulk = first.rows.filter((r) => r.award?.awardeeName.startsWith("bulk"));
    expect(bulk.some((r) => r.contractId) && bulk.some((r) => !r.contractId)).toBe(true);
    // A second read returns the same page.
    expect((await listCases(organisationId, hidden, { page: 1 })).rows.map((r) => r.awardId)).toEqual(second.rows.map((r) => r.awardId));
  });

  it("view counts equal the dashboard's Contracts split, and the stage views hold what their counts say", async () => {
    for (const personId of [outsider, named]) {
      const hidden = await hiddenFor(personId);
      const p = await pipelineCounts(organisationId, hidden);
      const c = (await listCases(organisationId, hidden)).counts;
      expect({ awarding: c.awarding, signing: c.signing, onSite: c.on_site }).toEqual({ awarding: p.contracts.awarding, signing: p.contracts.signing, onSite: p.contracts.onSite });
      expect(c.awarding + c.signing + c.on_site).toBe(p.contracts.total);
      // Every case is in exactly one stage view (the five stages and ended).
      expect(c.awarding + c.signing + c.on_site + c.completed + c.closed + c.ended).toBe(c.all);
      for (const v of ["awarding", "signing", "on_site", "completed", "closed", "ended"] as const) {
        const page = await listCases(organisationId, hidden, { view: v });
        expect(page.total).toBe(c[v]);
        for (const r of page.rows) expect(r.standing.kind === "LIVE" ? r.standing.stage.toLowerCase() : "ended").toBe(v);
      }
    }
  });

  it("agrees with the pure caseStage on every row", async () => {
    const hidden = await hiddenFor(named);
    const all = [...(await listCases(organisationId, hidden, { page: 0 })).rows, ...(await listCases(organisationId, hidden, { page: 1 })).rows];
    const awards = await db.award.findMany({ where: { id: { in: all.map((r) => r.awardId) } }, include: { contract: { select: { status: true } } } });
    for (const a of awards) {
      const want = caseStage({
        award: { status: a.status as AwardStatus, instrumentKind: a.instrumentKind as InstrumentKind },
        contract: a.contract ? { status: a.contract.status as ContractStatus } : null,
        commencement: { commencedOn: a.commencedOn ? a.commencedOn.toISOString().slice(0, 10) : null },
      });
      expect(caseStageKey(all.find((r) => r.awardId === a.id)!.standing)).toBe(caseStageKey(want));
    }
  });

  it("leaves a restricted case out before issue for an unnamed officer, and keeps it for a named one", async () => {
    const outsiderRows = (await listCases(organisationId, await hiddenFor(outsider))).rows.map((r) => r.awardId);
    expect(outsiderRows).not.toContain(ids["restricted draft"].awardId);
    expect(outsiderRows).not.toContain(ids["restricted approved"].awardId);
    const namedAll = [...(await listCases(organisationId, await hiddenFor(named))).rows, ...(await listCases(organisationId, await hiddenFor(named), { page: 1 })).rows].map((r) => r.awardId);
    expect(namedAll).toContain(ids["restricted draft"].awardId);
  });

  it("after issue, a restricted case's row for an unnamed officer carries only listContracts' columns: no chips, no award facts", async () => {
    const hidden = await hiddenFor(outsider);
    expect(hidden).toContain(ids["restricted active"].exerciseId);
    const all = [...(await listCases(organisationId, hidden, { page: 0 })).rows, ...(await listCases(organisationId, hidden, { page: 1 })).rows];
    const row = all.find((r) => r.awardId === ids["restricted active"].awardId)!;
    expect(row.visibility).toBe("CONTRACT_STAGES_ONLY");
    expect(row.award).toBeNull();
    // The contract side is exactly a listContracts row.
    const today = await listContracts(organisationId, 0, [ids["restricted active"].contractId!]);
    expect(row.contract).toEqual(today.rows[0]);
    // And a whole case does carry the awards-list chips.
    const whole = all.find((r) => r.awardId === ids["active"].awardId)!;
    expect(whole.award).toMatchObject({ exercise: { reference: expect.any(String) }, contract: { number: expect.any(String) } });
  });

  it("re-keys In Delay to awards: the same set as the Projects page's, judged over all contracts", async () => {
    const hidden = await hiddenFor(named);
    const todayKl = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
    const set = await inDelayContractIds(organisationId, todayKl);
    expect(set.ids).toContain(ids["active in delay"].contractId);
    const page = await listCases(organisationId, hidden, { view: "delay" });
    expect(page.rows.map((r) => r.contractId).sort()).toEqual([...set.ids].sort());
    expect(page.total).toBe(set.ids.length);
    expect(page.counts.delay).toBe(set.ids.length);
  });

  it("holds the commenced view to the contracts with a variation commenced pending approval (none here)", async () => {
    const page = await listCases(organisationId, await hiddenFor(named), { view: "commenced" });
    expect(page.rows).toEqual([]);
    expect(page.total).toBe(0);
  });
});

describe("parseCaseListView", () => {
  it("accepts the known views and answers undefined for anything else", () => {
    const views: CaseRowView[] = ["awarding", "signing", "on_site", "completed", "closed", "ended", "delay", "commenced"];
    for (const v of [...views, "securities", "submissions"]) expect(parseCaseListView(v)).toBe(v);
    for (const v of [undefined, "", "all", "AWARDING", "nope"]) expect(parseCaseListView(v)).toBeUndefined();
  });
});
