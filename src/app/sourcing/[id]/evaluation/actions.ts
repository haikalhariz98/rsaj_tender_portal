"use server";

import type { FormState } from "@/components/record-editor";
import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { namingRefusal } from "@/lib/auth/sulit-store";
import { storedDay } from "@/lib/dates";
import { aspectFields, communicationFields, correctionFields, EVALUATION_ENTITY, inputFields, scoreFields, startFields, teamFields } from "@/lib/evaluation/audit-view";
import { assessFaults } from "@/lib/evaluation/aspects";
import { ceilingExclusion } from "@/lib/evaluation/ceiling";
import { cprEntryFaults } from "@/lib/evaluation/cpr";
import { evaluatedPrice, scoreKey } from "@/lib/evaluation/facts";
import { fixedToDecimalString, isFixed, parseFixed } from "@/lib/evaluation/fixed";
import { stageOf } from "@/lib/evaluation/model";
import { ceilingOf } from "@/lib/evaluation/repo";
import { shortlistFaults } from "@/lib/evaluation/shortlist";
import { inputStageFaults, inputStages, inRunningAt, isSubmitted, resultRows, runningFaults, scoreFaults, submitStage as submitStageRule } from "@/lib/evaluation/stages";
import { startFaults } from "@/lib/evaluation/start";
import { openActFaults } from "@/lib/evaluation/state";
import { personFaults, teamFaults, type TeamPick } from "@/lib/evaluation/team";
import { COMMUNICATION_CHANNELS, COMMUNICATION_DIRECTIONS, TEAM_SIDES, ASPECT_VERDICTS, type Finding, type Side } from "@/lib/evaluation/types";
import { exclusionReason } from "@/lib/evaluation/versions";
import { moveExercise } from "@/lib/method/move";
import { parseSen, senToDecimalString } from "@/lib/money";
import { FormReader } from "@/lib/validate";

import { activePerson, audit, exerciseIdOf } from "../window/shared";
import { evLabel, GONE_BIDDER, inEvaluation, notes, picks, refuse, signedMoney, stampNow, bidderIdFrom } from "./shared";
import { toAuditActor, staffForAct } from "@/app/_auth/actor";
import { beginAct } from "@/app/_auth/act";
import { priceRead } from "@/lib/opening/price";

/**
 * Writes for 6.8's evaluation (plan §4, as ruled E-1..E-13): starting it, the team, scores, the
 * inputs the computations read, a price's arithmetic correction, a stage's submission, the
 * shortlist, the aspects and the written communications. Meetings and the negotiation's route are in
 * `meeting-actions.ts`; the recommendation, the report and the Kertas Cadangan in `report-actions.ts`.
 * Each runs in one transaction under the locks of `inEvaluation` and re-runs its pure rule on the
 * locked rows; every write is audited in it, SULIT figures under their registered keys.
 */

// Every act below is the signed-in officer's own (Phase 2b, FR-EVL-001: each evaluator acts under their own identity): `beginAct` reads who, and the
// action writes the attribution in the act's own transaction.

// ------------------------------------------------------------------ starting (plan §4.2)

/**
 * Start the evaluation (FR-EVL-001, 006, 019; E-1, E-5): 6.7's carried offers become its bidders, a
 * quotation's bids above the exercise's own ceiling excluded with the reason; the team appointed on
 * both sides; the score places frozen; the exercise Under evaluation.
 */
export async function startEvaluation(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const appointed = r.date("appointedOn", "Appointed on", { required: true });
  if (r.failed || !appointed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "Evaluation.startedBy", { personField: "startedByPersonId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  const sides: Record<string, Side> = { implementing: "IMPLEMENTING_DEPARTMENT", procurement: "CONTRACT_PROCUREMENT" };
  const picked = Object.entries(sides).flatMap(([field, side]) => picks(data, field).map((personId) => ({ personId, side })));
  return inEvaluation(actor, exerciseIdOf(data), async (tx, l, c) => {
    const person = await activePerson(tx, l.org.id, personId);
    const ceiling = ceilingOf(l.ex);
    const boundaryMissing = ceiling.regime === "quotation" && (ceiling.boundary == null || ceiling.operator == null);
    const sf = startFaults({ status: l.ex.status, throughWindow: c.throughWindow, pinned: c.model != null, openings: c.openingGate, decimals: c.policy?.scoreDecimals ?? null, boundaryMissing, carried: c.carried.length, started: c.evaluations.length > 0, timeZone: l.org.timeZone, personActive: !!person });
    const day = storedDay(appointed);
    const dayFaults: Finding[] = l.org.today && day > l.org.today ? [{ code: "DAY_IN_FUTURE", level: "block" }] : [];
    const people = await tx.person.findMany({ where: { organisationId: l.org.id, id: { in: picked.map((p) => p.personId) } }, select: { id: true, name: true, isActive: true, orgUnitCode: true } });
    const teamPicks: TeamPick[] = picked.map((p) => {
      const x = people.find((q) => q.id === p.personId);
      return { personId: p.personId, name: x?.name ?? "A person not on record", side: p.side, active: x?.isActive ?? false, unitCode: x?.orgUnitCode ?? null };
    });
    const tf = teamFaults(teamPicks, l.req.requestingUnitCode, c.unitPath);
    const all = [...sf, ...dayFaults, ...tf];
    if (all.some((f) => f.level === "block")) return refuse(all, "Not started:");
    // The team is named on the exercise: appointing it opens the exercise's figures to each member, so the one who appoints is named on it or holds the permission, and
    // never puts themselves on it (`namingRefusal`, Phase 3a review).
    const notNamed = await namingRefusal(tx, actor, l.ex.id, teamPicks.map((p) => p.personId));
    if (notNamed) return { ok: false, message: `Not started. ${notNamed}` };
    const decimals = c.policy!.scoreDecimals!;
    const ev = await tx.evaluation.create({
      data: {
        organisationId: l.org.id,
        exerciseId: l.ex.id,
        version: 1,
        state: "OPEN",
        trigger: "START",
        startedAt: now,
        startedByPersonId: person!.id,
        // E-5: the places a score is shown and judged at, frozen now and read from here, never live.
        policySnapshot: { scoreDecimals: decimals, scoreDecimalsProvenance: c.policy!.scoreDecimalsProvenance ?? null, anonymisedScoring: c.policy!.anonymisedScoring ?? null } as Prisma.InputJsonValue,
      },
    });
    for (const p of teamPicks) {
      const m = await tx.evaluationTeamMember.create({ data: { organisationId: l.org.id, evaluationId: ev.id, personId: p.personId, side: p.side, orgUnitCodeSnapshot: p.unitCode, appointedOn: appointed, recordedAt: now } });
      await audit(tx, toAuditActor(actor), l.org.id, EVALUATION_ENTITY.team, m.id, evLabel(l, 1, "Team"), "CREATE", diffFields(null, teamFields({ name: p.name, side: p.side, unit: p.unitCode, on: day })));
    }
    let excluded = 0;
    for (const b of c.carried) {
      const j = ceilingExclusion(parseSen(priceRead(b).toString()), ceiling);
      const reason = exclusionReason(j);
      if (reason) excluded++;
      const row = await tx.evaluationBidder.create({ data: { organisationId: l.org.id, evaluationId: ev.id, openedBidId: b.id, excludedReason: reason, ceilingSnapshot: { regime: ceiling.regime, boundary: ceiling.boundary != null ? senToDecimalString(ceiling.boundary) : null, operator: ceiling.operator } } });
      if (reason) await audit(tx, toAuditActor(actor), l.org.id, EVALUATION_ENTITY.bidder, row.id, evLabel(l, 1, `Bid No. ${b.listingNo}`), "CREATE", diffFields(null, { bid: `No. ${b.listingNo}`, excluded: reason }));
    }
    await audit(tx, toAuditActor(actor), l.org.id, EVALUATION_ENTITY.evaluation, ev.id, evLabel(l, 1), "CREATE", diffFields(null, startFields({ version: 1, trigger: "START", model: `${c.model!.nameEn}, version ${c.model!.version}`, at: now, by: person!.name, bidders: c.carried.length, excluded, decimals }, l.org.timeZone)));
    await act.write(tx, ev.id);
    await moveExercise(tx, l.ex, "UNDER_EVALUATION", { today: l.org.today, via: "EVALUATION_STARTED", startFaults: 0 });
    await audit(tx, toAuditActor(actor), l.org.id, "SourcingExercise", l.ex.id, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", diffFields({ status: l.ex.status }, { status: "UNDER_EVALUATION" }));
    const said = notes(all);
    return { ok: true, message: `Evaluation started with ${c.carried.length} ${c.carried.length === 1 ? "bid" : "bids"}${excluded ? `, ${excluded} excluded above the ceiling` : ""}.${said ? ` ${said}` : ""}` };
  });
}

/// Appoint a further team member, on one side, while the version is open (FR-EVL-001).
export async function appointTeamMember(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const personId = r.text("personId", "Member", { required: true });
  const side = r.choice("side", "Side", TEAM_SIDES, { required: true });
  const appointed = r.date("appointedOn", "Appointed on", { required: true });
  if (r.failed || !side || !appointed) return { ok: false, errors: r.errors };
  return inEvaluation(actor, exerciseIdOf(data), async (tx, l, c) => {
    const e = c.current;
    const af = openActFaults({ exerciseStatus: l.ex.status, state: e?.state ?? null });
    if (af.length) return refuse(af);
    const p = await tx.person.findFirst({ where: { id: personId, organisationId: l.org.id }, select: { id: true, name: true, isActive: true, orgUnitCode: true } });
    const pick: TeamPick = { personId, name: p?.name ?? "A person not on record", side, active: p?.isActive ?? false, unitCode: p?.orgUnitCode ?? null };
    const tf: Finding[] = [...teamFaults([pick], l.req.requestingUnitCode, c.unitPath, c.facts!.team)];
    const day = storedDay(appointed);
    if (l.org.today && day > l.org.today) tf.push({ code: "DAY_IN_FUTURE", level: "block" });
    if (tf.some((f) => f.level === "block")) return refuse(tf);
    const notNamed = await namingRefusal(tx, actor, l.ex.id, [personId]);
    if (notNamed) return { ok: false, message: `Not appointed. ${notNamed}` };
    const m = await tx.evaluationTeamMember.create({ data: { organisationId: l.org.id, evaluationId: e!.id, personId, side, orgUnitCodeSnapshot: pick.unitCode, appointedOn: appointed, recordedAt: now } });
    await audit(tx, toAuditActor(actor), l.org.id, EVALUATION_ENTITY.team, m.id, evLabel(l, e!.version, "Team"), "CREATE", diffFields(null, teamFields({ name: pick.name, side, unit: pick.unitCode, on: day })));
    const said = notes(tf);
    return { ok: true, message: `Appointed.${said ? ` ${said}` : ""}` };
  });
}

// ------------------------------------------------------------------ scores and inputs (plan §4.3)

/**
 * A score on one criterion of one bidder (FR-EVL-001; E-4): append-only, a rescore supersedes the
 * last; refused above the criterion's maximum, on a locked or submitted stage, for a bid out of the
 * running, or from someone not appointed to the stage's side.
 */
export async function recordScore(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const bidderRef = r.text("bidderId", "Bid", { required: true });
  const stageCode = r.text("stageCode", "Stage", { required: true });
  const criterionCode = r.text("criterionCode", "Criterion", { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  const marksRaw = r.optionalText("marks");
  const passedRaw = r.choice("passed", "Pass or fail", ["yes", "no"] as const);
  if (marksRaw != null && !isFixed(marksRaw)) r.reject("marks", "Marks are a figure, to at most four decimal places.");
  if (marksRaw == null && passedRaw == null) r.reject(String(data.get("scale") ?? "") === "PASS_FAIL" ? "passed" : "marks", "Enter the score.");
  if (r.failed) return { ok: false, errors: r.errors };
  const value: { marks: bigint } | { passed: boolean } = marksRaw != null ? { marks: parseFixed(marksRaw) } : { passed: passedRaw === "yes" };
  const begun = await beginAct(actor, data, "EvaluationScore.scoredBy", { personField: "scoredByPersonId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inEvaluation(actor, exerciseIdOf(data), async (tx, l, c) => {
    const e = c.current;
    const af = openActFaults({ exerciseStatus: l.ex.status, state: e?.state ?? null });
    if (af.length) return refuse(af);
    // Ruling of 2026-10-08 on log line 1751: a blind reader's form names a bid by its opaque key for this version, which is resolved here, under the lock, to the bid's own id.
    const bidderId = bidderIdFrom(c, bidderRef);
    const f = c.facts!;
    const s = stageOf(f.model, stageCode);
    const b = f.bidders.find((x) => x.id === bidderId);
    if (!s || !b) return GONE_BIDDER;
    // R-8: the scorer is an active person on record before the rule runs; a deactivated member is PERSON_REQUIRED, never a crash.
    const person = await activePerson(tx, l.org.id, personId);
    const fs = scoreFaults(f, s, criterionCode, b, person?.id ?? null, value);
    if (fs.length || !person) return refuse(fs.length ? fs : [{ code: "PERSON_REQUIRED", level: "block" }]);
    const prev = e!.bidders.find((x) => x.id === bidderId)!.scores.find((x) => x.stageCode === stageCode && x.criterionCode === criterionCode && !x.supersededBy) ?? null;
    const row = await tx.evaluationScore.create({ data: { organisationId: l.org.id, bidderId, stageCode, criterionCode, marks: "marks" in value ? fixedToDecimalString(value.marks) : null, passed: "passed" in value ? value.passed : null, note, scoredByPersonId: person.id, recordedAt: now, supersedesId: prev?.id ?? null } });
    const criterion = s.criteria.find((x) => x.code === criterionCode)!.labelEn;
    const before = b.scores.get(scoreKey(stageCode, criterionCode));
    await audit(tx, toAuditActor(actor), l.org.id, EVALUATION_ENTITY.score, row.id, evLabel(l, e!.version, `${s.labelEn} · bid No. ${b.listingNo}`), prev ? "UPDATE" : "CREATE",
      diffFields(before ? scoreFields({ criterion, marks: before.marks, passed: before.passed, note: before.note, by: before.scoredBy }) : null, scoreFields({ criterion, marks: "marks" in value ? value.marks : null, passed: "passed" in value ? value.passed : null, note, by: person.name })));
    await act.write(tx, row.id);
    return { ok: true, message: prev ? "Rescored: the earlier score is kept in the History." : "Scored." };
  });
}

/**
 * The inputs the computations read for one bidder (FR-EVL-010, 012; E-6; OD-4): the factor option, the
 * three monthly balances in sen, the CPR from its attached report. Refused once the stage reading them
 * is submitted, and for a bid excluded or out of the running at that stage (BD-68-11).
 */
export async function recordInputs(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const bidderRef = r.text("bidderId", "Bid", { required: true });
  const factor = r.optionalText("factorOptionCode");
  const balances = ["balanceMonth1", "balanceMonth2", "balanceMonth3"].map((n) => {
    const v = signedMoney(data, n);
    if (v === "bad") r.reject(n, "A balance is an amount, to at most two decimal places.");
    return v === "bad" ? null : v;
  });
  const cprRaw = r.optionalText("cprPercent")?.replace(/%$/, "").trim() ?? null;
  if (cprRaw != null && !isFixed(cprRaw)) r.reject("cprPercent", "A percentage, to at most four decimal places.");
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "EvaluationBidder.inputsRecordedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inEvaluation(actor, exerciseIdOf(data), async (tx, l, c) => {
    const e = c.current;
    const af = openActFaults({ exerciseStatus: l.ex.status, state: e?.state ?? null });
    if (af.length) return refuse(af);
    // Ruling of 2026-10-08 on log line 1751: a blind reader's form names a bid by its opaque key for this version, which is resolved here, under the lock, to the bid's own id.
    const bidderId = bidderIdFrom(c, bidderRef);
    const f = c.facts!;
    const b = f.bidders.find((x) => x.id === bidderId);
    if (!b) return GONE_BIDDER;
    const fs: Finding[] = [];
    const person = await activePerson(tx, l.org.id, personId);
    if (!person) fs.push({ code: "PERSON_REQUIRED", level: "block" });
    const capital = inputStages(f, "capital");
    const cprStages = inputStages(f, "cpr");
    const capitalChanged = factor !== b.factorOptionCode || balances.some((v, i) => (v == null ? null : parseSen(v)) !== b.balances[i]);
    const cpr = cprRaw != null ? parseFixed(cprRaw) : null;
    const cprChanged = cpr !== b.cprPercent;
    if (factor && !capital.some((s) => s.factors.some((x) => x.code === factor))) fs.push({ code: "FACTOR_UNKNOWN", level: "block" });
    if (cpr != null && cprChanged) fs.push(...cprEntryFaults(cpr, b.cprReports));
    const reading = [...(capitalChanged ? capital : []), ...(cprChanged ? cprStages : [])];
    // Submitted, the inputs stand; a bid excluded or out of the running at the stage that reads them
    // takes none: they would never be read. The screen's trigger judges with the same rule (inputsAccess).
    for (const s of reading) fs.push(...inputStageFaults(f, s, b));
    if (person) for (const s of reading) fs.push(...personFaults(s.side, person.id, f.team, f.submissions));
    if (fs.some((x) => x.level === "block")) return refuse(fs);
    const factorLabel = (code: string | null) => (code ? (capital.flatMap((s) => s.factors).find((x) => x.code === code)?.labelEn ?? "A factor no longer offered") : null);
    await tx.evaluationBidder.update({ where: { id: b.id, organisationId: actor.organisationId }, data: { factorOptionCode: factor, balanceMonth1: balances[0], balanceMonth2: balances[1], balanceMonth3: balances[2], cprPercent: cpr != null ? fixedToDecimalString(cpr) : null, inputsRecordedAt: now, inputsRecordedByPersonId: person!.id } });
    await audit(tx, toAuditActor(actor), l.org.id, EVALUATION_ENTITY.bidder, b.id, evLabel(l, e!.version, `Bid No. ${b.listingNo}`), "UPDATE",
      diffFields(inputFields({ factor: factorLabel(b.factorOptionCode), balances: b.balances, cpr: b.cprPercent, by: person!.name }), inputFields({ factor: factorLabel(factor), balances: balances.map((v) => (v == null ? null : parseSen(v))), cpr, by: person!.name })));
    await act.write(tx, b.id);
    return { ok: true, message: "Recorded." };
  });
}

/**
 * A price's arithmetic correction, with its reason (FR-EVL-008): only before the first stage is
 * submitted, since every stage after reads the price as it stood. The ceiling (FR-EVL-019) is judged
 * again on the corrected price, the exclusion recorded or cleared.
 */
export async function correctPrice(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const bidderRef = r.text("bidderId", "Bid", { required: true });
  const price = r.money("correctedPrice", "Corrected price", { required: true });
  const reason = r.text("correctionReason", "Why it is corrected", { required: true, max: 2000 });
  if (r.failed || !price) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "EvaluationBidder.correctedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inEvaluation(actor, exerciseIdOf(data), async (tx, l, c) => {
    const e = c.current;
    const af = openActFaults({ exerciseStatus: l.ex.status, state: e?.state ?? null });
    if (af.length) return refuse(af);
    // Ruling of 2026-10-08 on log line 1751: a blind reader's form names a bid by its opaque key for this version, which is resolved here, under the lock, to the bid's own id.
    const bidderId = bidderIdFrom(c, bidderRef);
    const f = c.facts!;
    const b = f.bidders.find((x) => x.id === bidderId);
    if (!b) return GONE_BIDDER;
    const person = await activePerson(tx, l.org.id, personId);
    const fs: Finding[] = [];
    if (!person) fs.push({ code: "PERSON_REQUIRED", level: "block" });
    if (f.submissions.length) fs.push({ code: "CORRECTION_AFTER_SUBMISSION", level: "block" });
    if (fs.length) return refuse(fs);
    const sen = parseSen(price);
    const reasonExcluded = exclusionReason(ceilingExclusion(sen, ceilingOf(l.ex)));
    await tx.evaluationBidder.update({ where: { id: b.id, organisationId: actor.organisationId }, data: { correctedPrice: price, correctionReason: reason, correctedAt: now, correctedByPersonId: person!.id, excludedReason: reasonExcluded } });
    await audit(tx, toAuditActor(actor), l.org.id, EVALUATION_ENTITY.bidder, b.id, evLabel(l, e!.version, `Bid No. ${b.listingNo}`), "UPDATE",
      diffFields(b.correctedPrice != null ? correctionFields({ price: b.correctedPrice, reason: "", by: "", excluded: b.excludedReason }) : { correctedPrice: null }, correctionFields({ price: sen, reason, by: person!.name, excluded: reasonExcluded })), reason);
    await act.write(tx, b.id);
    return { ok: true, message: reasonExcluded ? "Corrected. Above the quotation ceiling: excluded." : "Corrected." };
  });
}

// ------------------------------------------------------------------ submitting, shortlisting

/**
 * Submit a stage (FR-EVL-002): in order, by a member on its side, every bidder in the running
 * computed, a note for each value no band holds (OD-5 A). Its results are frozen with it.
 */
export async function submitStage(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const stageCode = String(data.get("stageCode") ?? "");
  const notesRaw = new Map<string, string>();
  for (const [k, v] of data.entries()) if (k.startsWith("note:") && typeof v === "string") notesRaw.set(k.slice(5), v.trim());
  const begun = await beginAct(actor, data, "StageSubmission.submittedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inEvaluation(actor, exerciseIdOf(data), async (tx, l, c) => {
    const e = c.current;
    const af = openActFaults({ exerciseStatus: l.ex.status, state: e?.state ?? null });
    if (af.length) return refuse(af);
    // Ruling of 2026-10-08 on log line 1751: the note's key names a bid (`<bid>/<criterion>`), by its id or, for a blind reader, by its opaque key for this version.
    const notesMap = new Map([...notesRaw].map(([k, v]) => { const i = k.indexOf("/"); return [i < 0 ? k : `${bidderIdFrom(c, k.slice(0, i))}${k.slice(i)}`, v] as const; }));
    const f = c.facts!;
    const s = stageOf(f.model, stageCode);
    if (!s) return { ok: false, message: "That stage is not in the pinned model." };
    const person = await activePerson(tx, l.org.id, personId);
    const r = submitStageRule(f, s, person?.id ?? null, notesMap);
    if (r.faults.some((x) => x.level === "block")) return refuse(r.faults, "Not submitted:");
    const sub = await tx.stageSubmission.create({ data: { organisationId: l.org.id, evaluationId: e!.id, stageCode: s.code, side: s.side, submittedByPersonId: person!.id, submittedAt: now } });
    for (const row of resultRows(s, r.results, notesMap)) {
      await tx.stageResult.create({ data: { organisationId: l.org.id, evaluationId: e!.id, bidderId: row.bidderId, stageCode: s.code, percent: row.percent != null ? fixedToDecimalString(row.percent) : null, shown: row.shown != null ? fixedToDecimalString(row.shown) : null, passed: row.passed, bandLabel: row.bandLabel, outOfRunning: row.outOfRunning, detail: row.detail as Prisma.InputJsonValue } });
    }
    const out = r.results.filter((x) => x.outOfRunning).length;
    await audit(tx, toAuditActor(actor), l.org.id, EVALUATION_ENTITY.submission, sub.id, evLabel(l, e!.version, s.labelEn), "CREATE", diffFields(null, { stage: s.labelEn, submittedBy: person!.name, bidsJudged: r.results.length, outOfTheRunning: out || null }));
    await act.write(tx, sub.id);
    return { ok: true, message: `${s.labelEn} submitted: ${r.results.length} ${r.results.length === 1 ? "bid" : "bids"} judged${out ? `, ${out} out of the running` : ""}.` };
  });
}

/**
 * The shortlist (FR-EVL-009): the bids chosen among those in the running, under the stage's rule; the
 * stage's submission and its results are this act's.
 */
export async function recordShortlist(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const stageCode = String(data.get("stageCode") ?? "");
  const chosenRefs = picks(data, "chosen");
  const begun = await beginAct(actor, data, "StageSubmission.submittedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inEvaluation(actor, exerciseIdOf(data), async (tx, l, c) => {
    const e = c.current;
    const af = openActFaults({ exerciseStatus: l.ex.status, state: e?.state ?? null });
    if (af.length) return refuse(af);
    // The bids chosen are named by id or, for a blind reader, by the opaque key for this version (ruling of 2026-10-08 on log line 1751).
    const chosen = chosenRefs.map((x) => bidderIdFrom(c, x));
    const f = c.facts!;
    const s = stageOf(f.model, stageCode);
    if (!s || s.kind !== "SHORTLIST") return { ok: false, message: "That stage is not a shortlist." };
    const fs: Finding[] = [];
    if (isSubmitted(f, s.code)) fs.push({ code: "SHORTLIST_DONE", level: "block" });
    for (const x of f.model.stages.filter((x) => x.order < s.order && x.kind !== "COMMITTEE_DECISION" && x.kind !== "RECOMMENDATION")) if (!isSubmitted(f, x.code)) fs.push({ code: "EARLIER_NOT_SUBMITTED", level: "block", data: { stage: x.labelEn } });
    const person = await activePerson(tx, l.org.id, personId);
    fs.push(...personFaults(s.side, person?.id ?? null, f.team, f.submissions));
    const eligible = inRunningAt(f, s).map((b) => ({ id: b.id, price: evaluatedPrice(b) }));
    fs.push(...shortlistFaults({ rule: s.shortlistRule, min: s.shortlistMin, max: s.shortlistMax, officeCode: s.shortlistOfficeCode, eligible, chosen, deciderHoldsOffice: !!person && c.holdsOffice(person.id, s.shortlistOfficeCode) }));
    if (fs.some((x) => x.level === "block")) return refuse(fs, "Not recorded:");
    const sub = await tx.stageSubmission.create({ data: { organisationId: l.org.id, evaluationId: e!.id, stageCode: s.code, side: s.side, submittedByPersonId: person!.id, submittedAt: now } });
    for (const b of eligible) {
      const on = chosen.includes(b.id);
      await tx.evaluationBidder.update({ where: { id: b.id, organisationId: actor.organisationId }, data: { shortlisted: on, shortlistedAt: now, shortlistedByPersonId: person!.id } });
      await tx.stageResult.create({ data: { organisationId: l.org.id, evaluationId: e!.id, bidderId: b.id, stageCode: s.code, passed: on, outOfRunning: !on } });
      await act.writeAlso(tx, "EvaluationBidder.shortlistedBy", b.id);
    }
    const listing = (id: string) => f.bidders.find((x) => x.id === id)!.listingNo;
    await audit(tx, toAuditActor(actor), l.org.id, EVALUATION_ENTITY.submission, sub.id, evLabel(l, e!.version, s.labelEn), "CREATE", diffFields(null, { stage: s.labelEn, shortlisted: chosen.map((id) => `No. ${listing(id)}`).join(", ") || "None", notShortlisted: eligible.filter((b) => !chosen.includes(b.id)).map((b) => `No. ${listing(b.id)}`).join(", ") || null, recordedBy: person!.name }));
    await act.write(tx, sub.id);
    const said = notes(fs);
    return { ok: true, message: `Shortlist recorded.${said ? ` ${said}` : ""}` };
  });
}

// ------------------------------------------------------------------ aspects and communications (plan §4.5)

/// One aspect's verdict and narrative on one bidder (FR-EVL-003): append-only, a reassessment supersedes.
export async function assessAspect(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const bidderRef = r.text("bidderId", "Bid", { required: true });
  const aspectCode = r.text("aspectCode", "Aspect", { required: true });
  const verdict = r.choice("verdict", "Verdict", ASPECT_VERDICTS);
  const narrative = r.text("narrative", "Narrative", { max: 4000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "AspectAssessment.assessedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inEvaluation(actor, exerciseIdOf(data), async (tx, l, c) => {
    const e = c.current;
    const af = openActFaults({ exerciseStatus: l.ex.status, state: e?.state ?? null });
    if (af.length) return refuse(af);
    // Ruling of 2026-10-08 on log line 1751: a blind reader's form names a bid by its opaque key for this version, which is resolved here, under the lock, to the bid's own id.
    const bidderId = bidderIdFrom(c, bidderRef);
    const f = c.facts!;
    const b = f.bidders.find((x) => x.id === bidderId);
    if (!b) return GONE_BIDDER;
    const stage = f.model.stages.find((s) => s.kind === "ASPECTS");
    const aspect = f.model.aspects.find((a) => a.code === aspectCode) ?? null;
    // R-8: the assessor is an active person on record before the rule runs; a deactivated member is PERSON_REQUIRED, never a crash.
    const person = await activePerson(tx, l.org.id, personId);
    const fs: Finding[] = [...assessFaults({ aspectInModel: !!aspect && !!stage, verdict, narrative })];
    if (stage) {
      if (isSubmitted(f, stage.code)) fs.push({ code: "STAGE_SUBMITTED", level: "block", data: { stage: stage.labelEn } });
      fs.push(...runningFaults(f, stage, b));
      fs.push(...personFaults(stage.side, person?.id ?? null, f.team, f.submissions));
    }
    if (!person && !fs.some((x) => x.code === "PERSON_REQUIRED")) fs.push({ code: "PERSON_REQUIRED", level: "block" });
    if (fs.length || !person) return refuse(fs);
    const prev = e!.bidders.find((x) => x.id === bidderId)!.aspects.find((a) => a.aspectCode === aspectCode && !a.supersededBy) ?? null;
    const row = await tx.aspectAssessment.create({ data: { organisationId: l.org.id, bidderId, aspectCode, verdict: verdict!, narrative, assessedByPersonId: person.id, recordedAt: now, supersedesId: prev?.id ?? null } });
    await audit(tx, toAuditActor(actor), l.org.id, EVALUATION_ENTITY.aspect, row.id, evLabel(l, e!.version, `Aspects · bid No. ${b.listingNo}`), prev ? "UPDATE" : "CREATE",
      diffFields(prev ? aspectFields({ aspect: aspect!.labelEn, kind: aspect!.kind, verdict: prev.verdict, narrative: prev.narrative, by: prev.assessedBy.name }) : null, aspectFields({ aspect: aspect!.labelEn, kind: aspect!.kind, verdict: verdict!, narrative, by: person.name })));
    await act.write(tx, row.id);
    return { ok: true, message: "Assessed." };
  });
}

/// A written communication with a tenderer (FR-EVL-013): recorded, never sent (INT-09 not built).
export async function logCommunication(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const bidderRef = r.text("bidderId", "Tenderer", { required: true });
  const direction = r.choice("direction", "Direction", COMMUNICATION_DIRECTIONS, { required: true });
  const channel = r.choice("channel", "Channel", COMMUNICATION_CHANNELS, { required: true });
  const on = r.date("on", direction === "FROM_TENDERER" ? "Received on" : "Sent on", { required: true });
  const subject = r.text("subject", "Subject", { required: true, max: 300 });
  const content = r.text("content", "What it says", { required: true, max: 8000 });
  if (r.failed || !direction || !channel || !on) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "TendererCommunication.recordedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inEvaluation(actor, exerciseIdOf(data), async (tx, l, c) => {
    const e = c.current;
    const af = openActFaults({ exerciseStatus: l.ex.status, state: e?.state ?? null });
    if (af.length) return refuse(af);
    // Ruling of 2026-10-08 on log line 1751: a blind reader's form names a bid by its opaque key for this version, which is resolved here, under the lock, to the bid's own id.
    const bidderId = bidderIdFrom(c, bidderRef);
    const b = c.facts!.bidders.find((x) => x.id === bidderId);
    if (!b) return GONE_BIDDER;
    const person = await activePerson(tx, l.org.id, personId);
    const day = storedDay(on);
    const fs: Finding[] = [];
    if (!person) fs.push({ code: "PERSON_REQUIRED", level: "block" });
    if (!l.org.today) fs.push({ code: "TIME_ZONE_NOT_SET", level: "block" });
    else if (day > l.org.today) fs.push({ code: "DAY_IN_FUTURE", level: "block" });
    if (fs.length) return refuse(fs);
    const row = await tx.tendererCommunication.create({ data: { organisationId: l.org.id, evaluationId: e!.id, bidderId, direction, channel, sentOn: direction === "TO_TENDERER" ? on : null, receivedOn: direction === "FROM_TENDERER" ? on : null, subject, content, recordedByPersonId: person!.id, recordedAt: now } });
    await audit(tx, toAuditActor(actor), l.org.id, EVALUATION_ENTITY.communication, row.id, evLabel(l, e!.version, `Communication · bid No. ${b.listingNo}`), "CREATE", diffFields(null, communicationFields({ direction, channel, on: day, subject, content, by: person!.name })));
    await act.write(tx, row.id);
    return { ok: true, message: "Recorded." };
  });
}
