"use server";

import type { FormState } from "@/components/record-editor";
import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { dayIn, dayOf, dayToDate, storedDay } from "@/lib/dates";
import { isLive } from "@/lib/documents/evidence";
import { formatDate } from "@/lib/format";
import { EVALUATION_ENTITY, recommendationFields, signerFields } from "@/lib/evaluation/audit-view";
import { CONSENT_OUTCOME_TEXT, consentCheck } from "@/lib/evaluation/consent";
import { recommendedPriceOf } from "@/lib/evaluation/facts";
import { renderEvaluationInstrument, evaluationFieldsInWords, type TemplateFacts } from "@/lib/evaluation/instrument";
import { renderFaults, signerFaults } from "@/lib/evaluation/proposal";
import { incompleteStages, recommendationFaults } from "@/lib/evaluation/recommend";
import { ceilingOf } from "@/lib/evaluation/repo";
import { buildReport, periodWords, reportFaults, reportFields, reportStale } from "@/lib/evaluation/report";
import { issuedActFaults, openActFaults } from "@/lib/evaluation/state";
import type { Finding } from "@/lib/evaluation/types";
import { moveExercise } from "@/lib/method/move";
import { senFromDecimal, senToDecimalString } from "@/lib/money";
import { NumberingError, issueReference } from "@/lib/numbering/issue";
import { FormReader } from "@/lib/validate";

import { activePerson, audit, exerciseIdOf, Refusal } from "../window/shared";
import { evLabel, GONE_BIDDER, inEvaluation, refuse, stampNow } from "./shared";
import { toAuditActor, staffForAct } from "@/app/_auth/actor";
import { beginAct } from "@/app/_auth/act";

/**
 * The recommendation, the report and the Kertas Cadangan (FR-EVL-004, 017, 018; FR-CTE-007, 013;
 * FR-BID-010 via 6.6 OD-7). The report is issued once, frozen, its reference drawn from the configured
 * series in the same transaction, its text from the configured template; issuing re-checks each applied
 * validity extension's consent party against the recommendation and makes the exercise Evaluated. The
 * Kertas Cadangan is rendered from the issued report, frozen, then checked and recommended by the
 * holders of the two configured offices, two different people. Each audited; SULIT figures under their
 * registered keys.
 */

const templateOf = (t: { id: string; code: string; nameEn: string; bodyEn: string | null; bodyMs: string | null; primaryLanguage: "MS" | "EN" | null; bodyVersion: number } | null | undefined): TemplateFacts | null => (t ? { id: t.id, code: t.code, nameEn: t.nameEn, bodyEn: t.bodyEn, bodyMs: t.bodyMs, primaryLanguage: t.primaryLanguage, bodyVersion: t.bodyVersion } : null);
const tFaults = (t: { state: "OK" | "NOT_SET" | "NO_TEXT" | "NO_LANGUAGE"; missing: string[]; unknown: string[] }, instrument: "REPORT" | "PROPOSAL") => ({ ...t, missing: t.missing.length ? [evaluationFieldsInWords(instrument, t.missing)] : [], unknown: t.unknown.length ? [evaluationFieldsInWords(instrument, t.unknown)] : [] });
const SERIES_MISSING = "Not issued: the report's numbering series is not configured. Configure it under Configuration › Numbering, with the key named under Configuration › Evaluation models, Policy.";
const SERIES_INVALID = "Not issued: the report's numbering series is not valid. Correct it under Configuration › Numbering.";
const CHANGED_EVALUATION = { ok: false, message: "The evaluation changed while this was being saved. Reload and try again." } as const;

/// Form the recommendation (FR-EVL-004, 018; OD-6 A): a bid in the running after every stage, justified where not top-ranked.
export async function formRecommendation(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const bidderId = r.text("bidderId", "Recommended tenderer", { required: true });
  const justification = r.text("justification", "Why this one", { max: 4000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "Recommendation.formedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inEvaluation(actor, exerciseIdOf(data), async (tx, l, c) => {
    const e = c.current;
    const af = openActFaults({ exerciseStatus: l.ex.status, state: e?.state ?? null });
    if (af.length) return refuse(af);
    const f = c.facts!;
    const b = f.bidders.find((x) => x.id === bidderId);
    if (!b) return GONE_BIDDER;
    const person = await activePerson(tx, l.org.id, personId);
    const rf = recommendationFaults(f, { bidderId, justification, personActive: !!person, alreadyFormed: e!.recommendation != null, meetingsOpen: e!.meetings.filter((m) => !m.closedAt).length, negotiationsPending: e!.negotiations.filter((n) => n.approvalInstance.status === "PENDING").length, ceiling: ceilingOf(l.ex) });
    if (rf.faults.length) return refuse(rf.faults, "Not formed:");
    const price = recommendedPriceOf(b);
    const row = await tx.recommendation.create({ data: { organisationId: l.org.id, evaluationId: e!.id, bidderId, price: senToDecimalString(price), completionPeriod: b.period?.value ?? null, completionUnit: b.period?.unit ?? null, topRanked: rf.topRanked, justification: rf.topRanked ? "" : justification, formedByPersonId: person!.id, formedAt: now } });
    await audit(tx, toAuditActor(actor), l.org.id, EVALUATION_ENTITY.recommendation, row.id, evLabel(l, e!.version, "Recommendation"), "CREATE", diffFields(null, recommendationFields({ bidder: `No. ${b.listingNo}, ${b.bidderName}`, price, period: periodWords(b.period), topRanked: rf.topRanked, justification: rf.topRanked ? "" : justification, by: person!.name })));
    await act.write(tx, row.id);
    return { ok: true, message: "Recommendation formed. Issue the report on the Report section." };
  });
}

/**
 * Issue the report (FR-EVL-017, 018; FR-BID-010): every stage complete, the recommendation formed, no
 * meeting open or negotiation pending, no admitted late tender unopened, every applied extension's
 * consent from the recommended tenderer, the bids evaluated still the bids carried; then the reference
 * from the series, the text from the template, annexes A–F frozen, and the exercise Evaluated.
 */
export async function issueReport(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const begun = await beginAct(actor, data, "Evaluation.issuedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inEvaluation(actor, exerciseIdOf(data), async (tx, l, c) => {
    const e = c.current;
    const af = openActFaults({ exerciseStatus: l.ex.status, state: e?.state ?? null });
    if (af.length) return refuse(af);
    const f = c.facts!;
    const person = await activePerson(tx, l.org.id, personId);
    const rec = e!.recommendation;
    const rb = rec ? (f.bidders.find((b) => b.id === rec.bidderId) ?? null) : null;
    const consent = consentCheck(c.extensions.map((x) => ({ id: x.id, consentPartyId: x.consentPartyId, consentPartyName: x.consentParty.name, applied: x.appliedAt != null, toExpiry: storedDay(x.toExpiry) })), rb?.partyId ?? null);
    const org = await tx.organisation.findUniqueOrThrow({ where: { id: l.org.id }, select: { name: true, nameMs: true } });
    const template = templateOf(c.policy?.reportTemplate);
    const today = l.org.today;
    const base = { facts: f, exercise: { reference: l.ex.reference, title: l.ex.title }, version: e!.version, issuedOn: today ? formatDate(today) : "" };
    const recommendation = rec && rb ? { bidderId: rec.bidderId, price: recommendedPriceOf(rb), period: rb.period, topRanked: rec.topRanked, justification: rec.justification, formedBy: rec.formedBy.name, formedOn: formatDate(dayOf(rec.formedAt, l.org.timeZone)) } : null;
    const orgName = (lang: "EN" | "MS") => (lang === "MS" ? (org.nameMs ?? org.name) : org.name);
    // The template judged with a placeholder reference first: the series is drawn only once nothing refuses.
    const trial = recommendation ? renderEvaluationInstrument("REPORT", template, (lang) => reportFields({ ...base, reference: "(allocated on issue)", recommendation }, orgName(lang))) : { state: "OK" as const, missing: [], unknown: [], language: null, text: null };
    const fs: Finding[] = reportFaults({
      stagesIncomplete: incompleteStages(f),
      recommended: !!recommendation,
      openMeetings: e!.meetings.filter((m) => !m.closedAt).length,
      pendingNegotiations: e!.negotiations.filter((n) => n.approvalInstance.status === "PENDING").length,
      seriesKey: c.policy?.reportSeriesKey ?? null,
      template: tFaults(trial, "REPORT"),
      admittedUnopened: c.admittedUnopened,
      supplementaryInProgress: c.supplementaryInProgress,
      consent: consent.faults,
      stale: reportStale(e!.bidders.map((b) => b.openedBidId), c.carried.map((b) => b.id)),
      personActive: !!person,
      today,
      // Q1: the price recommended at, as recorded, within the quotation's frozen ceiling.
      ceiling: rec ? { price: senFromDecimal(rec.price), snapshot: ceilingOf(l.ex) } : null,
    });
    if (fs.length) return refuse(fs, "Not issued:");
    // From here a refusal is thrown, so the transaction rolls back and the number drawn is not consumed.
    const reference = await issueReference(tx, l.org.id, c.policy!.reportSeriesKey!, dayToDate(today!)).catch((err: unknown) => {
      if (err instanceof NumberingError) throw new Refusal({ ok: false, message: err.fault === "SERIES_MISSING" ? SERIES_MISSING : SERIES_INVALID });
      throw err;
    });
    const rendered = renderEvaluationInstrument("REPORT", template, (lang) => reportFields({ ...base, reference, recommendation: recommendation! }, orgName(lang)));
    if (rendered.state !== "OK" || rendered.missing.length || rendered.unknown.length) throw new Refusal(refuse([{ code: "TEMPLATE_INCOMPLETE", level: "block", data: { fields: evaluationFieldsInWords("REPORT", [...rendered.missing, ...rendered.unknown]) } }], "Not issued:"));
    const snapshot = buildReport({
      ...base,
      recommendation: recommendation!,
      reference,
      issuedBy: person!.name,
      details: new Map(e!.results.map((x) => [`${x.bidderId}/${x.stageCode}`, x.detail])),
      schedule: c.latestSchedule,
      siteVisits: c.siteVisits,
      drawings: e!.attachments.filter((a) => a.purpose === "REPORT_DRAWINGS" && isLive(a)).map((a) => ({ title: a.version.document.title, versionNo: a.version.versionNo })),
      meetings: e!.meetings.map((m) => ({ kind: m.kind, round: m.round, listingNo: f.bidders.find((b) => b.id === m.bidderId)!.listingNo, heldOn: formatDate(storedDay(m.heldOn)), place: m.place, minutes: m.minutes, priceBefore: m.priceBefore != null ? senFromDecimal(m.priceBefore) : null, priceAfter: m.priceAfter != null ? senFromDecimal(m.priceAfter) : null })),
      consent: consent.rows.map((x) => ({ consentPartyName: x.consentPartyName, toExpiry: formatDate(x.toExpiry), outcome: CONSENT_OUTCOME_TEXT[x.outcome] })),
      annexLabels: c.policy?.annexLabels ?? null,
      text: { language: rendered.language!, body: rendered.text!, template: { code: template!.code, name: template!.nameEn, bodyVersion: template!.bodyVersion } },
    });
    const done = await tx.evaluation.updateMany({ where: { id: e!.id, state: "OPEN" }, data: { state: "ISSUED", issuedAt: now, issuedByPersonId: person!.id, reportReference: reference, reportSnapshot: snapshot as unknown as Prisma.InputJsonValue, consentCheckSnapshot: consent.rows as unknown as Prisma.InputJsonValue } });
    if (done.count !== 1) throw new Refusal(CHANGED_EVALUATION);
    await audit(tx, toAuditActor(actor), l.org.id, EVALUATION_ENTITY.evaluation, e!.id, evLabel(l, e!.version), "UPDATE", diffFields({ state: "In progress", report: null }, { state: "Report issued", report: reference, issuedBy: person!.name, template: `${template!.nameEn}, text version ${template!.bodyVersion}`, consentChecked: consent.rows.some((x) => x.outcome === "CHECKED") ? "the extension in force, from the recommended tenderer" : null }));
    await act.write(tx, e!.id);
    await moveExercise(tx, l.ex, "EVALUATED", { today, via: "REPORT_ISSUED", reportFaults: 0 });
    await audit(tx, toAuditActor(actor), l.org.id, "SourcingExercise", l.ex.id, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", diffFields({ status: l.ex.status }, { status: "EVALUATED" }));
    return { ok: true, message: `Report ${reference} issued. Produce the Kertas Cadangan on this section next.` };
  });
}

/// Produce the Kertas Cadangan from the issued report, through the configured template, frozen (FR-CTE-013).
export async function renderProposalPaper(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const begun = await beginAct(actor, data, "ProposalPaper.renderedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inEvaluation(actor, exerciseIdOf(data), async (tx, l, c) => {
    const e = c.current;
    const af = issuedActFaults({ exerciseStatus: l.ex.status, state: e?.state ?? null });
    if (af.length) return refuse(af);
    const f = c.facts!;
    const person = await activePerson(tx, l.org.id, personId);
    const rec = e!.recommendation!;
    const rb = f.bidders.find((b) => b.id === rec.bidderId)!;
    const org = await tx.organisation.findUniqueOrThrow({ where: { id: l.org.id }, select: { name: true, nameMs: true } });
    const template = templateOf(c.policy?.proposalTemplate);
    const office = (code: string | null | undefined) => (code ? (c.roster.offices.find((o) => o.code === code)?.nameEn ?? "An office no longer configured") : "");
    // 68-C5: the report's issued day on the organisation's clock; with no zone, refused below (never UTC's day).
    const issuedOn = dayOf(e!.issuedAt!, l.org.timeZone);
    const rendered = renderEvaluationInstrument("PROPOSAL", template, (lang) =>
      reportFields({ facts: f, exercise: { reference: l.ex.reference, title: l.ex.title }, version: e!.version, reference: e!.reportReference!, issuedOn: formatDate(issuedOn), recommendation: { bidderId: rec.bidderId, price: recommendedPriceOf(rb), period: rb.period, topRanked: rec.topRanked, justification: rec.justification } }, lang === "MS" ? (org.nameMs ?? org.name) : org.name, { "proposal.checkerOffice": office(c.policy?.checkerRoleCode), "proposal.recommenderOffice": office(c.policy?.recommenderRoleCode) }),
    );
    const fs = renderFaults({ rendered: e!.proposalPaper != null, checkerRoleCode: c.policy?.checkerRoleCode ?? null, recommenderRoleCode: c.policy?.recommenderRoleCode ?? null, template: tFaults(rendered, "PROPOSAL"), personActive: !!person, reportIssuedOn: issuedOn });
    if (fs.length) return refuse(fs, "Not produced:");
    const row = await tx.proposalPaper.create({ data: { organisationId: l.org.id, evaluationId: e!.id, templateId: template!.id, templateCode: template!.code, templateBodyVersion: template!.bodyVersion, language: rendered.language!, renderedText: rendered.text!, frozenAt: now, renderedByPersonId: person!.id, checkerRoleCode: c.policy!.checkerRoleCode!, recommenderRoleCode: c.policy!.recommenderRoleCode! } });
    await audit(tx, toAuditActor(actor), l.org.id, EVALUATION_ENTITY.proposal, row.id, evLabel(l, e!.version, "Kertas Cadangan"), "CREATE", diffFields(null, { produced: `${template!.nameEn}, text version ${template!.bodyVersion}`, language: rendered.language === "MS" ? "Malay" : "English", checkedBy: office(c.policy?.checkerRoleCode), recommendedBy: office(c.policy?.recommenderRoleCode), producedBy: person!.name }));
    await act.write(tx, row.id);
    return { ok: true, message: "Produced and frozen. Record its checking and its recommending officer." };
  });
}

/// The checking or the recommending officer of the Kertas Cadangan: the office's holder on the day, never the other one.
export async function recordProposalSigner(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = stampNow();
  const r = new FormReader(data);
  const role = r.choice("role", "Role", ["CHECKER", "RECOMMENDER"] as const, { required: true });
  const day = r.date("signedOn", "Signed on", { required: true });
  if (r.failed || !role || !day) return { ok: false, errors: r.errors };
  // The checking officer and the recommending officer are the office holders themselves, signed in; a paper record of either is recorded for them.
  const begun = await beginAct(actor, data, role === "CHECKER" ? "ProposalPaper.checkedBy" : "ProposalPaper.recommendedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inEvaluation(actor, exerciseIdOf(data), async (tx, l, c) => {
    const e = c.current;
    const af = issuedActFaults({ exerciseStatus: l.ex.status, state: e?.state ?? null });
    if (af.length) return refuse(af);
    const p = e!.proposalPaper;
    const person = await activePerson(tx, l.org.id, personId);
    const roleCode = role === "CHECKER" ? p?.checkerRoleCode : p?.recommenderRoleCode;
    const fs = signerFaults({
      rendered: !!p,
      already: role === "CHECKER" ? !!p?.checkedByPersonId : !!p?.recommendedByPersonId,
      personId: person?.id ?? null,
      personActive: !!person,
      otherSignerId: (role === "CHECKER" ? p?.recommendedByPersonId : p?.checkedByPersonId) ?? null,
      holdsOffice: !!person && c.holdsOffice(person.id, roleCode ?? null, day),
      day: storedDay(day),
      today: l.org.today,
      // The paper's day on the organisation's clock (no zone: TIME_ZONE_NOT_SET refuses first).
      paperDay: p && l.org.timeZone ? dayIn(p.frozenAt, l.org.timeZone) : null,
    });
    if (fs.length) return refuse(fs, "Not recorded:");
    const write = role === "CHECKER" ? { checkedByPersonId: person!.id, checkedOn: day, checkedRecordedAt: now } : { recommendedByPersonId: person!.id, recommendedOn: day, recommendedRecordedAt: now };
    const done = await tx.proposalPaper.updateMany({ where: { id: p!.id, ...(role === "CHECKER" ? { checkedByPersonId: null } : { recommendedByPersonId: null }) }, data: write });
    if (done.count !== 1) throw new Refusal({ ok: false, message: "The Kertas Cadangan changed while this was being saved. Reload and try again." });
    const office = c.roster.offices.find((o) => o.code === roleCode)?.nameEn ?? "An office no longer configured";
    await audit(tx, toAuditActor(actor), l.org.id, EVALUATION_ENTITY.proposal, p!.id, evLabel(l, e!.version, "Kertas Cadangan"), "UPDATE", diffFields(null, signerFields({ role, name: person!.name, office, day: storedDay(day) })));
    await act.write(tx, p!.id);
    return { ok: true, message: "Recorded." };
  });
}
