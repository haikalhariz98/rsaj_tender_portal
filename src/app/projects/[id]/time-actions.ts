"use server";

import type { FormState } from "@/components/record-editor";
import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { toSecond } from "@/lib/bids/lateness";
import { actStatusFault, type ContractAct } from "@/lib/contract/act-status";
import { withLockedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOrNull as day, dayToDate, storedDay } from "@/lib/dates";
import { formatMoney, parseSen } from "@/lib/money";
import { actCtx, type ActCtx, ActRefusal, afterAct, asMatterRecorder, fieldError, lockMatter, NO_ZONE_STATE, recordedFor, tableRefusal, thrownState } from "@/lib/matter/act";
import { matterFactsOf } from "@/lib/matter/load";
import { matterApproved, sendFaults } from "@/lib/matter/matter";
import { refusalText } from "@/lib/certificate/fault-text";
import { noFormFault } from "@/lib/certificate/form-needs";
import type { CertificateKind } from "@/lib/certificate/types";
import { openCertificate } from "@/lib/certificate/write";
import { latestVersion } from "@/lib/contract/baseline";
import { baselineRows, valuesOf } from "@/lib/contract/load";
import { formatDate } from "@/lib/format";
import { senFromDecimal } from "@/lib/money";
import { eotSnapshot } from "@/lib/time/certificate";
import { grantedExtension, lapsedPolicies, newCompletion, raiseFaults, scopeDate } from "@/lib/time/extension";
import { claimsCommitteeFaults, lossRecordFaults, lossSendFaults, lossValueFaults } from "@/lib/time/loss-expense";
import { PERIOD_PRECONDITIONS, periodMovedFaults, periodRecordFaults, periodSendFaults } from "@/lib/time/period";
import { matterSeriesSet, sendMatterRoute } from "@/lib/matter/route-write";
import { closeMatter, matterLabel, openMatter } from "@/lib/matter/write";
import { baselineOn } from "@/lib/payment/load";
import { answerFaults, determinationEffect, determinationFaults, exclusionOf, instrumentFaults, noticeFaults, openFaults, reasonFaults } from "@/lib/time/entitlement";
import { timeRefusal } from "@/lib/time/labels";
import { eotCondOf } from "@/lib/time/route";
import { BEST_ENDEAVOURS, CONCURRENCIES, DELAY_NOTICE_PATHS, ENTITLEMENTS, EOT_PACK_ITEMS, FINANCIAL_IMPACTS, type EotInstrumentKind, type Finding, type PackAnswer } from "@/lib/time/types";
import { FormReader } from "@/lib/validate";
import { toAuditActor, staffForAct } from "@/app/_auth/actor";
import { beginAct } from "@/app/_auth/act";
import type { AuditActor } from "@/lib/auth/types";
import type { OrgScope } from "@/lib/org-scope";

/**
 * Delays and extensions of time on a contract (6.13 Part B run 1b: FR-EOT-001–007; design note 6.13B-run1b-design.md
 * §6.1–6.5). Every act reads the server's clock once on entry (to the second), runs in `inContract` (the contract's
 * chain locked in the canonical order, the EOT family's row of the act × status table asked, CANCELLED first, an unset
 * time zone refused), locks the matter and then its claim (`lockMatter`: ContractMatter the first domain row), re-reads
 * the rows on the locked transaction, re-runs the pure rule, writes, and audits before and after in the same
 * transaction. A refusal throws, so nothing is half-written. The signed-in officer is named on every audit row and every act is attributed in its own
 * transaction (`beginAct`, Phase 2b): the officer's own, or, from a paper record, recorded for the S.O. or a representative and not signed.
 */

/// The contract's lock, the act × status table's row for the act's family (CANCELLED first), the organisation's day, then
/// the act (BD-613-130: the gate is asked here, in this file, as in every contract action file).
async function inContract(scope: OrgScope, actor: AuditActor, id: string, now: Date, family: ContractAct, fn: (c: ActCtx) => Promise<FormState>, alsoRevalidate: readonly string[] = []): Promise<FormState> {
  let result: FormState | null;
  try {
    result = await withLockedContract(scope.organisationId, id, async (tx, l) => {
      const refused = actStatusFault(family, l.contract.status as ContractStatus);
      if (refused) return tableRefusal(refused);
      const c = actCtx(tx, l, now, actor);
      return c ? fn(c) : NO_ZONE_STATE;
    });
  } catch (e) {
    return thrownState(e);
  }
  return afterAct(id, result, alsoRevalidate);
}

const idOf = (data: FormData) => String(data.get("id") ?? "");
const tri = (v: string | null) => (v === "yes" ? true : v === "no" ? false : null);
const refuse = (lead: string, fs: readonly Finding[]): never => {
  throw new ActRefusal({ ok: false, message: timeRefusal(lead, fs) });
};
const audit = (c: ActCtx, entity: string, id: string, label: string, action: "CREATE" | "UPDATE" | "DELETE", changes: ReturnType<typeof diffFields>, reason = "") =>
  action === "UPDATE" && changes.length === 0 ? Promise.resolve() : writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity, entityId: id, entityLabel: label, reason }, action, changes);

/// The claim of a matter, locked (the matter first, then the claim).
async function lockClaim(c: ActCtx, claimId: string) {
  const pre = await c.tx.eotClaim.findFirst({ where: { id: claimId, contractId: c.l.contract.id, organisationId: c.l.org.id }, select: { matterId: true } });
  if (!pre) throw new ActRefusal({ ok: false, message: "That claim is not on this contract." });
  const { m } = await lockMatter(c, pre.matterId);
  if (!m.eotClaim) throw new ActRefusal({ ok: false, message: "That claim is not on this contract." });
  return { m, claim: m.eotClaim };
}

/// The contract type's time instrument and its name (BD-613-116's act-side reading of eotInstrumentKind).
async function instrumentOf(c: ActCtx): Promise<{ kind: EotInstrumentKind | null; name: string }> {
  const t = c.l.ex.contractTypeCode ? await c.tx.contractType.findFirst({ where: { organisationId: c.l.org.id, code: c.l.ex.contractTypeCode }, select: { eotInstrumentKind: true, nameEn: true } }) : null;
  return { kind: (t?.eotInstrumentKind ?? null) as EotInstrumentKind | null, name: t?.nameEn ?? "of this contract" };
}

const claimLabel = (c: ActCtx, m: { kind: string; reference: string | null }) => matterLabel(c.l, m);

// ------------------------------------------------------------------ FR-EOT-001: the delay notice

export async function recordDelayNotice(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const path = r.choice("path", "How it came", DELAY_NOTICE_PATHS, { required: true });
  const cause = r.text("cause", "The cause of the delay", { required: true, max: 4000 });
  const occurredOn = r.date("occurredOn", "The delay occurred on", { required: true });
  const receivedOn = r.date("receivedOn", "Received on", { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || !path || !occurredOn || !receivedOn) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "DelayNotice.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "EOT", async (c) => {
    const fs = noticeFaults({ cause, occurredOn: storedDay(occurredOn), receivedOn: storedDay(receivedOn), today: c.today });
    if (fs.length) refuse("Not recorded:", fs);
    const who = await recordedFor(c, act, { act: "CONTRACTOR_COMMUNICATION" }, storedDay(receivedOn));
    const row = await c.tx.delayNotice.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, path, cause: cause.trim(), occurredOn, receivedOn, receivedAt: c.now, personId: who.person.id, note: note.trim(), recordedAt: c.now } });
    await audit(c, "DelayNotice", row.id, `${c.label} · delay notice of ${storedDay(receivedOn)}`, "CREATE", diffFields(null, { delayNotice: path === "SO_DIRECTION" ? "the S.O.'s direction to give reasons" : "the contractor's notice", cause: cause.trim(), occurredOn: storedDay(occurredOn), receivedOn: storedDay(receivedOn), receivedFor: who.person.name }));
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

// ------------------------------------------------------------------ FR-EOT-002–006: the claim

export async function openEotClaim(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const noticeIds = data.getAll("noticeId").map(String).filter(Boolean);
  const scope = r.choice("scope", "Covers", ["WHOLE", "SECTION"] as const, { required: true });
  const sectionRef = r.optionalText("sectionRef");
  const groundClause = r.text("groundClause", "Ground (clause)", { max: 240 });
  const cause = r.text("cause", "Cause", { max: 4000 });
  const programmeId = r.optionalText("programmeId");
  const proposedDays = r.int("proposedDays", "Days proposed", { required: true, min: 0 });
  const financialImpact = r.choice("financialImpact", "Financial impact", FINANCIAL_IMPACTS, { required: true });
  const isWeather = r.bool("isWeather");
  const excludedByConditionId = r.optionalText("excludedByConditionId");
  if (r.failed || !scope || proposedDays == null || !financialImpact) return { ok: false, errors: r.errors };
  // The claim and its matter are recorded by one person: the matter's slot, and the claim's beside it.
  const begun = await beginAct(actor, data, "ContractMatter.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "EOT", async (c) => {
    const who = await recordedFor(c, act, { act: "CONTRACTOR_COMMUNICATION" }, c.today);
    const notices = noticeIds.length ? await c.tx.delayNotice.findMany({ where: { id: { in: noticeIds }, organisationId: c.l.org.id }, select: { id: true, contractId: true } }) : [];
    const programme = programmeId ? await c.tx.workProgramme.findFirst({ where: { id: programmeId, contractId: c.l.contract.id, organisationId: actor.organisationId }, select: { id: true, decision: true } }) : null;
    const baseline = baselineOn(c.l, c.today);
    const instrument = await instrumentOf(c);
    if (excludedByConditionId && !(await c.tx.awardCondition.findFirst({ where: { id: excludedByConditionId, awardId: c.l.award.id, award: { organisationId: actor.organisationId } }, select: { id: true } }))) fieldError("excludedByConditionId", "That condition is not of this contract's award.");
    const fs = openFaults({
      notices: noticeIds.map((id) => ({ onContract: notices.some((n) => n.id === id && n.contractId === c.l.contract.id) })),
      scope,
      sectionKnown: scope === "SECTION" ? !!baseline?.values.sections.some((s) => s.ref === sectionRef) : null,
      groundClause,
      cause,
      programme: programme ? { approved: programme.decision === "APPROVED" } : null,
      proposedDays,
      instrument: instrumentFaults(instrument.kind, "EOT", instrument.name),
    });
    if (fs.length) refuse("Not recorded:", fs);
    const matterId = await openMatter(c.tx, toAuditActor(actor), c.l, "EOT", act, who.person.name, c.now);
    const row = await c.tx.eotClaim.create({
      data: { organisationId: c.l.org.id, matterId, contractId: c.l.contract.id, scope, sectionRef: scope === "SECTION" ? sectionRef : null, groundClause: groundClause.trim(), cause: cause.trim(), programmeId: programme!.id, financialImpact, proposedDays, isWeather, pack: [] as unknown as Prisma.InputJsonValue, excludedByConditionId, personId: who.person.id, recordedAt: c.now },
    });
    for (const n of notices) await c.tx.eotClaimNotice.create({ data: { organisationId: c.l.org.id, claimId: row.id, noticeId: n.id } });
    await audit(c, "EotClaim", row.id, claimLabel(c, { kind: "EOT", reference: null }), "CREATE", diffFields(null, { covers: scope === "SECTION" ? `section ${sectionRef}` : "the whole works", ground: groundClause.trim(), cause: cause.trim(), daysProposed: proposedDays, financialImpact: financialImpact === "OTHER" ? "a financial impact not due to an authority requirement" : financialImpact === "AUTHORITY_REQUIREMENT" ? "a financial impact due to an authority requirement" : "no financial impact", weatherClaim: isWeather ? "yes" : "no", restsOn: `${notices.length} delay notice(s)`, recordedBy: who.person.name }));
    await act.writeAlso(c.tx, "EotClaim.person", row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

function readPack(data: FormData): PackAnswer[] {
  return EOT_PACK_ITEMS.map((item) => ({ item, text: String(data.get(`pack_${item}`) ?? "").trim().slice(0, 4000), notRequired: data.get(`pack_${item}_notRequired`) != null }));
}

export async function answerEotClaim(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const claimId = r.text("claimId", "Claim", { required: true });
  const actualDelayDays = r.int("actualDelayDays", "Actual delay (days)", { min: 0 });
  const exceptional = tri(r.optionalText("exceptional"));
  const earthworksDays = r.int("earthworksDays", "Earthworks drying days", { min: 0 });
  const canComplete = tri(r.optionalText("canComplete"));
  const estimatedCompletion = r.date("estimatedCompletion", "Estimated completion");
  const estimate = r.money("lossExpenseEstimate", "Loss-and-expense estimate");
  const pack = readPack(data);
  if (r.failed) return { ok: false, errors: r.errors };
  // The answer has its own slot, `EotClaim.answeredBy`, so one answer is attributed the same way whether or not it carries a loss-and-expense estimate (the estimate's record
  // is attributed beside it, through the same act).
  const begun = await beginAct(actor, data, "EotClaim.answeredBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "EOT", async (c) => {
    const { m, claim } = await lockClaim(c, claimId);
    const who = await recordedFor(c, act, { act: "CONTRACTOR_COMMUNICATION" }, c.today);
    const fs = answerFaults({ closed: m.closedAt ? { reason: m.closeReason } : null, determined: claim.entitlement != null, canComplete, estimatedCompletion: day(estimatedCompletion), actualDelayDays, earthworksDays });
    if (fs.length) refuse("Not recorded:", fs);
    const moved = await c.tx.eotClaim.updateMany({ where: { id: claim.id, entitlement: null }, data: { actualDelayDays, exceptional: claim.isWeather ? exceptional : null, earthworksDays, canComplete, estimatedCompletion, pack: pack as unknown as Prisma.InputJsonValue, answeredByPersonId: who.person.id } });
    if (moved.count !== 1) throw new ActRefusal({ ok: false, message: "The claim changed while this was being saved. Reload and try again." });
    await act.write(c.tx, claim.id, { roleCode: who.soRoleCode });
    // FR-EOT-006: the loss-and-expense estimate creates (or, while unvalued and unsent, updates) its linked record.
    if (estimate) {
      const linked = claim.lossExpenseClaims.find((x) => x.valued == null && x.matterId == null) ?? null;
      if (linked) {
        await c.tx.lossExpenseClaim.updateMany({ where: { id: linked.id, valued: null, matterId: null }, data: { claimed: estimate } });
        await act.writeAlso(c.tx, "LossExpenseClaim.person", linked.id, { roleCode: who.soRoleCode });
      } else {
        const made = await c.tx.lossExpenseClaim.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, claimId: claim.id, claimed: estimate, personId: who.person.id, recordedAt: c.now } });
        await act.writeAlso(c.tx, "LossExpenseClaim.person", made.id, { roleCode: who.soRoleCode });
      }
    }
    await audit(c, "EotClaim", claim.id, claimLabel(c, m), "UPDATE", diffFields(
      { actualDelayDays: claim.actualDelayDays, exceptional: claim.exceptional == null ? null : claim.exceptional ? "yes" : "no", earthworksDays: claim.earthworksDays, canComplete: claim.canComplete == null ? null : claim.canComplete ? "yes" : "no", estimatedCompletion: day(claim.estimatedCompletion) },
      { actualDelayDays, exceptional: exceptional == null ? null : exceptional ? "yes" : "no", earthworksDays, canComplete: canComplete == null ? null : canComplete ? "yes" : "no", estimatedCompletion: day(estimatedCompletion), submissionPack: pack.map((p) => `${p.item}: ${p.notRequired ? "not required" : p.text ? "answered" : "not answered"}`).join("; "), lossAndExpenseEstimate: estimate ? formatMoney(parseSen(estimate)) : null, recordedBy: who.person.name }));
    return { ok: true };
  });
}

export async function addEotReason(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const claimId = r.text("claimId", "Claim", { required: true });
  const clause = r.text("clause", "Clause", { max: 240 });
  const reason = r.text("reason", "Reason", { max: 2000 });
  const delayFrom = r.date("delayFrom", "Delay from", { required: true });
  const delayUntil = r.date("delayUntil", "Delay until (the first day not delayed)", { required: true });
  const extensionDays = r.int("extensionDays", "Extension (days)", { required: true, min: 0 });
  const concurrency = r.choice("concurrency", "Concurrent or consecutive", CONCURRENCIES, { required: true });
  const group = r.optionalText("group");
  if (r.failed || !delayFrom || !delayUntil || extensionDays == null || !concurrency) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "EOT", async (c) => {
    const { m, claim } = await lockClaim(c, claimId);
    const fs = reasonFaults({ closed: m.closedAt ? { reason: m.closeReason } : null, determined: claim.entitlement != null, clause, reason, delayFrom: storedDay(delayFrom), delayUntil: storedDay(delayUntil), extensionDays, concurrency, group });
    if (fs.length) refuse("Not recorded:", fs);
    const row = await c.tx.eotReason.create({ data: { organisationId: c.l.org.id, claimId: claim.id, clause: clause.trim(), reason: reason.trim(), delayFrom, delayUntil, extensionDays, concurrency, group: concurrency === "CONCURRENT" ? group!.trim() : null, sortOrder: claim.reasons.length } });
    await audit(c, "EotReason", row.id, `${claimLabel(c, m)} · reason`, "CREATE", diffFields(null, { clause: clause.trim(), reason: reason.trim(), delayFrom: storedDay(delayFrom), delayUntil: storedDay(delayUntil), extensionDays, runs: concurrency === "CONCURRENT" ? `concurrently (group ${group})` : "consecutively" }));
    return { ok: true };
  });
}

export async function removeEotReason(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const reasonId = r.text("reasonId", "Reason", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "EOT", async (c) => {
    const pre = await c.tx.eotReason.findFirst({ where: { id: reasonId, claim: { contractId: c.l.contract.id }, organisationId: actor.organisationId }, select: { claimId: true } });
    if (!pre) return { ok: false, message: "That reason is not on this contract." };
    const { m, claim } = await lockClaim(c, pre.claimId);
    if (m.closedAt || claim.entitlement != null) refuse("Not removed:", m.closedAt ? [{ code: "CLAIM_CLOSED", level: "block", data: { reason: m.closeReason } }] : [{ code: "CLAIM_DETERMINED", level: "block" }]);
    const row = claim.reasons.find((x) => x.id === reasonId)!;
    await c.tx.eotReason.delete({ where: { id: reasonId, organisationId: actor.organisationId } });
    await audit(c, "EotReason", reasonId, `${claimLabel(c, m)} · reason`, "DELETE", diffFields({ clause: row.clause, reason: row.reason, extensionDays: row.extensionDays }, { clause: null, reason: null, extensionDays: null }));
    return { ok: true };
  });
}

/// FR-EOT-002–005: the S.O.'s determination. Not entitled closes the claim and opens the damages decision.
export async function determineEotClaim(_prev: FormState, data: FormData): Promise<FormState> {
  const holderGuard = await staffForAct("HOLDER_CHECKED");
  if (!holderGuard.ok) return holderGuard.state;
  const actor = holderGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const claimId = r.text("claimId", "Claim", { required: true });
  const entitlement = r.choice("entitlement", "Entitled", ENTITLEMENTS);
  const reason = r.text("entitlementReason", "Why", { max: 4000 });
  const bestEndeavours = r.choice("bestEndeavours", "Best endeavours", BEST_ENDEAVOURS);
  const overrideReason = r.text("exclusionOverrideReason", "Why the condition is overridden", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  // The determination is the S.O.'s: signed with their password, or recorded from their paper by someone else, and dated by the server (Phase 2b).
  const begun = await beginAct(actor, data, "EotClaim.determinedBy", { personField: "personId", document: { entity: "EotClaim", id: claimId } });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "EOT", async (c) => {
    const { m, claim } = await lockClaim(c, claimId);
    const who = await recordedFor(c, act, { soOnly: true }, c.today);
    const cond = claim.excludedByCondition;
    const exclusion = exclusionOf(cond ? [{ id: cond.id, name: cond.kindName, excludesEot: cond.excludesEot, satisfiedOn: day(cond.satisfiedOn) }] : [], claim.excludedByConditionId);
    const i = {
      closed: m.closedAt ? { reason: m.closeReason } : null,
      determined: claim.entitlement != null,
      entitlement: entitlement ?? null,
      reason,
      bestEndeavours: bestEndeavours ?? null,
      isWeather: claim.isWeather,
      exceptional: claim.exceptional,
      meteorologicalAttached: claim.attachments.some((a) => a.purpose === "METEOROLOGICAL_RECORD" && !a.version.withdrawnAt),
      pack: Array.isArray(claim.pack) ? (claim.pack as unknown as PackAnswer[]) : [],
      actualDelayDays: claim.actualDelayDays,
      reasons: claim.reasons.length,
      exclusion,
      overrideReason,
    };
    const fs = determinationFaults(i);
    if (fs.length) refuse("Not determined:", fs);
    const moved = await c.tx.eotClaim.updateMany({ where: { id: claim.id, entitlement: null }, data: { entitlement, entitlementReason: reason.trim(), bestEndeavours: entitlement === "ENTITLED" ? bestEndeavours : null, exclusionOverrideReason: exclusion ? overrideReason.trim() : "", determinedOn: dayToDate(c.today), determinedByPersonId: who.person.id } });
    if (moved.count !== 1) throw new ActRefusal({ ok: false, message: "The claim changed while this was being saved. Reload and try again." });
    await audit(c, "EotClaim", claim.id, claimLabel(c, m), "UPDATE", diffFields({ entitlement: null }, { entitlement: entitlement === "ENTITLED" ? "entitled" : "not entitled", why: reason.trim(), bestEndeavours: entitlement === "ENTITLED" ? bestEndeavours : null, conditionOverridden: exclusion && overrideReason.trim() ? `${exclusion.name}: ${overrideReason.trim()}` : null, determinedBy: who.person.name }), exclusion ? overrideReason.trim() : "");
    await act.write(c.tx, claim.id, { roleCode: who.soRoleCode });
    // FR-EOT-002: a failed entitlement closes the EOT path (its matter) and opens the damages decision.
    const effect = determinationEffect({ entitlement: entitlement ?? null, reason });
    if (effect.closeMatter) await closeMatter(c.tx, toAuditActor(actor), c.l, m, effect.closeMatter, c.now);
    return { ok: true, message: effect.opensDamages ? "Determined not entitled: the claim is closed, and the damages decision may now be recorded (Payments › Damages)." : undefined };
  });
}

/// FR-EOT-007: send an entitled claim for approval, routed on the cause of its financial impact.
export async function sendEotClaim(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const claimId = r.text("claimId", "Claim", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "ApprovalInstance.submittedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "EOT", async (c) => {
    const { m, claim } = await lockClaim(c, claimId);
    const sender = await recordedFor(c, act, { act: "CONTRACTOR_COMMUNICATION" }, c.today);
    const cond = eotCondOf(claim.financialImpact);
    const fs: Finding[] = [];
    if (claim.entitlement !== "ENTITLED" && !m.closedAt) fs.push({ code: "NOT_DETERMINED", level: "block" });
    fs.push(...sendFaults(matterFactsOf(m, await matterSeriesSet(c.tx, c.l.org.id)), { value: null, ratio: null, cond }));
    if (fs.length) refuse("Not sent for approval:", fs);
    const baseline = baselineOn(c.l, c.today);
    if (!baseline) refuse("Not sent for approval:", [{ code: "NO_DATE_FOR_COMPLETION", level: "block" }]);
    await sendMatterRoute(c, m, { value: null, ratio: null, cond, contractValue: baseline!.values.contractSum, submittedBy: sender.person, act, what: "Extension of time" });
    return { ok: true };
  });
}

// ------------------------------------------------------------------ FR-EOT-003, 008, 009: the EOT certificate

/// The latest version's values (what the version writer extends at issue; EOT_MOVED compares against the same).
const latestValues = (c: ActCtx) => {
  const v = latestVersion(baselineRows(c.l.contract).versions);
  return v ? valuesOf(v) : null;
};
const sectionsOf = (v: NonNullable<ReturnType<typeof latestValues>>) => ({ dateForCompletion: v.dateForCompletion, sections: v.sections.map((x) => ({ ref: x.ref, extensionDays: x.extensionDays ?? 0 })) });

/// The form a kind prints on: refused where it is not set (TEMPLATE_NOT_SET, naming where it is chosen). No routing type:
/// the approval of record is the matter's own route.
async function formOf(c: ActCtx, kind: CertificateKind): Promise<string> {
  const s = await c.tx.certificateKindSetting.findUnique({ where: { organisationId_kind: { organisationId: c.l.org.id, kind } }, select: { templateId: true } });
  if (!s?.templateId) throw new ActRefusal({ ok: false, message: refusalText("Not raised:", [noFormFault(kind)]) });
  return s.templateId;
}

/// FR-EOT-003, 008: raise the EOT certificate on an approved claim (design note §6.6). The officer states the days granted
/// (OD-B6 A); the reasons' computed days are shown beside them, assumed, and a difference only warns.
export async function raiseEotCertificate(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const claimId = r.text("claimId", "Claim", { required: true });
  const grantedDays = r.int("grantedDays", "Days granted", { required: true, min: 0 });
  const unextendedNote = r.text("unextendedNote", "Period not extended", { max: 2000 });
  if (r.failed || grantedDays == null) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "ExtensionOfTime.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "EOT", async (c) => {
    const { m, claim } = await lockClaim(c, claimId);
    const who = await recordedFor(c, act, { soOnly: true }, c.today);
    const v = latestValues(c);
    const previous = v ? scopeDate(sectionsOf(v), claim.scope as "WHOLE" | "SECTION", claim.sectionRef) : null;
    const live = claim.extensions.find((x) => x.certificate.status !== "VOID") ?? null;
    const fs = raiseFaults({ entitled: claim.entitlement === "ENTITLED" && !m.closedAt, matterApproved: matterApproved(matterFactsOf(m)), live: live ? { number: live.certificate.number } : null, grantedDays, bestEndeavours: claim.bestEndeavours, unextendedNote, previousCompletion: previous });
    if (fs.length) refuse("Not raised:", fs);
    const templateId = await formOf(c, "EOT");
    const g = grantedExtension(claim.reasons, grantedDays);
    const next = newCompletion(previous!, grantedDays);
    // FR-EOT-009: the verified policies whose cover ends before the new date, offered for the S.O.'s self-help (frozen here).
    const policies = await c.tx.insurancePolicy.findMany({ where: { contractId: c.l.contract.id }, select: { id: true, kind: true, policyNo: true, periodEnd: true, status: true, sumInsured: true } });
    const offered = lapsedPolicies(policies.map((p) => ({ ...p, periodEnd: storedDay(p.periodEnd), sumInsured: senFromDecimal(p.sumInsured) })), next).map((p) => ({ id: p.id, kind: p.kind, policyNo: p.policyNo, periodEnd: p.periodEnd }));
    const computed = eotSnapshot({ today: c.today, scope: claim.scope as "WHOLE" | "SECTION", sectionRef: claim.sectionRef, previous: previous!, granted: grantedDays, computed: g.computed, next, unextendedNote });
    const certId = await openCertificate(c.tx, toAuditActor(actor), c.l, { kind: "EOT", templateId, routingTypeId: null, sectionId: null, computed }, c.now, c.today);
    const row = await c.tx.extensionOfTime.create({ data: { organisationId: c.l.org.id, certificateId: certId, claimId: claim.id, grantedDays, computedDays: g.computed, previousCompletion: dayToDate(previous!), newCompletion: dayToDate(next), unextendedNote: unextendedNote.trim(), insuranceOffered: offered as unknown as Prisma.InputJsonValue, personId: who.person.id, recordedAt: c.now } });
    await audit(c, "ExtensionOfTime", row.id, `${claimLabel(c, m)} · extension of time`, "CREATE", diffFields(null, { daysGranted: grantedDays, reasonsComputed: `${g.computed} days (assumed)`, previousDateForCompletion: previous, newDateForCompletion: next, periodNotExtended: unextendedNote.trim() || null, policiesEndingBefore: offered.map((p) => `${p.policyNo || p.kind} (${p.periodEnd})`).join(", ") || null, raisedFor: who.person.name }));
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true, message: g.warnings.length ? timeRefusal("Raised.", g.warnings) : undefined };
  });
}

// ------------------------------------------------------------------ FR-EOT-006: loss and expense (design note §6.8)

/// The loss-and-expense claim, locked (its matter first, where it has one).
async function lockLoss(c: ActCtx, lossId: string) {
  const pre = await c.tx.lossExpenseClaim.findFirst({ where: { id: lossId, contractId: c.l.contract.id, organisationId: c.l.org.id }, select: { id: true, matterId: true } });
  if (!pre) throw new ActRefusal({ ok: false, message: "That loss-and-expense claim is not on this contract." });
  if (pre.matterId) await c.tx.$queryRaw`SELECT id FROM "ContractMatter" WHERE id = ${pre.matterId} FOR UPDATE`;
  await c.tx.$queryRaw`SELECT id FROM "LossExpenseClaim" WHERE id = ${pre.id} FOR UPDATE`;
  return c.tx.lossExpenseClaim.findFirstOrThrow({ where: { id: pre.id, organisationId: c.l.org.id }, include: { claim: { select: { matter: { select: { reference: true } } } } } });
}
const lossLabel = (c: ActCtx, l: { claim: { matter: { reference: string | null } } | null }) => `${c.label} · loss and expense${l.claim ? ` on ${l.claim.matter.reference ?? "an extension-of-time claim"}` : ""}`;

export async function recordLossExpense(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const claimed = r.money("claimed", "Amount claimed", { required: true });
  const eotClaimId = r.optionalText("eotClaimId");
  if (r.failed || !claimed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "LossExpenseClaim.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "LOSS_EXPENSE", async (c) => {
    const who = await recordedFor(c, act, { act: "CONTRACTOR_COMMUNICATION" }, c.today);
    const fs = lossRecordFaults({ claimed: parseSen(claimed) });
    if (fs.length) refuse("Not recorded:", fs);
    const eot = eotClaimId ? await c.tx.eotClaim.findFirst({ where: { id: eotClaimId, contractId: c.l.contract.id, organisationId: c.l.org.id }, select: { id: true, matter: { select: { reference: true } } } }) : null;
    if (eotClaimId && !eot) fieldError("eotClaimId", "That claim is not on this contract.");
    const row = await c.tx.lossExpenseClaim.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, claimId: eot?.id ?? null, claimed, personId: who.person.id, recordedAt: c.now } });
    await audit(c, "LossExpenseClaim", row.id, lossLabel(c, { claim: eot }), "CREATE", diffFields(null, { amountClaimed: formatMoney(parseSen(claimed)), onExtensionOfTime: eot ? (eot.matter.reference ?? "an unnumbered claim") : null, recordedFor: who.person.name }));
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

export async function valueLossExpense(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const lossId = r.text("lossId", "Claim", { required: true });
  const valued = r.money("valued", "Value", { required: true });
  const basis = r.text("basis", "How it was valued", { max: 4000 });
  const valuedOn = r.date("valuedOn", "Valued on", { required: true });
  if (r.failed || !valued || !valuedOn) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "LossExpenseClaim.valuedBy", { personField: "personId", dateField: "valuedOn" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "LOSS_EXPENSE", async (c) => {
    const x = await lockLoss(c, lossId);
    const who = await recordedFor(c, act, { act: "VALUATION" }, c.today);
    const fs = lossValueFaults({ sent: x.matterId != null, valued: parseSen(valued), basis, valuedOn: storedDay(valuedOn), today: c.today });
    if (fs.length) refuse("Not valued:", fs);
    const moved = await c.tx.lossExpenseClaim.updateMany({ where: { id: x.id, matterId: null }, data: { valued, basis: basis.trim(), valuedOn, valuedByPersonId: who.person.id } });
    if (moved.count !== 1) throw new ActRefusal({ ok: false, message: "The claim changed while this was being saved. Reload and try again." });
    await audit(c, "LossExpenseClaim", x.id, lossLabel(c, x), "UPDATE", diffFields({ value: x.valued == null ? null : formatMoney(senFromDecimal(x.valued)), valuedOn: day(x.valuedOn) }, { value: formatMoney(parseSen(valued)), basis: basis.trim(), valuedOn: storedDay(valuedOn), valuedBy: who.person.name }));
    await act.write(c.tx, x.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

/// Send a valued claim on `loss_expense` at its valued amount; its matter is opened at the first send. Where the contract
/// type names a claims committee, the route's committee step must be it (OD-B20).
export async function sendLossExpense(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const lossId = r.text("lossId", "Claim", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "ApprovalInstance.submittedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "LOSS_EXPENSE", async (c) => {
    const x = await lockLoss(c, lossId);
    const sender = await recordedFor(c, act, { act: "CONTRACTOR_COMMUNICATION" }, c.today);
    const valued = x.valued == null ? null : senFromDecimal(x.valued);
    const own = lossSendFaults({ valued });
    if (own.length) refuse("Not sent for approval:", own);
    let matterId = x.matterId;
    if (!matterId) {
      matterId = await openMatter(c.tx, toAuditActor(actor), c.l, "LOSS_EXPENSE", asMatterRecorder(act), sender.person.name, c.now);
      await c.tx.lossExpenseClaim.update({ where: { id: x.id, organisationId: c.l.org.id }, data: { matterId } });
    }
    const { m } = await lockMatter(c, matterId);
    const fs = sendFaults(matterFactsOf(m, await matterSeriesSet(c.tx, c.l.org.id)), { value: valued, ratio: null, cond: null });
    if (fs.length) refuse("Not sent for approval:", fs);
    const baseline = baselineOn(c.l, c.today);
    if (!baseline) refuse("Not sent for approval:", [{ code: "NO_DATE_FOR_COMPLETION", level: "block" }]);
    const type = c.l.ex.contractTypeCode ? await c.tx.contractType.findFirst({ where: { organisationId: c.l.org.id, code: c.l.ex.contractTypeCode }, select: { claimsCommittee: { select: { code: true, nameEn: true } } } }) : null;
    const claims = type?.claimsCommittee ? { code: type.claimsCommittee.code, name: type.claimsCommittee.nameEn } : null;
    await sendMatterRoute(c, m, { value: valued, ratio: null, cond: null, contractValue: baseline!.values.contractSum, submittedBy: sender.person, act, chainCheck: (codes, nameOf) => claimsCommitteeFaults(codes, claims, nameOf), what: "Loss and expense" });
    return { ok: true };
  });
}

// ------------------------------------------------------------------ FR-EOT-011–013: the extension of the contract period (design note §6.7)

export async function recordPeriodExtension(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const answers = Object.fromEntries(PERIOD_PRECONDITIONS.map((p) => [p, r.choice(p, "Confirmed", ["yes", "no"] as const, { required: true })])) as Record<(typeof PERIOD_PRECONDITIONS)[number], "yes" | "no" | null>;
  const newExpiry = r.date("newExpiry", "New expiry", { required: true });
  const financialImpact = r.money("financialImpact", "Financial impact");
  const reason = r.text("reason", "Why it is extended", { max: 4000 });
  if (r.failed || !newExpiry) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "PeriodExtension.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "PERIOD_EXTENSION", async (c) => {
    const who = await recordedFor(c, act, { act: "CONTRACTOR_COMMUNICATION" }, c.today);
    const instrument = await instrumentOf(c);
    const current = latestValues(c)?.dateForCompletion ?? null;
    const fs = periodRecordFaults({ instrument: instrumentFaults(instrument.kind, "PERIOD", instrument.name), currentExpiry: current, newExpiry: storedDay(newExpiry), reason, financialImpact: financialImpact ? parseSen(financialImpact) : null });
    if (fs.length) refuse("Not recorded:", fs);
    const matterId = await openMatter(c.tx, toAuditActor(actor), c.l, "PERIOD_EXTENSION", asMatterRecorder(act), who.person.name, c.now);
    const yes = (p: (typeof PERIOD_PRECONDITIONS)[number]) => answers[p] === "yes";
    const row = await c.tx.periodExtension.create({ data: { organisationId: c.l.org.id, matterId, contractId: c.l.contract.id, priorAgreement: yes("priorAgreement"), termsRetained: yes("termsRetained"), ratesRetained: yes("ratesRetained"), performanceSatisfactory: yes("performanceSatisfactory"), spanConfirmed: yes("spanConfirmed"), currentExpiry: dayToDate(current!), newExpiry, financialImpact, reason: reason.trim(), personId: who.person.id, recordedAt: c.now } });
    await audit(c, "PeriodExtension", row.id, `${c.label} · extension of the contract period`, "CREATE", diffFields(null, { currentExpiry: formatDate(current!), newExpiry: formatDate(storedDay(newExpiry)), financialImpact: financialImpact ? formatMoney(parseSen(financialImpact)) : "none", why: reason.trim(), preconditionsConfirmed: PERIOD_PRECONDITIONS.filter((p) => yes(p)).length + " of " + PERIOD_PRECONDITIONS.length, recordedFor: who.person.name }));
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

/// The period extension of a matter, locked (the matter first, then the record).
async function lockPeriod(c: ActCtx, extensionId: string) {
  const pre = await c.tx.periodExtension.findFirst({ where: { id: extensionId, contractId: c.l.contract.id, organisationId: c.l.org.id }, select: { matterId: true } });
  if (!pre) throw new ActRefusal({ ok: false, message: "That extension is not on this contract." });
  const { m } = await lockMatter(c, pre.matterId);
  if (!m.periodExtension) throw new ActRefusal({ ok: false, message: "That extension is not on this contract." });
  return { m, x: m.periodExtension };
}

export async function sendPeriodExtension(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const extensionId = r.text("extensionId", "Extension", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "ApprovalInstance.submittedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "PERIOD_EXTENSION", async (c) => {
    const { m, x } = await lockPeriod(c, extensionId);
    const sender = await recordedFor(c, act, { act: "CONTRACTOR_COMMUNICATION" }, c.today);
    const value = x.financialImpact == null ? null : senFromDecimal(x.financialImpact);
    const fs = [...periodSendFaults(x), ...sendFaults(matterFactsOf(m, await matterSeriesSet(c.tx, c.l.org.id)), { value, ratio: null, cond: null })];
    if (fs.length) refuse("Not sent for approval:", fs);
    const baseline = baselineOn(c.l, c.today);
    if (!baseline) refuse("Not sent for approval:", [{ code: "NO_DATE_FOR_COMPLETION", level: "block" }]);
    await sendMatterRoute(c, m, { value, ratio: null, cond: null, contractValue: baseline!.values.contractSum, submittedBy: sender.person, act, what: "Extension of the contract period" });
    return { ok: true };
  });
}

/// FR-EOT-013: the supplementary agreement, raised once the extension's matter is approved.
export async function raisePeriodAgreement(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const extensionId = r.text("extensionId", "Extension", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "PeriodAgreement.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "PERIOD_EXTENSION", async (c) => {
    const { m, x } = await lockPeriod(c, extensionId);
    const who = await recordedFor(c, act, { soOnly: true }, c.today);
    const fs: Finding[] = [];
    if (!matterApproved(matterFactsOf(m))) fs.push({ code: "MATTER_NOT_APPROVED", level: "block" });
    const live = x.agreements.find((a) => a.certificate.status !== "VOID");
    if (live) fs.push({ code: "PERIOD_AGREEMENT_LIVE", level: "block", data: { number: live.certificate.number } });
    fs.push(...periodMovedFaults(storedDay(x.currentExpiry), latestValues(c)?.dateForCompletion ?? null));
    if (fs.length) refuse("Not raised:", fs);
    const templateId = await formOf(c, "CONTRACT_PERIOD_AGREEMENT");
    const date = (key: string, labelEn: string, value: string) => ({ key, labelEn, type: "DATE" as const, value, overridable: false });
    const computed = { version: 1 as const, computedOn: c.today, rule: { en: "The contract period's current expiry and the new one agreed." }, lines: [date("periodCurrentExpiry", "Current expiry", storedDay(x.currentExpiry)), date("periodNewExpiry", "New expiry", storedDay(x.newExpiry))], totals: [], routingRatio: null };
    const certId = await openCertificate(c.tx, toAuditActor(actor), c.l, { kind: "CONTRACT_PERIOD_AGREEMENT", templateId, routingTypeId: null, sectionId: null, computed }, c.now, c.today);
    const row = await c.tx.periodAgreement.create({ data: { organisationId: c.l.org.id, certificateId: certId, extensionId: x.id, personId: who.person.id, recordedAt: c.now } });
    await audit(c, "PeriodAgreement", row.id, `${c.label} · contract period agreement`, "CREATE", diffFields(null, { currentExpiry: formatDate(storedDay(x.currentExpiry)), newExpiry: formatDate(storedDay(x.newExpiry)), raisedFor: who.person.name }));
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}
