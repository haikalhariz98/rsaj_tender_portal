/**
 * What 6.4's screens read (plan §5): the exercise's Tender documents tab, its Appendix
 * page, the pack's print view, and Configuration › Tender documents. Each view carries
 * words and formatted figures, never codes; and each action it offers carries whether it
 * is allowed and, if not, why — judged by the same pure rule the action runs under its
 * lock, so a disabled button and a refused post give the same reason. Reads only.
 */

import { dayToDate, todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { ACT_LABEL } from "@/lib/labels";
import { tenderingRoutesOf, latestFirst, requesterHolding } from "@/lib/method/approval";
import { BEHAVIOUR_LABEL, EXERCISE_STATUS_LABEL } from "@/lib/method/labels";
import { evaluationContext, loadExercise } from "@/lib/method/repo";
import { formatSen, parseSen, senToDecimalString } from "@/lib/money";
import { ORGANISATION_CODE } from "@/lib/org";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { holdersFor } from "@/lib/requisition/holders";
import { PROVENANCE_LABEL } from "@/lib/scope/labels";
import { loadScopePolicy } from "@/lib/scope/repo";
import { renderedText, renderWith } from "@/lib/templates/merge";

import { APPENDIX_FIELD_LABEL, appendixComplete, appendixFaults, ladDaily, type AppendixFacts } from "./appendix";
import { BEHAVIOURS_AFTER_AWARD, BEHAVIOURS_CHECKED_HERE, behaviourFaults } from "./behaviour";
import { formLabel, resolveComposition } from "./composition";
import { CONFIG_TIME_ZONE_NOT_SET, configHoldingWorkBack, partRetiredOn } from "./config";
import { PACK_WHITELIST, packFieldValues } from "./fields";
import { appendixText, packManifest, unpricedBqText } from "./freeze";
import {
  appendixFaultText,
  BEHAVIOUR_AFTER_AWARD_WHERE,
  behaviourFaultText,
  LAD_KIND_LABEL,
  NOT_SET,
  PACK_KIND_LABEL,
  PACK_STATUS_LABEL,
  PART_CONTENT_LABEL,
  PART_ROLE_LABEL,
  PART_SOURCE_LABEL,
  PART_STATE_LABEL,
  partFaultText,
  startFaultText,
  submitFindingTexts,
  TENDER_DOCS_CONFIG_PATH,
  tenderingRouteLabel,
  UPLIFT_KIND_LABEL,
  yesNoNotSet,
} from "./labels";
import { blockingOf, isLivePack, markReadyFaults, omitFaults, packEditFault, startPackFaults, submitFaults, nextPack } from "./pack";
import { pickTemplateView } from "./part-view";
import { formatPct } from "./percent";
import { appendixFactsOf, loadConfiguredParts, loadPacks, loadTemplates, loadTenderPolicy, partFactsOf, pinnedFilesOf, profileOf, scopeReadiness, type PackRow } from "./repo";
import { tenderingRouteForRequester, timeIn } from "./tendering";
import type { Finding, PackKind } from "./types";

export type Allowed = { allowed: true } | { allowed: false; reason: string };
const judged = (fs: readonly Finding[], text: (f: Finding) => string = partFaultText): Allowed => {
  const b = fs.filter((f) => f.level === "block");
  return b.length ? { allowed: false, reason: b.map(text).join(" ") } : { allowed: true };
};
const money = (s: bigint | null) => (s == null ? NOT_SET : formatSen(s));
const provenance = (p: string | null | undefined) => (p ? ((PROVENANCE_LABEL as Record<string, string>)[p] ?? NOT_SET) : NOT_SET);
const RECORDED_ON_BEHALF = "recorded on behalf of, not signed";

/// Where each submission finding's family is fixed, for a link.
const FIX_HREF = (exerciseId: string) => ({
  edit: `/sourcing/${exerciseId}?tab=documents`,
  readiness: `/sourcing/${exerciseId}?tab=documents#parts`,
  scope: `/sourcing/${exerciseId}?tab=scope`,
  appendix: `/sourcing/${exerciseId}/appendix`,
  behaviour: "/configuration/reference-data",
  dates: `/sourcing/${exerciseId}?tab=documents#submit`,
  route: "/configuration/approval-matrix",
});

/// What the exercise's pack kind reads as. Null: prepared before document assembly existed.
export function packKindText(kind: PackKind | null): string {
  return kind == null ? "Prepared before document assembly" : PACK_KIND_LABEL[kind];
}

async function context(exerciseId: string) {
  const l = await loadExercise(exerciseId);
  if (!l) return null;
  const [packs, configured, templates, policy, roles, units] = await Promise.all([
    loadPacks(exerciseId),
    loadConfiguredParts(l.org.id),
    loadTemplates(l.org.id),
    loadTenderPolicy(l.org.id),
    db.authorityRole.findMany({ where: { organisationId: l.org.id }, orderBy: { nameEn: "asc" }, select: { code: true, nameEn: true, isCommittee: true } }),
    db.orgUnit.findMany({ where: { organisationId: l.org.id }, select: { code: true, nameEn: true } }),
  ]);
  const unitName = (code: string | null) => (code ? (units.find((u) => u.code === code)?.nameEn ?? "An office no longer configured") : NOT_SET);
  const office = (code: string | null) => (code ? (roles.find((r) => r.code === code)?.nameEn ?? "An office no longer configured") : NOT_SET);
  return { ...l, packs, configured, templates, policy, roles, office, unitName };
}

// ------------------------------------------------------------------ Tender documents tab

export async function documentsTab(exerciseId: string) {
  const c = await context(exerciseId);
  if (!c) return null;
  const { ex, org, req, packs } = c;
  const kind = ex.packKindSnapshot;
  const basis = ex.contractBasisCode ? await db.contractBasis.findFirst({ where: { organisationId: org.id, code: ex.contractBasisCode }, select: { nameEn: true } }) : null;
  const latest = packs[0] ?? null;
  const live = packs.find((p) => isLivePack(p.status)) ?? null;
  const approved = packs.find((p) => p.status === "APPROVED") ?? null;
  const shown = live ?? approved ?? latest;
  const on = org.today;
  const composition = on && kind && kind !== "NONE" ? resolveComposition(c.configured, kind, ex.contractBasisCode, on) : null;
  const start = startPackFaults({ exerciseStatus: ex.status, packKindSnapshot: kind, packs, composition: composition ?? { fault: kind === "NONE" ? "NO_PACK" : "COMPOSITION_NOT_SET" } });
  const next = nextPack(packs);
  const scope = await scopeReadiness(org.id, ex);
  const appendix = shown?.appendix ? appendixFactsOf(shown.appendix) : null;
  const content = { bqFinalised: scope.bill != null, appendixComplete: appendix ? appendixComplete(appendix) : null };

  // The route as it would open, for the submit check (the dates are the drawer's own).
  let route: ReturnType<typeof tenderingRouteForRequester> | null = null;
  let issueInForce = false;
  if (on && shown?.status === "DRAFT") {
    const { issue, ctx, cfg } = await evaluationContext(org, req, ex);
    issueInForce = !!issue && !!ctx;
    const method = cfg.config.methods.find((m) => m.code === ex.sourcingMethodCode) ?? null;
    if (issue && ctx && method) {
      const [roster, delegations, units] = await Promise.all([loadRoster(ORGANISATION_CODE), loadDelegations(ORGANISATION_CODE), db.orgUnit.findMany({ where: { organisationId: org.id } })]);
      const unitPath = pathTo(units as unknown as OrgUnit[], req.sectionUnitCode || req.requestingUnitCode, dayToDate(on)).reverse().map((u) => u.code);
      const value = parseSen(ex.estimatedValue.toString());
      route = tenderingRouteForRequester(ctx.funder, method, Number(senToDecimalString(value)), requesterHolding((code) => holdersFor(code, unitPath, roster, delegations, on), req.requestingPersonId, value, (pid) => roster.people.some((p) => p.id === pid && p.isActive && p.isAvailable)));
    }
  }
  const submit =
    shown?.status === "DRAFT"
      ? submitFaults({
          packStatus: shown.status,
          exerciseStatus: ex.status,
          parts: shown.parts.map(partFactsOf),
          content,
          scope: scope.input,
          appendix,
          profile: profileOf(ex.classificationSnapshot),
          primeCostSums: scope.bill?.primeCostSums ?? null,
          dates: [],
          route: { issue: issueInForce, state: route?.tenderingState ?? (issueInForce ? "NO_METHOD_KEY" : null), refusal: route?.refusal ?? null, errors: (route?.warnings ?? []).filter((w) => w.level === "err").map((w) => w.messageEn) },
          routeOpen: tenderingRoutesOf(ex.approvalInstances).some((i) => i.status === "PENDING"),
        })
      : null;
  const hrefs = FIX_HREF(ex.id);
  const profile = profileOf(ex.classificationSnapshot);
  const behaviourFindings = shown ? behaviourFaults(profile, { appendix, primeCostSums: scope.bill?.primeCostSums ?? null, parts: shown.parts.map(partFactsOf) }) : [];
  const valueText = (k: string) => {
    const v = profile?.find((p) => p.key === k)?.value ?? null;
    return v == null ? NOT_SET : typeof v === "boolean" ? (v ? "Yes" : "No") : Array.isArray(v) ? v.join(", ") : String(v);
  };
  const editable = shown ? packEditFault(shown.status, ex.status) == null : false;

  return {
    exercise: { id: ex.id, reference: ex.reference, title: ex.title, status: EXERCISE_STATUS_LABEL[ex.status] },
    facts: {
      documentPack: packKindText(kind),
      contractBasis: basis?.nameEn ?? NOT_SET,
      standardForm: shown?.formLabelSnapshot ?? (composition && !("fault" in composition) ? (formLabel(composition.parts, (code) => c.templates.find((t) => t.code === code)?.nameEn ?? null) ?? NOT_SET) : NOT_SET),
      version: shown ? `Version ${shown.versionNo}` : "None yet",
      status: shown ? PACK_STATUS_LABEL[shown.status] : "Not started",
    },
    start: start.length ? { allowed: false as const, reason: start.map(startFaultText).join(" ") } : { allowed: true as const, label: next.copyFrom ? `Start version ${next.versionNo} from the returned version ${next.copyFrom.versionNo}` : "Start the tender documents" },
    pack: shown ? packView(shown, c, ex.id, editable, content) : null,
    readiness: submit
      ? submitFindingTexts(submit).map((t) => ({ level: t.level, text: t.text, href: hrefs[t.family] }))
      : [],
    submit: submit ? (blockingOf(submit).length ? { allowed: false as const, reason: "The findings above block it." } : { allowed: true as const }) : { allowed: false as const, reason: shown ? `This version is ${PACK_STATUS_LABEL[shown.status].toLowerCase()}.` : "Start the tender documents first." },
    behaviours: {
      checkedHere: BEHAVIOURS_CHECKED_HERE.map((k) => ({ label: BEHAVIOUR_LABEL[k], value: valueText(k), findings: behaviourFindings.filter((f) => f.data?.behaviour === k || behaviourKeyOf(f.code) === k).map(behaviourFaultText) })),
      afterAward: BEHAVIOURS_AFTER_AWARD.map((b) => ({ label: BEHAVIOUR_LABEL[b.key], value: valueText(b.key), where: BEHAVIOUR_AFTER_AWARD_WHERE[b.where] })),
      notRecorded: profile == null ? behaviourFaultText({ code: "PROFILE_NOT_RECORDED", level: "block" }) : null,
    },
    route: await routeView(ex, org, req),
    dates: approved
      ? { start: formatDate(approved.approvedStartOn), closing: closingText(approved.approvedClosingAt, org.timeZone), approvedOn: formatDate(approved.approvedAt) }
      : shown?.status === "SUBMITTED"
        ? { proposedStart: formatDate(shown.proposedStartOn), proposedClosing: closingText(shown.proposedClosingAt, org.timeZone) }
        : null,
    versions: packs.map((p) => ({
      versionNo: p.versionNo,
      status: PACK_STATUS_LABEL[p.status],
      submittedOn: p.submittedAt ? formatDate(p.submittedAt) : null,
      returnedBecause: p.status === "RETURNED" ? p.returnedReason : null,
      voidBecause: p.status === "VOID" ? p.voidReason : null,
    })),
    printHref: shown ? `/sourcing/${ex.id}/documents/print` : null,
    appendixHref: shown?.appendix ? `/sourcing/${ex.id}/appendix` : null,
  };
}

const behaviourKeyOf = (code: string) =>
  ({ DLP_MONTHS_REQUIRED: "defectsLiabilityApplies", DLP_NOT_FOR_TYPE: "defectsLiabilityApplies", NOMINATION_NOT_FOR_TYPE: "nominationAllowed", BOND_FORMS_REQUIRED: "startRequiresSecurities" })[code] ?? null;

/// The closing as the organisation reads it: "29 Oct 2026, 14:30".
function closingText(at: Date | null, timeZone: string | null): string {
  if (!at) return NOT_SET;
  return timeZone ? `${formatDate(storedDayIn(at, timeZone))}, ${timeIn(at, timeZone)}` : `${formatDate(at)} (time zone not set)`;
}
const storedDayIn = (at: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

function packView(p: PackRow, c: NonNullable<Awaited<ReturnType<typeof context>>>, exerciseId: string, editable: boolean, content: { bqFinalised: boolean; appendixComplete: boolean | null }) {
  const manifest = packManifest(p.manifest);
  return {
    id: p.id,
    versionNo: p.versionNo,
    status: PACK_STATUS_LABEL[p.status],
    frozen: p.frozenAt != null,
    frozenOn: p.frozenAt ? formatDate(p.frozenAt) : null,
    returnedBecause: p.status === "RETURNED" ? p.returnedReason : null,
    parts: p.parts.map((row) => {
      const facts = partFactsOf(row);
      const frozenDocs = p.documents.filter((d) => d.partCode === row.partCode);
      const frozenEntry = manifest?.find((m) => m.partCode === row.partCode) ?? null;
      return {
        id: row.id,
        printedNumber: row.printedNumber,
        label: row.labelSnapshot,
        role: PART_ROLE_LABEL[row.role],
        content: PART_CONTENT_LABEL[row.content],
        source: PART_SOURCE_LABEL[row.source],
        preparedBy: c.unitName(row.ownerOrgUnitCode),
        mandatory: yesNoNotSet(row.mandatory),
        inTableDocument: yesNoNotSet(row.inTableDocument),
        state: PART_STATE_LABEL[row.state],
        stateKey: row.state === "READY" ? ("ok" as const) : row.state === "OMITTED" ? ("neutral" as const) : ("warn" as const),
        omittedBecause: row.state === "OMITTED" ? row.omittedReason : null,
        template: row.template ? `${row.template.nameEn}, text version ${row.template.bodyVersion}` : row.source === "TEMPLATE" ? NOT_SET : null,
        files: row.attachments.map((a) => ({ id: a.id, title: a.version.document.title, versionNo: a.version.versionNo, live: a.detachedAt == null && a.version.withdrawnAt == null })),
        /// Attaching goes through the document store (owner kind tenderPackPart, purpose TENDER_PART).
        attach: row.source === "UPLOAD" ? (editable ? { allowed: true as const, ownerKind: "tenderPackPart" as const, ownerId: row.id, purpose: "TENDER_PART" as const } : { allowed: false as const, reason: partFaultText({ code: "PACK_NOT_DRAFT", level: "block" }) }) : null,
        actions: {
          markReady: judged(markReadyFaults(facts, p.status, c.ex.status, content)),
          omit: judged(omitFaults(facts, p.status, c.ex.status, "reason given")),
          reopen: editable ? (row.state === "NOT_STARTED" ? { allowed: false as const, reason: "This part is not marked ready or omitted." } : { allowed: true as const }) : judged([packEditFault(p.status, c.ex.status)!]),
          pickTemplate: pickTemplateView({ source: row.source, content: row.content, templateId: row.templateId, printedNumber: row.printedNumber, label: row.labelSnapshot }, c.templates, editable ? null : packEditFault(p.status, c.ex.status)),
        },
        frozen: frozenEntry
          ? {
              texts: frozenDocs.map((d) => ({ language: d.language === "MS" ? "Malay" : "English", text: d.renderedText, from: d.templateName ? `${d.templateName}, text version ${d.templateBodyVersion}` : PART_SOURCE_LABEL[d.source] })),
              files: frozenEntry.files.map((f) => ({ title: f.title, versionNo: f.versionNo, fingerprint: f.sha256 })),
            }
          : null,
      };
    }),
  };
}

async function routeView(ex: NonNullable<Awaited<ReturnType<typeof loadExercise>>>["ex"], org: { id: string; today: string | null }, req: { sectionUnitCode: string | null; requestingUnitCode: string; requestingPersonId: string }) {
  const routes = latestFirst(tenderingRoutesOf(ex.approvalInstances));
  const current = routes[0] ?? null;
  if (!current) return null;
  const pending = current.steps.find((s) => s.decision === "PENDING") ?? null;
  let people: { value: string; label: string }[] = [];
  if (pending && org.today && !pending.committeeCode) {
    const [roster, delegations, units] = await Promise.all([loadRoster(ORGANISATION_CODE), loadDelegations(ORGANISATION_CODE), db.orgUnit.findMany({ where: { organisationId: org.id } })]);
    const unitPath = pathTo(units as unknown as OrgUnit[], req.sectionUnitCode || req.requestingUnitCode, dayToDate(org.today)).reverse().map((u) => u.code);
    const office = pending.actingRoleCode ?? pending.roleCode;
    const h = office ? holdersFor(office, unitPath, roster, delegations, org.today) : null;
    const ids = new Set([...(h?.holderIds ?? []), ...(h?.delegates.map((d) => d.personId) ?? [])]);
    people = roster.people.filter((p) => ids.has(p.id) && p.id !== req.requestingPersonId).map((p) => ({ value: p.id, label: p.name }));
  }
  const last = pending ? current.steps.every((s) => s.id === pending.id || s.decision === "DONE") : false;
  return {
    status: tenderingRouteLabel(current.status, current.warnings),
    rule: current.ruleLabel ?? NOT_SET,
    matrix: current.matrixLabel ?? NOT_SET,
    ifRejected: "Returned for amendment",
    steps: current.steps.map((s) => ({
      id: s.id,
      office: s.actingRoleLabel ?? s.roleLabel,
      act: ACT_LABEL[s.act] ?? "Acts",
      decision: s.decision === "DONE" ? "Done" : s.decision === "REJECTED" ? "Rejected" : "Pending",
      decidedBy: s.decidedByName ? `${s.decidedByName}, ${RECORDED_ON_BEHALF}` : null,
      decidedOn: s.decidedOn ? formatDate(s.decidedOn) : null,
      reason: s.reason || null,
    })),
    decide: pending ? { stepId: pending.id, office: pending.actingRoleLabel ?? pending.roleLabel, people, recordsDates: last, committee: !!pending.committeeCode } : null,
    earlier: routes.slice(1).map((r) => ({ openedOn: formatDate(r.openedAt), status: tenderingRouteLabel(r.status, r.warnings), reason: r.rejectionReason || null })),
  };
}

// ------------------------------------------------------------------ the Appendix page

export async function appendixPage(exerciseId: string) {
  const c = await context(exerciseId);
  if (!c) return null;
  const pack = c.packs.find((p) => isLivePack(p.status)) ?? c.packs.find((p) => p.status === "APPROVED") ?? c.packs[0] ?? null;
  if (!pack?.appendix) return { exercise: { id: c.ex.id, reference: c.ex.reference, title: c.ex.title }, appendix: null, why: pack ? "This pack's parts have no Appendix to the Conditions of Contract." : "Start the tender documents first." };
  const a = appendixFactsOf(pack.appendix);
  const editable = packEditFault(pack.status, c.ex.status);
  const profile = profileOf(c.ex.classificationSnapshot);
  const dlpRule = profile?.find((p) => p.key === "defectsLiabilityApplies")?.value ?? null;
  const p = c.policy;
  const lad = ladDaily(a, null);
  return {
    exercise: { id: c.ex.id, reference: c.ex.reference, title: c.ex.title },
    version: pack.versionNo,
    status: appendixComplete(a) ? "Complete" : "Being entered",
    edit: editable ? { allowed: false as const, reason: partFaultText(editable) } : { allowed: true as const },
    offices: c.roles.filter((r) => !r.isCommittee).map((r) => ({ value: r.code, label: r.nameEn })),
    holders: c.roles.map((r) => ({ value: r.code, label: r.isCommittee ? `${r.nameEn} (committee)` : r.nameEn })),
    officers: (["ladOfficerRoleCode", "eotOfficerRoleCode", "terminationOfficerRoleCode", "warRiskOfficerRoleCode", "arbitrationOfficerRoleCode"] as const).map((k) => ({ name: k, label: APPENDIX_FIELD_LABEL[k], value: a[k] ? c.office(a[k]) : NOT_SET, raw: a[k] ?? "" })),
    variationLimits: pack.appendix.variationLimits.map((v) => ({ id: v.id, holder: v.label, limit: money(v.limit == null ? null : parseSen(v.limit.toString())), raw: { holderCode: v.roleCode ?? v.committeeCode ?? "", limit: v.limit?.toString() ?? "" } })),
    primeCostSums: { value: a.pcSumWorksApply == null ? NOT_SET : a.pcSumWorksApply ? a.pcSumWorksText || "Yes" : "None", raw: { apply: a.pcSumWorksApply == null ? "unset" : a.pcSumWorksApply ? "yes" : "no", text: a.pcSumWorksText } },
    insurance: {
      tplMinimum: money(a.tplMinimum),
      wcMinimum: money(a.wcMinimum),
      uplift: a.worksInsuranceUpliftKind == null ? NOT_SET : a.worksInsuranceUpliftKind === "AMOUNT" ? `${UPLIFT_KIND_LABEL.AMOUNT}: ${money(a.worksInsuranceUpliftAmount)}` : `${UPLIFT_KIND_LABEL.PERCENT}: ${a.worksInsuranceUpliftPct ? formatPct(a.worksInsuranceUpliftPct) : NOT_SET}`,
      excess: money(a.insuranceExcess),
      tail: p.insurance.extraMonths == null ? `Insurance beyond the defects liability period: ${NOT_SET}` : `Insurance runs ${p.insurance.extraMonths} months ${p.insurance.extraDays} days beyond the defects liability period (${provenance(p.insuranceExtraProvenance).toLowerCase()}).`,
    },
    lad: {
      value: lad.kind === "NOT_SET" ? NOT_SET : lad.kind === "AMOUNT" ? `${formatSen(lad.sen)} a day` : `${formatPct(lad.pct)} of the contract sum a day`,
      kind: a.ladKind ? LAD_KIND_LABEL[a.ladKind] : NOT_SET,
      /// Q-6: a percentage is fixed at award against the awarded sum, never the exercise's value or estimate.
      helper: a.ladKind === "PERCENT_OF_SUM_PER_DAY" ? "Fixed at award, against the awarded sum." : null,
      suggestion: p.ladDailyPct ? `The policy's rate is ${formatPct(p.ladDailyPct)} of the contract sum a day (${provenance(p.ladDailyPctProvenance).toLowerCase()}).` : null,
    },
    sectional: { value: yesNoNotSet(a.sectionalCompletion), sections: pack.appendix.sections.map((s) => ({ id: s.id, description: s.description, raw: { description: s.description, ladKind: s.ladKind ?? "", ladAmount: s.ladAmount ? senToDecimalString(parseSen(s.ladAmount.toString())) : "", ladPct: s.ladPct ? s.ladPct.toString() : "", sortOrder: String(s.sortOrder) }, lad: s.ladKind == null ? NOT_SET : s.ladKind === "AMOUNT_PER_DAY" ? (s.ladAmount ? `${formatSen(parseSen(s.ladAmount.toString()))} a day` : NOT_SET) : s.ladPct ? `${formatPct(s.ladPct.toString())} of the contract sum a day` : NOT_SET })) },
    dlp: {
      value: a.dlpApplies == null ? NOT_SET : a.dlpApplies ? (a.dlpMonths == null ? NOT_SET : `${a.dlpMonths} months`) : "Does not apply",
      /// FR-MTD-012: hidden, with the reason, where the contract type has none.
      hidden: dlpRule === false ? "The contract type has no defects liability period." : null,
      typeNotSet: dlpRule == null ? behaviourFaultText({ code: "BEHAVIOUR_NOT_SET", level: "block", data: { behaviour: "defectsLiabilityApplies" } }) : null,
    },
    interim: {
      first: money(a.firstInterimMinimum),
      later: money(a.subsequentInterimMinimum),
      honourDays: a.honourCertificateDays == null ? NOT_SET : `${a.honourCertificateDays} days`,
      /// The policy's rule in words, with its provenance: computed against the awarded value, never the department's bill (SULIT).
      suggestion: p.firstCertificateFloor != null && p.firstCertificatePct != null ? `The policy's first-certificate minimum is the lesser of ${formatSen(p.firstCertificateFloor)} and ${formatPct(p.firstCertificatePct)} of the builders' works value (${provenance(p.firstCertificateProvenance).toLowerCase()}).` : null,
    },
    findings: appendixFaults(a).map(appendixFaultText),
    raw: {
      tplMinimum: a.tplMinimum == null ? "" : senToDecimalString(a.tplMinimum),
      wcMinimum: a.wcMinimum == null ? "" : senToDecimalString(a.wcMinimum),
      worksInsuranceUpliftKind: a.worksInsuranceUpliftKind ?? "",
      worksInsuranceUpliftAmount: a.worksInsuranceUpliftAmount == null ? "" : senToDecimalString(a.worksInsuranceUpliftAmount),
      worksInsuranceUpliftPct: a.worksInsuranceUpliftPct ?? "",
      insuranceExcess: a.insuranceExcess == null ? "" : senToDecimalString(a.insuranceExcess),
      ladKind: a.ladKind ?? "",
      ladAmount: a.ladAmount == null ? "" : senToDecimalString(a.ladAmount),
      ladPct: a.ladPct ?? "",
      sectionalCompletion: a.sectionalCompletion == null ? "unset" : a.sectionalCompletion ? "yes" : "no",
      dlpApplies: a.dlpApplies == null ? "unset" : a.dlpApplies ? "yes" : "no",
      dlpMonths: a.dlpMonths == null ? "" : String(a.dlpMonths),
      firstInterimMinimum: a.firstInterimMinimum == null ? "" : senToDecimalString(a.firstInterimMinimum),
      subsequentInterimMinimum: a.subsequentInterimMinimum == null ? "" : senToDecimalString(a.subsequentInterimMinimum),
      honourCertificateDays: a.honourCertificateDays == null ? "" : String(a.honourCertificateDays),
    },
  };
}

// ------------------------------------------------------------------ the print view

/**
 * The pack in print order. Approved: the frozen rows only, each with the fidelity line
 * (ADR 0008). With approval: frozen, marked not issued. A draft: rendered live from the
 * current templates, bill and Appendix, marked "Draft, not issued".
 */
export async function printView(exerciseId: string) {
  const c = await context(exerciseId);
  if (!c) return null;
  const pack = c.packs.find((p) => p.status === "APPROVED") ?? c.packs.find((p) => isLivePack(p.status)) ?? null;
  if (!pack) return null;
  const watermark = pack.status === "APPROVED" ? null : pack.status === "SUBMITTED" ? "With approval, not issued" : "Draft, not issued";
  const manifest = packManifest(pack.manifest);
  if (pack.frozenAt && manifest) {
    return {
      exercise: { id: c.ex.id, reference: c.ex.reference, title: c.ex.title },
      version: pack.versionNo,
      form: pack.formLabelSnapshot ?? NOT_SET,
      watermark,
      parts: manifest.map((m) => ({
        printedNumber: m.printedNumber,
        label: m.label,
        omitted: m.state === "OMITTED" ? `Omitted: ${m.omittedReason}` : null,
        texts: pack.documents.filter((d) => d.partCode === m.partCode).map((d) => ({ language: d.language === "MS" ? "Malay" : "English", paragraphs: d.renderedText.split("\n\n"), fidelity: d.templateName ? `From ${d.templateName}${d.templateFormCode ? ` (${d.templateFormCode})` : ""}, text version ${d.templateBodyVersion}, frozen ${formatDate(d.frozenAt)}.` : `${PART_SOURCE_LABEL[d.source]}, frozen ${formatDate(d.frozenAt)}.` })),
        files: m.files.map((f) => ({ title: f.title, versionNo: f.versionNo, fingerprint: f.sha256 })),
      })),
    };
  }
  // A draft, live.
  const scope = await scopeReadiness(c.org.id, c.ex);
  const org = await db.organisation.findUniqueOrThrow({ where: { id: c.org.id }, select: { name: true } });
  const basis = await db.contractBasis.findFirst({ where: { organisationId: c.org.id, code: pack.contractBasisCode }, select: { nameEn: true } });
  const type = c.ex.contractTypeCode ? await db.contractType.findFirst({ where: { organisationId: c.org.id, code: c.ex.contractTypeCode }, select: { nameEn: true } }) : null;
  const fields = packFieldValues({ organisationName: org.name, exerciseReference: c.ex.reference, exerciseTitle: c.ex.title, requisitionReference: c.req.reference, packKindLabel: PACK_KIND_LABEL[pack.packKind], versionNo: pack.versionNo, formLabel: pack.formLabelSnapshot, basisName: basis?.nameEn ?? null, typeName: type?.nameEn ?? null });
  const a: AppendixFacts | null = pack.appendix ? appendixFactsOf(pack.appendix) : null;
  return {
    exercise: { id: c.ex.id, reference: c.ex.reference, title: c.ex.title },
    version: pack.versionNo,
    form: pack.formLabelSnapshot ?? NOT_SET,
    watermark,
    parts: pack.parts.map((p) => ({
      printedNumber: p.printedNumber,
      label: p.labelSnapshot,
      omitted: p.state === "OMITTED" ? `Omitted: ${p.omittedReason}` : null,
      texts:
        p.source === "TEMPLATE" && p.template
          ? (["MS", "EN"] as const).flatMap((lang) => {
              const body = lang === "MS" ? p.template!.bodyMs : p.template!.bodyEn;
              return body?.trim() ? [{ language: lang === "MS" ? "Malay" : "English", paragraphs: renderWith(body, fields, PACK_WHITELIST).paragraphs, fidelity: `From ${p.template!.nameEn}, text version ${p.template!.bodyVersion}, as it stands now.` }] : [];
            })
          : p.source === "BQ_UNPRICED" && scope.bill
            ? [{ language: "English", paragraphs: unpricedBqText(scope.bill.frozen).split("\n\n"), fidelity: "The bill of quantities, unpriced, as it stands now." }]
            : p.source === "APPENDIX" && a
              ? [{ language: "English", paragraphs: [appendixText(a, c.office)], fidelity: "The Appendix as entered so far." }]
              : [],
      files: pinnedFilesOf(p).map((f) => ({ title: f.title, versionNo: f.versionNo, fingerprint: f.sha256 })),
    })),
  };
}

/// The frozen text of one part, joined (the print view and tests read it as one string).
export const frozenText = (paragraphs: readonly string[]) => renderedText({ paragraphs: [...paragraphs], missing: [], unknown: [] });

// ------------------------------------------------------------------ Configuration › Tender documents

export async function tenderDocsConfig(showRetired = false) {
  const org = await db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true, timeZone: true } });
  if (!org) return null;
  const [parts, policy, methods, bases, templates, units] = await Promise.all([
    loadConfiguredParts(org.id),
    loadTenderPolicy(org.id),
    db.sourcingMethod.findMany({ where: { organisationId: org.id }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { id: true, nameEn: true, documentPackKind: true, documentPackKindProvenance: true, retiredOn: true } }),
    db.contractBasis.findMany({ where: { organisationId: org.id }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { code: true, nameEn: true, retiredOn: true } }),
    db.documentTemplate.findMany({ where: { organisationId: org.id }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { code: true, nameEn: true, bodyVersion: true } }),
    db.orgUnit.findMany({ where: { organisationId: org.id }, orderBy: { nameEn: "asc" }, select: { code: true, nameEn: true } }),
  ]);
  // The organisation's day, never UTC's: unset zone leaves a retirement not judged, and says so.
  const today = todayIn(new Date(), org.timeZone);
  const retired = (p: { retiredOn: string | null }) => partRetiredOn(p.retiredOn, today);
  const basisName = (code: string | null) => (code ? (bases.find((b) => b.code === code)?.nameEn ?? "A basis no longer configured") : "Every basis");
  const groups = (["TENDER", "QUOTATION"] as const).map((k) => {
    const rows = parts.filter((p) => p.packKind === k && (showRetired || retired(p) !== true));
    return {
      packKind: PACK_KIND_LABEL[k],
      byBasis: [...new Set(rows.map((r) => r.contractBasisCode ?? ""))].sort().map((b) => ({
        basis: basisName(b || null),
        parts: rows.filter((r) => (r.contractBasisCode ?? "") === b).map((r) => ({
          id: r.id,
          printedNumber: r.printedNumber,
          label: r.labelEn,
          role: PART_ROLE_LABEL[r.role],
          content: PART_CONTENT_LABEL[r.content],
          source: PART_SOURCE_LABEL[r.source],
          mandatory: yesNoNotSet(r.mandatory),
          inTableDocument: yesNoNotSet(r.inTableDocument),
          template: r.templateCode ? (templates.find((t) => t.code === r.templateCode)?.nameEn ?? "A template no longer configured") : null,
          preparedBy: r.ownerOrgUnitCode ? (units.find((u) => u.code === r.ownerOrgUnitCode)?.nameEn ?? "An office no longer configured") : NOT_SET,
          provenance: provenance(r.provenance),
          governingSource: r.governingSource || null,
          retired: retired(r) === true,
          raw: { ...r, retiredOn: r.retiredOn },
        })),
      })),
    };
  });
  // Settings whose absence holds work back (62-C4's rule for headers): a method with its pack
  // not set blocks its exercises' move into preparation; a part with "mandatory" not set blocks submission.
  const methodRows = methods.map((m) => ({ id: m.id, name: m.nameEn, documentPack: m.documentPackKind ? PACK_KIND_LABEL[m.documentPackKind] : NOT_SET, provenance: provenance(m.documentPackKindProvenance), retired: m.retiredOn != null, raw: { documentPackKind: m.documentPackKind ?? "unset", documentPackKindProvenance: m.documentPackKindProvenance ?? "" } }));
  const holdingWorkBack = configHoldingWorkBack(methods.map((m) => ({ retired: m.retiredOn != null, documentPackKind: m.documentPackKind })), parts, today);
  return {
    path: TENDER_DOCS_CONFIG_PATH,
    holdingWorkBack,
    /// Set only where the time zone is not: a part's retirement cannot be judged until it is.
    timeZoneNotSet: today == null && parts.some((p) => p.retiredOn != null) ? CONFIG_TIME_ZONE_NOT_SET : null,
    groups,
    empty: parts.length === 0 ? "No parts are configured. Tender and quotation documents cannot be started until the parts for each pack kind are added." : null,
    methods: methodRows,
    policy: {
      restrictionStampEn: policy.restrictionStampTextEn ?? NOT_SET,
      restrictionStampMs: policy.restrictionStampTextMs ?? NOT_SET,
      assuranceRequired: yesNoNotSet(policy.assuranceRequired),
      ladDailyRate: policy.ladDailyPct ? `${formatPct(policy.ladDailyPct)} of the contract sum a day` : NOT_SET,
      ladDailyRateProvenance: provenance(policy.ladDailyPctProvenance),
      firstCertificate: policy.firstCertificateFloor != null && policy.firstCertificatePct != null ? `The lesser of ${formatSen(policy.firstCertificateFloor)} and ${formatPct(policy.firstCertificatePct)} of the builders' works value` : NOT_SET,
      firstCertificateProvenance: provenance(policy.firstCertificateProvenance),
      insuranceTail: policy.insurance.extraMonths == null ? NOT_SET : `${policy.insurance.extraMonths} months ${policy.insurance.extraDays} days beyond the defects liability period`,
      insuranceTailProvenance: provenance(policy.insuranceExtraProvenance),
      designAndBuildTail: policy.insurance.dbExtraMonths == null ? NOT_SET : `${policy.insurance.dbExtraMonths} months ${policy.insurance.dbExtraDays} days beyond the defects liability period`,
      designAndBuildTailProvenance: provenance(policy.dbInsuranceExtraProvenance),
      governingSource: policy.governingSource || null,
    },
    options: {
      packKinds: [{ value: "TENDER", label: PACK_KIND_LABEL.TENDER }, { value: "QUOTATION", label: PACK_KIND_LABEL.QUOTATION }],
      methodPackKinds: [{ value: "TENDER", label: PACK_KIND_LABEL.TENDER }, { value: "QUOTATION", label: PACK_KIND_LABEL.QUOTATION }, { value: "NONE", label: PACK_KIND_LABEL.NONE }, { value: "unset", label: NOT_SET }],
      bases: bases.filter((b) => b.retiredOn == null).map((b) => ({ value: b.code, label: b.nameEn })),
      templates: templates.map((t) => ({ value: t.code, label: `${t.nameEn} (text version ${t.bodyVersion})` })),
      units: units.map((u) => ({ value: u.code, label: u.nameEn })),
      roles: Object.entries(PART_ROLE_LABEL).map(([value, label]) => ({ value, label })),
      contents: Object.entries(PART_CONTENT_LABEL).map(([value, label]) => ({ value, label })),
      sources: Object.entries(PART_SOURCE_LABEL).map(([value, label]) => ({ value, label })),
    },
  };
}

/// The routes' closing as a day in the organisation's zone, for 6.5 and the screens.
export const closingDayText = (at: Date | null, timeZone: string | null) => (at && timeZone ? formatDate(storedDayIn(at, timeZone)) : NOT_SET);

/// The estimate lead's policy, for the approver's warning (read-only).
export const estimateLeadPolicy = (organisationId: string) => loadScopePolicy(organisationId);
