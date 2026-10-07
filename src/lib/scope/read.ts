/**
 * What 6.2's screens read (plan §5): the Scope, Bill of quantities and Company estimate
 * tabs and Configuration › Scope and estimate. Each view carries words and formatted
 * figures, never codes, and each action it offers carries whether it is allowed and, if
 * not, why — judged by the same pure rule the action runs under its lock, so a disabled
 * button and a refused post give the same reason. Reads only.
 *
 * The estimate's view never holds its figure or an amendment reason: the client omits
 * them, and every place they would appear reads "Sealed" (OD-1, ADR 0012).
 */

import { storedDay } from "@/lib/dates";
import { loadAttributions } from "@/lib/auth/attribution-read";
import { db } from "@/lib/db";
import { formatDate, formatOrgDay } from "@/lib/format";
import { CLASSIFICATION_LABEL } from "@/lib/documents/labels";
import { formatSen, parseSen, senToDecimalString } from "@/lib/money";
import { exerciseOrg } from "@/lib/method/repo";

import type { ScopeSectionFacts } from "./sections";
import { bqTotals, currentBq, draftEditFaults, finaliseFaults, reviseFaults, startBqFaults } from "./bq";
import { estimateFactsOf as factsOf, loadBqVersions, loadEstimates, loadRateIssues, loadScopeMatters, loadHoldings, loadPanel, loadPanelColumns, loadQualifications, loadScopePolicy, loadScopeRules, linesOf, lineOf } from "./repo";
import { leadTime, lodgeFaults, lodgementBehind, retainedCopyDue, retainFaults, startFault, versionFaults, voidFault } from "./estimate";
import {
  BQ_READABLE_STATEMENT,
  BQ_STATUS_LABEL,
  ESTIMATE_STATE_LABEL,
  EVENT_KIND_LABEL,
  firmValueText,
  ITEM_KIND_LABEL,
  LEAD_READING,
  LEAD_STATE_BADGE,
  leadTimeText,
  NO_LIMIT,
  signatoriesText,
  sharePercentText,
  estimateEmptyState,
  leadConfiguredText,
  NOT_SET,
  PANEL_STATE_LABEL,
  PROVENANCE_LABEL,
  PROVISIONAL_CHIP,
  RATE_SOURCE_LABEL,
  SCOPED_BY_LABEL,
  SEALED_TEXT,
  scopeFaultText,
  SCOPE_CONFIG_PATH,
  SCOPE_STATE_BADGE,
  RATE_SCHEDULE_STATUS_LABEL,
  CSV_EXPORT_NOTE,
  CSV_IMPORT_NOTE,
  scopeApprovalLine,
  scopeRuleMovedNote,
  scopeRuleWords,
} from "./labels";
import { issueText, schedulesInForce } from "./rates";
import { rateFromText } from "./audit-view";
import { uploadContext } from "@/lib/documents/read";
import { formatBytes } from "@/lib/documents/labels";
import { scopeCitationFault } from "./scope-matter";
import { checkTabling, secretariatHoldersOn } from "@/lib/committee/tabling";
import { TABLING_FAULT_MESSAGE } from "@/lib/committee/labels";
import { ACT_LABEL } from "@/lib/labels";
import { loadRoster } from "@/lib/people/load";
import { scopeApproval } from "./scope-matter";
import { columnsInForce, panelFaults, panelState, standingVerifications, verifyPanelFault } from "./panel";
import { blocking, type BqScopedBy, type Finding } from "./types";

type Allowed = { allowed: true } | { allowed: false; reason: string };
const judged = (fs: readonly Finding[]): Allowed => {
  const b = blocking(fs);
  return b.length ? { allowed: false, reason: b.map((f) => scopeFaultText(f)).join(" ") } : { allowed: true };
};
const money = (s: bigint) => formatSen(s);
const provenanceText = (p: string | null | undefined) => (p ? (PROVENANCE_LABEL as Record<string, string>)[p] ?? NOT_SET : NOT_SET);
const yesNo = (b: boolean | null) => (b == null ? NOT_SET : b ? "Yes" : "No");

async function loadAll(organisationId: string, exerciseId: string) {
  const org = await exerciseOrg(organisationId);
  if (!org) return null;
  const ex = await db.sourcingExercise.findFirst({ where: { id: exerciseId, organisationId: org.id }, select: { id: true, reference: true, title: true, status: true, sourcingMethodCode: true, contractBasisCode: true, closingAt: true } });
  if (!ex) return null;
  const [policy, versions, panel, estimates, rules, scopeMatters] = await Promise.all([
    loadScopePolicy(org.id),
    loadBqVersions(ex.id),
    loadPanel(ex.id),
    loadEstimates(ex.id),
    loadScopeRules(org.id, ex),
    loadScopeMatters(ex.id),
  ]);
  const approval = scopeApproval(rules.method, versions, scopeMatters);
  return { org, ex, policy, versions, panel, estimates, rules, scopeMatters, approval };
}

// ------------------------------------------------------------------ Which sections the tab shows

/**
 * What decides which of the Scope and estimate tab's sections the exercise needs: the two
 * configured flags, and whether a bill or an estimate already exists. A count only, not a
 * sibling section's data. Null when the exercise or its organisation cannot be found.
 */
export async function scopeSectionFacts(organisationId: string, exerciseId: string): Promise<ScopeSectionFacts | null> {
  const org = await exerciseOrg(organisationId);
  if (!org) return null;
  const ex = await db.sourcingExercise.findFirst({ where: { id: exerciseId, organisationId: org.id }, select: { id: true, sourcingMethodCode: true, contractBasisCode: true } });
  if (!ex) return null;
  const rules = await loadScopeRules(org.id, ex);
  const [bills, estimates] = await Promise.all([db.bqVersion.count({ where: { exerciseId: ex.id } }), db.companyEstimate.count({ where: { exerciseId: ex.id } })]);
  return { requiresBq: rules.basis?.requiresBq ?? null, requiresCompanyEstimate: rules.method?.requiresCompanyEstimate ?? null, hasBill: bills > 0, hasEstimate: estimates > 0 };
}

// ------------------------------------------------------------------ Scope tab

export async function scopeTab(organisationId: string, exerciseId: string) {
  const a = await loadAll(organisationId, exerciseId);
  if (!a) return null;
  const { org, ex, policy, versions, panel, rules } = a;
  const [columns, people, lists] = await Promise.all([
    loadPanelColumns(org.id),
    db.person.findMany({ where: { organisationId: org.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.classificationTaxonomy.findMany({ where: { organisationId: org.id, code: { in: [policy.panelContractKindTaxonomyCode, policy.panelProjectStatusTaxonomyCode].filter((x): x is string => x != null) } }, include: { values: { orderBy: { sortOrder: "asc" } } } }),
  ]);
  const listOf = (code: string | null) => lists.find((t) => t.code === code)?.values.map((v) => ({ value: v.code, label: v.nameEn })) ?? [];
  const valueName = (code: string | null, listCode: string | null, other: string) =>
    code ? (listOf(listCode).find((v) => v.value === code)?.label ?? "A value no longer on the list") : other.trim() ? `Specified: ${other.trim()}` : NOT_SET;
  const state = panelState(panel ? { status: panel.status, liveScanVersionIds: panel.liveScanVersionIds, verifiedSnapshot: panel.verifiedSnapshot } : null);
  const inForce = columnsInForce(columns, org.today);
  const standing = panel ? standingVerifications(panel.verifications) as typeof panel.verifications : [];
  const pFaults = panel
    ? panelFaults(
        { status: panel.status, contractKindCode: panel.contractKindCode, contractKindOther: panel.contractKindOther, projectStatusCode: panel.projectStatusCode, projectStatusOther: panel.projectStatusOther, bq: panel.bqVersion, verifications: panel.verifications, liveSulitScans: panel.liveSulitScans },
        { columns, policy, today: org.today, exerciseStatus: ex.status, bqRequired: rules.basis?.requiresBq ?? null },
      )
    : [];
  const signatories = new Set(standing.map((v) => v.personId)).size;
  // Who verified each column, signed or recorded from paper, is read from its attribution (Phase 2b).
  const attributed = await loadAttributions(db, org.id, [{ entity: "SpecPanelVerification", slot: "person", ids: standing.map((v) => v.id) }]);
  return {
    exercise: { id: ex.id, reference: ex.reference, title: ex.title },
    panel: {
      id: panel?.id ?? null,
      state,
      stateLabel: PANEL_STATE_LABEL[state],
      contractKind: panel ? valueName(panel.contractKindCode, policy.panelContractKindTaxonomyCode, panel.contractKindOther) : NOT_SET,
      projectStatus: panel ? valueName(panel.projectStatusCode, policy.panelProjectStatusTaxonomyCode, panel.projectStatusOther) : NOT_SET,
      currentRevision: panel?.currentRevisionNo ? `${panel.currentRevisionNo}${panel.currentRevisionOn ? `, ${formatDate(panel.currentRevisionOn)}` : ""}` : NOT_SET,
      revisedRevision: panel?.revisedRevisionNo ? `${panel.revisedRevisionNo}${panel.revisedRevisionOn ? `, ${formatDate(panel.revisedRevisionOn)}` : ""}` : NOT_SET,
      completionPeriod: panel?.completionPeriodText || NOT_SET,
      certifiesBill: panel?.bqVersion ? `Version ${panel.bqVersion.versionNo} (${BQ_STATUS_LABEL[panel.bqVersion.status]})` : NOT_SET,
      columns: inForce.map((c) => {
        const v = standing.find((x) => x.columnCode === c.code);
        return { code: c.code, label: c.labelEn, verifiedBy: v ? attributed.read({ entity: "SpecPanelVerification", id: v.id, slot: "person" }, v.person.name).en : null, verifiedOn: v ? storedDay(v.verifiedOn) : null, note: v?.note || null };
      }),
      cleared: panel ? panel.verifications.filter((v) => v.clearedAt != null).map((v) => ({ column: v.columnLabelSnapshot, by: v.person.name, clearedOn: formatOrgDay(v.clearedAt!, org.timeZone) })) : [],
      signatories: signatoriesText(signatories, policy.panelSignatoryLimit),
      signedFormScans: panel?.liveSulitScans ?? 0,
      /// What the edit form starts from: the stored values, as strings (never labels).
      raw: {
        contractKindCode: panel?.contractKindCode ?? "",
        contractKindOther: panel?.contractKindOther ?? "",
        projectStatusCode: panel?.projectStatusCode ?? "",
        projectStatusOther: panel?.projectStatusOther ?? "",
        currentRevisionNo: panel?.currentRevisionNo ?? "",
        currentRevisionOn: panel?.currentRevisionOn ? storedDay(panel.currentRevisionOn) : "",
        revisedRevisionNo: panel?.revisedRevisionNo ?? "",
        revisedRevisionOn: panel?.revisedRevisionOn ? storedDay(panel.revisedRevisionOn) : "",
        completionPeriodText: panel?.completionPeriodText ?? "",
        bqVersionId: panel?.bqVersion?.id ?? "",
      },
      findings: pFaults.map((f) => ({ level: f.level, text: scopeFaultText(f) })),
      // BD-62-26: a draft, or a verified panel whose scan has gone, may be (re-)verified; one standing verified may not.
      verify: verifyPanelFault(state) ? judged([verifyPanelFault(state)!]) : judged(pFaults),
      reverify: state === "SCAN_GONE",
      options: { contractKinds: listOf(policy.panelContractKindTaxonomyCode), projectStatuses: listOf(policy.panelProjectStatusTaxonomyCode), bills: versions.filter((v) => v.status === "FINALISED").map((v) => ({ value: v.id, label: `Version ${v.versionNo}` })), people, columns: inForce.map((c) => ({ value: c.code, label: c.labelEn })) },
      statement: "Each verification says whether the person signed in to give it or it was recorded from their paper.",
    },
    approval: await approvalView(a, people),
  };
}

/**
 * The Scope section's scope-approval card (OD-9, FR-REQ-014): where approval stands, the
 * rule it was read under (with provenance), every SCOPE matter on the exercise's bills, and
 * whether the finalised bill can be tabled now, at which sittings, by whom — judged by the
 * same `scopeCitationFault` and Secretariat rule the act runs under its locks.
 */
async function approvalView(a: NonNullable<Awaited<ReturnType<typeof loadAll>>>, people: { id: string; name: string }[]) {
  const { org, ex, rules, versions, approval } = a;
  const rule = rules.method;
  const code = rule?.scopeCommitteeCode ?? null;
  const committee = code ? await db.committee.findFirst({ where: { organisationId: org.id, code }, select: { id: true, nameEn: true, secretariatRoleCode: true } }) : null;
  const [sittings, roster, rows] = await Promise.all([
    committee ? db.meeting.findMany({ where: { committeeId: committee.id, status: { in: ["SCHEDULED", "IN_PROGRESS"] } }, orderBy: [{ meetingDate: "asc" }, { reference: "asc" }], select: { id: true, reference: true, meetingDate: true } }) : Promise.resolve([]),
    loadRoster(org.code),
    db.committeeDecision.findMany({
      where: { matterKind: "SCOPE", bqVersion: { exerciseId: ex.id } },
      orderBy: [{ tabledAt: "desc" }, { id: "desc" }],
      select: { id: true, meetingId: true, outcome: true, act: true, withdrawnAt: true, tabledAt: true, decisionDate: true, notApprovedOutcomeNameEn: true, bqVersion: { select: { versionNo: true } }, meeting: { select: { reference: true, meetingDate: true, status: true, committee: { select: { nameEn: true } } } }, tabledBy: { select: { name: true } } },
    }),
  ]);
  const holders = committee ? secretariatHoldersOn(roster, committee.secretariatRoleCode, org.today) : [];
  // Who tabled each matter, signed or recorded from paper, is read from its attribution (Phase 2b).
  const tabled = await loadAttributions(db, org.id, [{ entity: "CommitteeDecision", slot: "tabledBy", ids: rows.map((m) => m.id) }]);
  const finalised = versions.find((v) => v.status === "FINALISED") ?? null;
  const committeeName = committee?.nameEn ?? (code ? "A committee no longer configured" : null);
  const reasons: string[] = [];
  if (!finalised) reasons.push(scopeFaultText("VERSION_NOT_FINALISED"));
  else {
    const f = scopeCitationFault({ exercise: { id: ex.id, status: ex.status }, rule, version: finalised, sitting: { committeeCode: code ?? "", frozen: false }, act: rule?.scopeAct ?? null, matters: a.scopeMatters.filter((m) => m.bqVersionId === finalised.id) });
    reasons.push(...blocking(f).map((x) => scopeFaultText(x)));
  }
  if (reasons.length === 0 && committee && sittings.length === 0) reasons.push(scopeFaultText({ code: "NO_OPEN_SITTING", level: "block", data: { committee: committee.nameEn } }));
  if (reasons.length === 0 && committee) {
    const t = checkTabling({ secretariatRoleCode: committee.secretariatRoleCode, tabledByPersonId: holders[0]?.id ?? null, holderIdsOnDate: holders.map((h) => h.id), tablingDay: org.today });
    if (!t.ok) reasons.push(t.fault === "NOT_TABLED" ? "Nobody holds the committee's Secretariat office today, so nobody may table the scope. Assign the office under Configuration, Users & roles." : TABLING_FAULT_MESSAGE[t.fault]);
  }
  const OUTCOME: Record<string, string> = { PENDING: "Waiting for the decision", CARRIED: "Carried", NOT_CARRIED: "Not carried", DEFERRED: "Deferred" };
  // The configured act in words (overrides BD-62-16): tabling writes it, and only it.
  const actWords = rule?.scopeAct ? (ACT_LABEL[rule.scopeAct] ?? "An act the portal does not name") : null;
  const actName = (act: string) => ACT_LABEL[act] ?? "An act the portal does not name";
  // 62-C1: each matter speaks under the rule it was tabled under. Where configuration has
  // moved on since the deciding matter was tabled, the card warns and names both rules.
  const move = approval.movedOn;
  const moved = move && approval.decisive
    ? scopeRuleMovedNote({
        decided: move.decided,
        tabled: scopeRuleWords(actName(move.tabled.act), approval.decisive.committeeName ?? "committee of its sitting")!,
        now: scopeRuleWords(actWords, committeeName),
        sitting: approval.decisive.sittingReference ?? null,
      })
    : null;
  return {
    state: approval.state,
    badge: SCOPE_STATE_BADGE[approval.state],
    line: scopeApprovalLine(approval, committeeName),
    moved,
    rule: {
      required: rule == null ? "The sourcing method is no longer configured" : rule.scopeApprovalRequired == null ? NOT_SET : rule.scopeApprovalRequired ? "Yes" : "No",
      provenance: rule?.scopeApprovalRequired == null ? null : provenanceText(rule.scopeApprovalProvenance),
      committee: rule?.scopeApprovalRequired ? (committeeName ?? NOT_SET) : null,
      /// The act the committee discharges, in words, and where that came from; null where no yes.
      act: rule?.scopeApprovalRequired ? (actWords ?? NOT_SET) : null,
      actProvenance: rule?.scopeApprovalRequired && rule.scopeAct ? provenanceText(rule.scopeActProvenance) : null,
    },
    configHref: SCOPE_CONFIG_PATH,
    matters: rows.map((m) => ({
      id: m.id,
      version: `Version ${m.bqVersion?.versionNo ?? "?"}`,
      sitting: m.meeting.reference,
      sittingHref: `/committees/${m.meetingId}`,
      committee: m.meeting.committee.nameEn,
      act: actName(m.act),
      tabledOn: m.tabledAt ? storedDay(m.tabledAt) : null,
      tabledBy: m.tabledBy ? tabled.read({ entity: "CommitteeDecision", id: m.id, slot: "tabledBy" }, m.tabledBy.name).en : null,
      // An undecided matter at a cancelled sitting counts for nothing (scopeApproval), as a withdrawn one.
      outcome: m.withdrawnAt ? "Withdrawn" : m.meeting.status === "CANCELLED" && m.outcome === "PENDING" ? "Sitting cancelled, not decided" : (OUTCOME[m.outcome] ?? "Outcome not known"),
      outcomeTone: (m.withdrawnAt || (m.meeting.status === "CANCELLED" && m.outcome === "PENDING") ? "neutral" : m.outcome === "CARRIED" ? "ok" : m.outcome === "NOT_CARRIED" ? "err" : m.outcome === "DEFERRED" ? "warn" : "info") as "ok" | "err" | "warn" | "info" | "neutral",
      decidedOn: m.decisionDate ? storedDay(m.decisionDate) : null,
      notApproved: m.notApprovedOutcomeNameEn,
    })),
    table: {
      allowed: (reasons.length ? { allowed: false, reason: reasons.join(" ") } : { allowed: true }) as Allowed,
      versionId: finalised?.id ?? null,
      versionNo: finalised?.versionNo ?? null,
      committee: committeeName,
      act: actWords,
      sittings: sittings.map((x) => ({ value: x.id, label: `${x.reference}, ${formatDate(storedDay(x.meetingDate))}` })),
      holders: holders.map((h) => ({ value: h.id, label: h.name })),
      people: people.length,
    },
  };
}

// ------------------------------------------------------------------ Bill of quantities tab

export async function bqTab(organisationId: string, exerciseId: string) {
  const a = await loadAll(organisationId, exerciseId);
  if (!a) return null;
  const { org, ex, policy, versions } = a;
  const [qualifications, templates, people, rateIssues, upload] = await Promise.all([
    loadQualifications(org.id),
    db.bqTemplate.findMany({ where: { organisationId: org.id, retiredOn: null }, orderBy: { nameEn: "asc" }, select: { code: true, nameEn: true } }),
    db.person.findMany({ where: { organisationId: org.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    loadRateIssues(org.id),
    uploadContext(organisationId),
  ]);
  // FR-EST-004: the items of every schedule's issue in force today, for pricing a line.
  const inForce = org.today ? schedulesInForce(rateIssues, org.today) : [];
  const scheduleItems = inForce.flatMap((i) => i.items.map((it) => ({ value: `${i.id}|${it.code}`, label: `${i.label}, ${issueText(i.issueNo)}: ${it.code} ${it.descriptionEn} (${money(it.rate)}${it.unit ? ` per ${it.unit}` : ""})` })));
  const { finalised, draft } = currentBq(versions);
  const current = draft ?? finalised;
  const holdings = current?.preparerPersonId ? await loadHoldings(org.id, db, [current.preparerPersonId]) : [];
  // The day a later issue replaced the one a line was priced from, where it has.
  const supersededOn = (scheduleId: string | null) => {
    const r = scheduleId ? rateIssues.find((x) => x.id === scheduleId) : null;
    return r && r.status === "SUPERSEDED" ? r.supersededOn : null;
  };
  const view = (v: NonNullable<typeof current>) => {
    const lines = linesOf(v);
    const t = bqTotals(lines, v.provisionalExcludedFromFirm);
    const snap = v.preparerQualificationSnapshot as { name?: string | null; judgedOn?: string } | null;
    return {
      id: v.id,
      versionNo: v.versionNo,
      status: BQ_STATUS_LABEL[v.status],
      stats: {
        lines: lines.length,
        total: money(t.total),
        provisionalQuantities: money(t.provisionalQuantities),
        primeCostSums: money(t.primeCostSums),
        provisionalSums: money(t.provisionalSums),
        buildersWorks: money(t.buildersWorks),
        firmValue: firmValueText(t.firmValue),
        provisionalShare: t.provisionalSharePct == null ? NOT_SET : sharePercentText(t.provisionalSharePct),
        incompleteLines: t.incompleteLines,
      },
      header: {
        scopedBy: v.scopedBy ? SCOPED_BY_LABEL[v.scopedBy as BqScopedBy] : NOT_SET,
        scopeStatement: v.scopeStatement || NOT_SET,
        standard: v.standardLabelSnapshot ?? policy.measurementStandardLabel ?? NOT_SET,
        followsStandard: yesNo(v.followsStandard),
        departures: v.departuresText || null,
        preparer: v.preparer ? v.preparer.name : NOT_SET,
        qualification: snap?.name ? `${snap.name}, held on ${formatDate(snap.judgedOn)}` : v.status === "DRAFT" ? "Checked when it is finalised" : NOT_SET,
        provisionalLeftOut: v.provisionalExcludedFromFirm == null ? "Not stated" : yesNo(v.provisionalExcludedFromFirm),
        revisionReason: v.revisionReason || null,
      },
      raw: {
        scopedBy: v.scopedBy ?? "",
        scopeStatement: v.scopeStatement,
        followsStandard: v.followsStandard == null ? "" : v.followsStandard ? "yes" : "no",
        departuresText: v.departuresText,
        preparerPersonId: v.preparerPersonId ?? "",
        provisionalExcludedFromFirm: v.provisionalExcludedFromFirm == null ? "" : v.provisionalExcludedFromFirm ? "yes" : "no",
      },
      sections: v.sections.map((s) => ({
        id: s.id,
        number: s.number,
        title: s.title,
        sortOrder: String(s.sortOrder),
        items: s.items.map((i) => {
          const l = lineOf(i);
          return {
            id: i.id, itemRef: i.itemRef, description: i.description, unit: i.unit, kind: ITEM_KIND_LABEL[l.kind],
            quantity: l.quantity ?? NOT_SET, rate: l.rate == null ? NOT_SET : money(l.rate), amount: i.amount == null ? NOT_SET : formatSen(parseSen(i.amount.toString())),
            chips: l.provisional ? [PROVISIONAL_CHIP] : [],
            rateSource: i.rateSource === "SCHEDULE" && i.scheduleLabelSnapshot && i.scheduleIssueSnapshot && i.rateItemCode
              ? `${RATE_SOURCE_LABEL.SCHEDULE}: ${rateFromText({ label: i.scheduleLabelSnapshot, issue: i.scheduleIssueSnapshot, effectiveFrom: i.scheduleEffectiveFromSnapshot ? storedDay(i.scheduleEffectiveFromSnapshot) : "", itemCode: i.rateItemCode, supersededOn: supersededOn(i.rateScheduleId) }, (x) => (x ? formatDate(x) : NOT_SET))}`
              : RATE_SOURCE_LABEL[i.rateSource],
            raw: { itemRef: i.itemRef, description: i.description, unit: i.unit, kind: l.kind, quantity: l.quantity ?? "", rate: l.rate == null ? "" : senToDecimalString(l.rate), provisional: l.provisional, sortOrder: String(i.sortOrder), scheduleItem: i.rateSource === "SCHEDULE" ? "keep" : "" },
          };
        }),
      })),
    };
  };
  return {
    exercise: { id: ex.id, reference: ex.reference, title: ex.title },
    statement: BQ_READABLE_STATEMENT,
    current: current ? view(current) : null,
    finalised: finalised && finalised !== current ? view(finalised) : null,
    versions: versions.map((v) => ({ id: v.id, versionNo: v.versionNo, status: BQ_STATUS_LABEL[v.status], finalisedOn: v.finalisedAt ? formatOrgDay(v.finalisedAt, org.timeZone) : null, revisionReason: v.revisionReason || null })),
    actions: {
      start: judged(startBqFaults(versions, ex.status)),
      edit: draft ? judged(draftEditFaults(draft, ex.status)) : ({ allowed: false, reason: "Start the bill, or a revision, to edit it." } as Allowed),
      finalise: draft
        ? judged(finaliseFaults({ status: draft.status, scopedBy: draft.scopedBy, followsStandard: draft.followsStandard, departuresText: draft.departuresText, preparerPersonId: draft.preparerPersonId, lines: linesOf(draft), sectionNumbers: draft.sections.map((s) => s.number) }, { policy, holdings, qualifications, today: org.today, exerciseStatus: ex.status }))
        : ({ allowed: false, reason: "There is no draft to finalise." } as Allowed),
      // A reason is asked for in the dialog; the button is judged without it.
      revise: judged(reviseFaults(versions, ex.status, "given")),
    },
    options: { templates: templates.map((t) => ({ value: t.code, label: t.nameEn })), people, scopedBy: Object.entries(SCOPED_BY_LABEL).map(([value, label]) => ({ value, label })), kinds: Object.entries(ITEM_KIND_LABEL).map(([value, label]) => ({ value, label })), scheduleItems },
    schedulesNote: org.today == null ? scopeFaultText("TIME_ZONE_NOT_SET") : inForce.length === 0 ? "No schedule of rates is in force today, so every rate is entered. Schedules are issued under Configuration, Scope and estimate." : `In force today: ${inForce.map((i) => `${i.label}, ${issueText(i.issueNo)} (from ${formatDate(i.effectiveFrom!)})`).join("; ")}.`,
    csv: {
      importNote: CSV_IMPORT_NOTE,
      exportNote: CSV_EXPORT_NOTE,
      /// Import goes into the draft: the same rule as editing it, plus the upload rules being set.
      import: !draft
        ? ({ allowed: false, reason: scopeFaultText("NO_DRAFT") } as Allowed)
        : !judged(draftEditFaults(draft, ex.status)).allowed
          ? judged(draftEditFaults(draft, ex.status))
          : upload && upload.refusals.length
            ? ({ allowed: false, reason: upload.refusals.join(" ") } as Allowed)
            : !upload?.allowedMediaTypes.includes("text/csv")
              ? ({ allowed: false, reason: "The upload rules do not allow CSV files. Add CSV under Configuration, Documents, Upload rules." } as Allowed)
              : ({ allowed: true } as Allowed),
      draft: draft ? { id: draft.id, versionNo: draft.versionNo, lines: linesOf(draft).length, sections: draft.sections.length } : null,
      exportable: versions.map((v) => ({ value: v.id, label: `Version ${v.versionNo} (${BQ_STATUS_LABEL[v.status].toLowerCase()})` })),
      upload: upload ? { classes: upload.classes.map((c) => ({ value: c.id, label: c.classification ? `${c.nameEn} (${CLASSIFICATION_LABEL[c.classification]})` : `${c.nameEn} (classification not set)` })), people: upload.people.map((p) => ({ value: p.id, label: p.name })), capText: upload.cap ? `Up to ${formatBytes(upload.cap.bytes)}.` : null } : null,
    },
  };
}

// ------------------------------------------------------------------ Company estimate tab (sealed)

export async function estimateTab(organisationId: string, exerciseId: string) {
  const a = await loadAll(organisationId, exerciseId);
  if (!a) return null;
  const { org, ex, policy, estimates } = a;
  const people = await db.person.findMany({ where: { organisationId: org.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const now = new Date();
  // Who prepared each estimate and who made each custody event, signed or recorded from paper, is read from the attributions (Phase 2b).
  const attributed = await loadAttributions(db, org.id, [
    { entity: "CompanyEstimate", slot: "preparer", ids: estimates.map((e) => e.id) },
    { entity: "EstimateEvent", slot: "person", ids: estimates.flatMap((e) => e.events.map((x) => x.id)) },
  ]);
  // X-1: the closing the approval for tendering recorded (6.4), null until then.
  const closingAt: Date | null = ex.closingAt;
  const view = (e: (typeof estimates)[number]) => {
    const facts = factsOf(e);
    const last = e.versions[e.versions.length - 1];
    const lead = leadTime(last ? storedDay(last.preparedOn) : null, closingAt, policy, org.timeZone);
    const asked = (fs: readonly Finding[]) => judged(fs.filter((f) => f.code !== "NOT_POSITIVE" && f.code !== "REASON_REQUIRED" && f.code !== "PERSON_REQUIRED"));
    return {
      id: e.id,
      classification: CLASSIFICATION_LABEL[e.classification],
      state: ESTIMATE_STATE_LABEL[e.state],
      preparer: attributed.read({ entity: "CompanyEstimate", id: e.id, slot: "preparer" }, e.preparer.name).en,
      preparerName: e.preparer.name,
      preparerPersonId: e.preparerPersonId,
      startedOn: e.versions[0] ? storedDay(e.versions[0].preparedOn) : null,
      currentVersionOn: last ? storedDay(last.preparedOn) : null,
      currentVersionNo: e.currentVersionNo,
      lodgedVersionNo: facts.lodgedVersionNo,
      lodgementBehind: lodgementBehind(facts),
      retainedVersionNo: facts.retainedVersionNo,
      retainedPlace: e.retainedPlace || null,
      retainedCopyDue: retainedCopyDue(facts),
      voidReason: e.state === "VOID" ? e.voidReason : null,
      versions: e.versions.map((v) => ({ versionNo: v.versionNo, preparedOn: storedDay(v.preparedOn), preparer: v.preparer.name, value: SEALED_TEXT, reason: v.versionNo === 1 ? null : SEALED_TEXT })),
      events: e.events.map((x) => ({ id: x.id, kind: EVENT_KIND_LABEL[x.kind], by: x.person ? attributed.read({ entity: "EstimateEvent", id: x.id, slot: "person" }, x.person.name).en : null, capacity: x.capacity || null, versionNo: x.versionNo, copyNo: x.copyNo, note: x.kind === "VOIDED" || x.kind === "RETAINED" ? x.note || null : null, at: x.at })),
      lead: { badge: LEAD_STATE_BADGE[lead.state], text: leadTimeText(lead), configured: leadConfiguredText(policy.estimateLeadDays), reading: LEAD_READING },
      actions: {
        amend: asked(versionFaults({ value: 1n, personId: e.preparerPersonId, reason: "given" }, facts, { closingAt, timeZone: org.timeZone, exerciseStatus: ex.status, now })),
        lodge: judged(lodgeFaults(facts, { personId: "given" }, ex.status)),
        retain: judged(retainFaults(facts, { personId: "given", place: "given" })),
        void: judged(voidFault(facts, "given")),
      },
    };
  };
  const liveRow = estimates.find((x) => x.state !== "VOID");
  const start = startFault(estimates);
  const prepare = start ? judged([start]) : judged(versionFaults({ value: 1n, personId: "given", reason: "" }, null, { closingAt, timeZone: org.timeZone, exerciseStatus: ex.status, now }));
  return {
    exercise: { id: ex.id, reference: ex.reference, title: ex.title },
    badge: CLASSIFICATION_LABEL.SULIT,
    timeZone: org.timeZone,
    live: liveRow ? view(liveRow) : null,
    voided: estimates.filter((x) => x.state === "VOID").map(view),
    prepare,
    empty: estimateEmptyState(a.rules.method ? { required: a.rules.method.requiresCompanyEstimate, provenance: a.rules.method.requiresCompanyEstimateProvenance } : null, estimates.some((x) => x.state === "VOID")),
    configHref: SCOPE_CONFIG_PATH,
    people,
  };
}

// ------------------------------------------------------------------ Configuration › Scope and estimate

export async function scopeConfiguration(organisationId: string) {
  const org = await exerciseOrg(organisationId);
  if (!org) return null;
  const [policy, qualifications, holdings, templates, columns, methods, bases, offices, lists, people, units] = await Promise.all([
    loadScopePolicy(org.id),
    loadQualifications(org.id),
    loadHoldings(org.id),
    db.bqTemplate.findMany({ where: { organisationId: org.id }, orderBy: { nameEn: "asc" }, include: { sections: { orderBy: { sortOrder: "asc" } } } }),
    loadPanelColumns(org.id),
    db.sourcingMethod.findMany({ where: { organisationId: org.id }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { id: true, nameEn: true, requiresCompanyEstimate: true, requiresCompanyEstimateProvenance: true, scopeApprovalRequired: true, scopeApprovalProvenance: true, scopeCommitteeCode: true, scopeAct: true, scopeActProvenance: true, retiredOn: true } }),
    db.contractBasis.findMany({ where: { organisationId: org.id }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { id: true, nameEn: true, requiresBq: true, requiresBqProvenance: true, retiredOn: true } }),
    db.authorityRole.findMany({ where: { organisationId: org.id, isCommittee: false }, orderBy: { sortOrder: "asc" }, select: { code: true, nameEn: true } }),
    db.classificationTaxonomy.findMany({ where: { organisationId: org.id }, orderBy: { sortOrder: "asc" }, select: { code: true, nameEn: true } }),
    db.person.findMany({ where: { organisationId: org.id }, orderBy: { name: "asc" }, select: { id: true, name: true, isActive: true } }),
    db.orgUnit.findMany({ where: { organisationId: org.id }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { code: true, nameEn: true, effectiveTo: true } }),
  ]);
  const [committees, rateIssues] = await Promise.all([
    db.committee.findMany({ where: { organisationId: org.id }, orderBy: { nameEn: "asc" }, select: { code: true, nameEn: true, retiredOn: true } }),
    loadRateIssues(org.id),
  ]);
  // Who issued each schedule, signed or recorded from paper, is read from its attribution (Phase 2b).
  const issuedBy = await loadAttributions(db, org.id, [{ entity: "RateSchedule", slot: "issuedBy", ids: rateIssues.map((i) => i.id) }]);
  const nameOf = (rows: readonly { code: string; nameEn: string }[], code: string | null) => (code == null ? NOT_SET : (rows.find((r) => r.code === code)?.nameEn ?? "A row no longer configured"));
  const personName = (id: string) => people.find((p) => p.id === id)?.name ?? "A person no longer on record";
  return {
    policy: {
      raw: policy,
      fields: [
        { label: "Measurement standard", value: policy.measurementStandardLabel ?? NOT_SET, provenance: provenanceText(policy.measurementStandardProvenance), rawProvenance: policy.measurementStandardProvenance },
        { label: "Qualification a bill's preparer holds", value: nameOf(qualifications, policy.bqPreparerQualificationCode), provenance: null },
        { label: "Estimate made at least this many days before closing", value: policy.estimateLeadDays == null ? NOT_SET : `${policy.estimateLeadDays} day${policy.estimateLeadDays === 1 ? "" : "s"}`, provenance: provenanceText(policy.estimateLeadProvenance), rawProvenance: policy.estimateLeadProvenance },
        { label: "Office holding the estimate's copies", value: nameOf(offices, policy.estimateCustodianRoleCode), provenance: null },
        { label: "Office auditing the estimate", value: nameOf(offices, policy.estimateAuditRoleCode), provenance: null },
        { label: "Office that may accept a late estimate", value: policy.estimateOverrideRoleCode == null ? "Not set: no late estimate is accepted" : nameOf(offices, policy.estimateOverrideRoleCode), provenance: null },
        { label: "Most verifiers on a specification panel", value: policy.panelSignatoryLimit == null ? NO_LIMIT : String(policy.panelSignatoryLimit), provenance: provenanceText(policy.panelSignatoryLimitProvenance), rawProvenance: policy.panelSignatoryLimitProvenance },
        { label: "List of contract kinds", value: nameOf(lists, policy.panelContractKindTaxonomyCode), provenance: null },
        { label: "List of project statuses", value: nameOf(lists, policy.panelProjectStatusTaxonomyCode), provenance: null },
        { label: "Opening benchmark row is called", value: policy.benchmarkLabelEn ?? NOT_SET, provenance: null },
      ],
    },
    qualifications: qualifications.map((q) => ({
      id: q.id,
      name: q.nameEn,
      nameMs: q.nameMs ?? "",
      governingSource: q.governingSource,
      provenance: provenanceText(q.provenance),
      rawProvenance: q.provenance as string,
      retiredOn: q.retiredOn,
      holders: holdings.filter((h) => h.qualificationCode === q.code).map((h) => ({ id: h.id, person: personName(h.personId), from: h.validFrom, to: h.validTo, evidence: h.evidenceNote || null, raw: { id: h.id, personId: h.personId, qualificationCode: h.qualificationCode, validFrom: h.validFrom, validTo: h.validTo ?? "", evidenceNote: h.evidenceNote } })),
      code: q.code,
    })),
    templates: templates.map((t) => ({
      id: t.id,
      name: t.nameEn,
      nameMs: t.nameMs ?? "",
      deliverableKind: t.deliverableKind ?? "",
      provenance: provenanceText(t.provenance),
      rawProvenance: t.provenance as string,
      retiredOn: t.retiredOn ? storedDay(t.retiredOn) : null,
      sections: t.sections.map((s) => ({ id: s.id, number: s.number, title: s.titleEn, titleMs: s.titleMs ?? "", sortOrder: String(s.sortOrder) })),
    })),
    columns: columns.map((c) => ({ id: c.id, label: c.labelEn, labelMs: c.labelMs ?? "", unit: c.orgUnitCode ? (units.find((u) => u.code === c.orgUnitCode)?.nameEn ?? "A unit no longer in the structure") : null, orgUnitCode: c.orgUnitCode ?? "", sortOrder: String(c.sortOrder), provenance: provenanceText(c.provenance), rawProvenance: c.provenance as string, retiredOn: c.retiredOn })),
    methods: methods.map((m) => ({ id: m.id, name: m.nameEn, needsEstimate: yesNo(m.requiresCompanyEstimate), raw: m.requiresCompanyEstimate == null ? "unset" : m.requiresCompanyEstimate ? "yes" : "no", rawProvenance: m.requiresCompanyEstimateProvenance ?? "", provenance: m.requiresCompanyEstimate == null ? null : provenanceText(m.requiresCompanyEstimateProvenance), retired: m.retiredOn != null })),
    scopeRules: methods.map((m) => ({
      id: m.id,
      name: m.nameEn,
      required: m.scopeApprovalRequired == null ? NOT_SET : m.scopeApprovalRequired ? "Yes" : "No",
      committee: m.scopeApprovalRequired ? (m.scopeCommitteeCode ? nameOf(committees, m.scopeCommitteeCode) : "Committee not set") : null,
      provenance: m.scopeApprovalRequired == null ? null : provenanceText(m.scopeApprovalProvenance),
      /// The act in words; "Act not set" with a yes and none; null where the answer is not yes.
      act: m.scopeApprovalRequired ? (m.scopeAct ? (ACT_LABEL[m.scopeAct] ?? "An act the portal does not name") : "Act not set") : null,
      raw: { scopeApprovalRequired: m.scopeApprovalRequired == null ? "unset" : m.scopeApprovalRequired ? "yes" : "no", scopeApprovalProvenance: m.scopeApprovalProvenance ?? "", scopeCommitteeCode: m.scopeCommitteeCode ?? "", scopeAct: m.scopeAct ?? "", scopeActProvenance: m.scopeActProvenance ?? "" },
      retired: m.retiredOn != null,
    })),
    schedules: [...new Set(rateIssues.map((i) => i.label))].map((label) => {
      const issues = rateIssues.filter((i) => i.label === label).sort((a, b) => b.issueNo - a.issueNo);
      const current = org.today ? schedulesInForce(issues, org.today)[0] ?? null : null;
      return {
        label,
        inForce: current ? `${issueText(current.issueNo)}, in force from ${formatDate(current.effectiveFrom!)}` : org.today ? "No issue in force today" : "Not known: the organisation's time zone is not set",
        issues: issues.map((i) => ({
          id: i.id,
          title: `${issueText(i.issueNo)}`,
          status: RATE_SCHEDULE_STATUS_LABEL[i.status],
          statusTone: (i.status === "ISSUED" ? "ok" : i.status === "DRAFT" ? "info" : "neutral") as "ok" | "info" | "neutral",
          effective: i.effectiveFrom ? formatDate(i.effectiveFrom) : NOT_SET,
          issued: i.issuedOn ? `${formatDate(i.issuedOn)}${i.issuedBy ? ` · ${issuedBy.read({ entity: "RateSchedule", id: i.id, slot: "issuedBy" }, i.issuedBy).en}` : ""}` : null,
          superseded: i.supersededOn ? formatDate(i.supersededOn) : null,
          provenance: provenanceText(i.provenance),
          rawProvenance: i.provenance as string,
          governingSource: i.governingSource || null,
          draft: i.status === "DRAFT",
          inForceNow: current?.id === i.id,
          items: i.items.map((it) => ({ id: it.id, code: it.code, description: it.descriptionEn, unit: it.unit || null, rate: money(it.rate), raw: { code: it.code, descriptionEn: it.descriptionEn, unit: it.unit, rate: senToDecimalString(it.rate), sortOrder: String(it.sortOrder) } })),
        })),
      };
    }),
    bases: bases.map((b) => ({ id: b.id, name: b.nameEn, letOnBill: yesNo(b.requiresBq), raw: b.requiresBq == null ? "unset" : b.requiresBq ? "yes" : "no", rawProvenance: b.requiresBqProvenance ?? "", provenance: b.requiresBq == null ? null : provenanceText(b.requiresBqProvenance), retired: b.retiredOn != null })),
    options: { units: units.filter((u) => u.effectiveTo == null).map((u) => ({ value: u.code, label: u.nameEn })), offices: offices.map((o) => ({ value: o.code, label: o.nameEn })), lists: lists.map((l) => ({ value: l.code, label: l.nameEn })), qualifications: qualifications.filter((q) => q.retiredOn == null).map((q) => ({ value: q.code, label: q.nameEn })), people: people.filter((p) => p.isActive).map((p) => ({ value: p.id, label: p.name })), committees: committees.filter((c) => c.retiredOn == null).map((c) => ({ value: c.code, label: c.nameEn })), acts: Object.entries(ACT_LABEL).map(([value, label]) => ({ value, label })) },
    today: org.today,
  };
}
