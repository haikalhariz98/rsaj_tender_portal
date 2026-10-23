/**
 * What 6.4's screens read (plan §5): the exercise's Tender documents tab, its Appendix
 * page, the pack's print view, and Configuration › Tender documents. Each view carries
 * words and formatted figures, never codes; and each action it offers carries whether it
 * is allowed and, if not, why — judged by the same pure rule the action runs under its
 * lock, so a disabled button and a refused post give the same reason. Reads only.
 */

import { dayToDate, storedDay, todayIn } from "@/lib/dates";
import { loadAttributions } from "@/lib/auth/attribution-read";
import { db } from "@/lib/db";
import { formatDate, formatOrgDay } from "@/lib/format";
import { ACT_LABEL } from "@/lib/labels";
import { tenderingRoutesOf, latestFirst, requesterHolding } from "@/lib/method/approval";
import { BEHAVIOUR_LABEL, EXERCISE_STATUS_LABEL } from "@/lib/method/labels";
import { evaluationContext, loadExercise } from "@/lib/method/repo";
import { formatSen, parseSen, senToDecimalString } from "@/lib/money";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { holdersFor } from "@/lib/requisition/holders";
import { PROVENANCE_LABEL } from "@/lib/scope/labels";
import { renderedText, renderWith } from "@/lib/templates/merge";

import { APPENDIX_FIELD_LABEL, appendixComplete, appendixFaults, ladDaily, type AppendixFacts } from "./appendix";
import { BEHAVIOURS_AFTER_AWARD, BEHAVIOURS_CHECKED_HERE, behaviourFaults } from "./behaviour";
import { formLabel, resolveComposition } from "./composition";
import { CONFIG_TIME_ZONE_NOT_SET, configHoldingWorkBack, partRetiredOn } from "./config";
import { packFieldValues, WINDOW_FIELD } from "./fields";

const WINDOW_PLACEHOLDER = "[the start and closing days proposed at submission]";
import { appendixText, packManifest, unpricedBqText } from "./freeze";
import {
  appendixHintsByCard,
  BEHAVIOUR_AFTER_AWARD_WHERE,
  behaviourFaultText,
  findingHref,
  LAD_KIND_LABEL,
  type AppendixState,
  NOT_APPLICABLE_BEFORE_ASSEMBLY,
  NOT_SET,
  notIssuedWords,
  periodText,
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
  tenderingStepLabel,
  UPLIFT_KIND_LABEL,
  yesNoNotSet,
} from "./labels";
import { billPartRequired, isLivePack, issuedPart, mayHoldFile, NOT_ISSUED_REASON, packEditFault, partIssue, startPackFaults, submitFaults, nextPack, takesFile, type ContentContext } from "./pack";
import { distinctOffices, pickTemplateView } from "./part-view";
import { wasOmittedByOfficer } from "./pack";
import { newPartsKey, newPartsOf, newPartsView } from "./new-parts";
import { changeListKey, flagChanges, refreshView } from "./refresh";
import { formatPct } from "./percent";
import { appendixFactsOf, contentContextOf, loadConfiguredParts, loadPacks, loadTemplates, loadTenderPolicy, partFactsOf, pinnedFilesOf, profileOf, scopeReadiness, type PackRow } from "./repo";
import { decisionWindow, tenderingRouteForRequester, timeIn } from "./tendering";
import { loadSubmitExtras } from "./submit-extras";
import { liveClauses } from "./clauses";
import { conditionFieldValues, conditionStamp, readConditionsSnapshot } from "./conditions";
import { packWhitelist } from "./fields";
import { tableDocumentManifest } from "./freeze";
import { loadConditions } from "./repo";
import { restrictionFact, stamped, uploadStampNote } from "./stamp";
import type { PackKind } from "./types";

export type Allowed = { allowed: true } | { allowed: false; reason: string };
const money = (s: bigint | null) => (s == null ? NOT_SET : formatSen(s));
const provenance = (p: string | null | undefined) => (p ? ((PROVENANCE_LABEL as Record<string, string>)[p] ?? NOT_SET) : NOT_SET);

/// What the exercise's pack kind reads as. Null: prepared before document assembly existed.
export function packKindText(kind: PackKind | null): string {
  return kind == null ? "Prepared before document assembly" : PACK_KIND_LABEL[kind];
}

async function context(organisationId: string, exerciseId: string) {
  const l = await loadExercise(organisationId, exerciseId);
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

/// The template file of each configured part (SR-11), by the part's code: its name and the address that downloads it. A withdrawn file is no template.
async function templateFilesOf(organisationId: string, configured: readonly { code: string; templateFileVersionId?: string | null }[]): Promise<Map<string, TemplateFileView>> {
  const ids = [...new Set(configured.map((x) => x.templateFileVersionId).filter((x): x is string => !!x))];
  const versions = ids.length ? await db.documentVersion.findMany({ where: { organisationId, id: { in: ids }, withdrawnAt: null }, select: { id: true, originalFilename: true } }) : [];
  return new Map(configured.map((x) => [x.code, versions.find((v) => v.id === x.templateFileVersionId) ? { filename: versions.find((v) => v.id === x.templateFileVersionId)!.originalFilename, href: `/api/documents/versions/${x.templateFileVersionId}` } : null]));
}

export async function documentsTab(organisationId: string, exerciseId: string) {
  const c = await context(organisationId, exerciseId);
  if (!c) return null;
  const { ex, org, req, packs } = c;
  const kind = ex.packKindSnapshot;
  /// Prepared before document assembly existed: no pack kind was ever recorded and none will be. Not "not set": nothing is missing.
  const legacy = kind == null && ex.status !== "DRAFT";
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
  // Increment 2: the conditions, on the organisation's day (none judged without it).
  const conditions = on ? await loadConditions(org.id, ex, shown?.status === "DRAFT" ? shown.id : null, on) : null;
  const whitelist = packWhitelist(conditions ? liveClauses(conditions.clauses.clauses, on!) : []);
  const content: ContentContext = contentContextOf({ scope, appendix: shown?.appendix ?? null, whitelist });
  // SR-11: the template file each configured part carries, as a line offers it.
  const templateFiles = await templateFilesOf(c.org.id, c.configured);

  // The route as it would open, for the submit check (the dates are the drawer's own).
  let route: ReturnType<typeof tenderingRouteForRequester> | null = null;
  let issueInForce = false;
  if (on && shown?.status === "DRAFT") {
    const { issue, ctx, cfg } = await evaluationContext(org, req, ex);
    issueInForce = !!issue && !!ctx;
    const method = cfg.config.methods.find((m) => m.code === ex.sourcingMethodCode) ?? null;
    if (issue && ctx && method) {
      const [roster, delegations, units] = await Promise.all([loadRoster(org.code), loadDelegations(org.code), db.orgUnit.findMany({ where: { organisationId: org.id } })]);
      const unitPath = pathTo(units as unknown as OrgUnit[], req.sectionUnitCode || req.requestingUnitCode, dayToDate(on)).reverse().map((u) => u.code);
      const value = parseSen(ex.estimatedValue.toString());
      route = tenderingRouteForRequester(ctx.funder, method, Number(senToDecimalString(value)), requesterHolding((code) => holdersFor(code, unitPath, roster, delegations, on), req.requestingPersonId, value, (pid) => roster.people.some((p) => p.id === pid && p.isActive && p.isAvailable)));
    }
  }
  // SR-05, SR-06, SR-07: the dates, notice and officers the submit gate also reads, judged the way the act will judge them.
  const extras = shown?.status === "DRAFT" && conditions ? await loadSubmitExtras(ex, org) : null;
  const submit =
    shown?.status === "DRAFT" && conditions && extras
      ? submitFaults({
          packStatus: shown.status,
          exerciseStatus: ex.status,
          parts: shown.parts.map(partFactsOf),
          content,
          scope: scope.input,
          appendix,
          profile: profileOf(ex.classificationSnapshot),
          primeCostSums: scope.bill?.primeCostSums ?? null,
          dates: extras.dates,
          officers: extras.officers,
          notice: extras.notice,
          route: { issue: issueInForce, state: route?.tenderingState ?? (issueInForce ? "NO_METHOD_KEY" : null), refusal: route?.refusal ?? null, errors: (route?.warnings ?? []).filter((w) => w.level === "err").map((w) => w.messageEn) },
          routeOpen: tenderingRoutesOf(ex.approvalInstances).some((i) => i.status === "PENDING"),
          conditions,
        })
      : null;
  const profile = profileOf(ex.classificationSnapshot);
  // SR-11: the checks read the parts as submission settles them (ready, "Not issued", issued as a file), on a draft; a frozen pack's are as they were frozen.
  const checked = shown ? shown.parts.map((p) => (shown.status === "DRAFT" ? issuedPart(partFactsOf(p), content) : partFactsOf(p))) : [];
  const behaviourFindings = shown ? behaviourFaults(profile, { appendix, primeCostSums: scope.bill?.primeCostSums ?? null, billOnScreen: ex.onScreenBillUsed, parts: checked }) : [];
  const valueText = (k: string) => {
    const v = profile?.find((p) => p.key === k)?.value ?? null;
    return v == null ? NOT_SET : typeof v === "boolean" ? (v ? "Yes" : "No") : Array.isArray(v) ? v.join(", ") : String(v);
  };
  const editable = shown ? packEditFault(shown.status, ex.status) == null : false;

  return {
    exercise: { id: ex.id, reference: ex.reference, title: ex.title, status: EXERCISE_STATUS_LABEL[ex.status] },
    facts: {
      documentPack: legacy ? NOT_APPLICABLE_BEFORE_ASSEMBLY : packKindText(kind),
      contractBasis: basis?.nameEn ?? (legacy ? NOT_APPLICABLE_BEFORE_ASSEMBLY : NOT_SET),
      standardForm: shown?.formLabelSnapshot ?? (composition && !("fault" in composition) ? (formLabel(composition.parts, (code) => c.templates.find((t) => t.code === code)?.nameEn ?? null) ?? NOT_SET) : legacy ? NOT_APPLICABLE_BEFORE_ASSEMBLY : NOT_SET),
      version: shown ? `Version ${shown.versionNo}` : legacy ? NOT_APPLICABLE_BEFORE_ASSEMBLY : "None yet",
      status: shown ? PACK_STATUS_LABEL[shown.status] : "Not started",
      /// Whether the tender is restricted: as frozen once the pack is frozen, as answered on the exercise before. Not answered is not "No".
      restricted: legacy ? NOT_APPLICABLE_BEFORE_ASSEMBLY : restrictionFact({ frozen: shown?.frozenAt != null, snapshot: shown?.frozenAt ? readConditionsSnapshot(shown.conditionsSnapshot)?.restriction.restricted : undefined, answer: ex.restrictedTender }),
    },
    start: start.length ? { allowed: false as const, reason: start.map(startFaultText).join(" ") } : { allowed: true as const, label: next.copyFrom ? `Start version ${next.versionNo} from the returned version ${next.copyFrom.versionNo}` : "Start the tender documents" },
    pack: shown ? packView(shown, c, ex.id, editable, content, templateFiles) : null,
    readiness: submit
      ? submitFindingTexts(submit).map((t) => ({ level: t.level, text: t.text, href: findingHref(ex.id, t.family, t.finding) }))
      : [],
    /// A draft can always be submitted from the screen: the findings do not disable the button (founder, 2026-10-05).
    /// `submitPack` judges them under lock and its refusal lists what is missing, so the screen never restates them.
    submit: shown?.status === "DRAFT" ? { allowed: true as const } : { allowed: false as const, reason: shown ? `This version is ${PACK_STATUS_LABEL[shown.status].toLowerCase()}.` : "Start the tender documents first." },
    behaviours: {
      checkedHere: BEHAVIOURS_CHECKED_HERE.map((k) => ({ label: BEHAVIOUR_LABEL[k], value: valueText(k), findings: behaviourFindings.filter((f) => f.data?.behaviour === k || behaviourKeyOf(f.code) === k).map(behaviourFaultText) })),
      afterAward: BEHAVIOURS_AFTER_AWARD.map((b) => ({ label: BEHAVIOUR_LABEL[b.key], value: valueText(b.key), where: BEHAVIOUR_AFTER_AWARD_WHERE[b.where] })),
      notRecorded: profile == null ? behaviourFaultText({ code: "PROFILE_NOT_RECORDED", level: "block" }) : null,
    },
    route: withWindowNote(await routeView(ex, org, req), packs.find((p) => p.status === "SUBMITTED") ?? null),
    /// What the submit drawer says will be frozen: the dates entered on Scope and estimate (SR-05), or that they are not entered.
    entered: { start: ex.proposedStartOn ? formatDate(ex.proposedStartOn) : null, closing: ex.proposedClosingAt ? closingText(ex.proposedClosingAt, org.timeZone) : null },
    dates: approved
      ? { start: formatDate(approved.approvedStartOn), closing: closingText(approved.approvedClosingAt, org.timeZone), approvedOn: formatDate(approved.approvedAt) }
      : shown?.status === "SUBMITTED"
        ? { proposedStart: formatDate(shown.proposedStartOn), proposedClosing: closingText(shown.proposedClosingAt, org.timeZone) }
        : null,
    versions: packs.map((p) => ({
      versionNo: p.versionNo,
      status: PACK_STATUS_LABEL[p.status],
      submittedOn: p.submittedAt ? formatOrgDay(p.submittedAt, c.org.timeZone) : null,
      returnedBecause: p.status === "RETURNED" ? p.returnedReason : null,
      voidBecause: p.status === "VOID" ? p.voidReason : null,
    })),
    /// What the submitter proposed, as the decision form's own values, so approving needs no retyping.
    proposed:
      shown?.status === "SUBMITTED" && shown.proposedStartOn && shown.proposedClosingAt && org.timeZone
        ? { startOn: storedDay(shown.proposedStartOn), closingDay: storedDayIn(shown.proposedClosingAt, org.timeZone), closingTime: timeIn(shown.proposedClosingAt, org.timeZone) }
        : null,
    printHref: shown ? `/sourcing/${ex.id}/documents/print` : null,
    appendixHref: shown?.appendix ? `/sourcing/${ex.id}/appendix` : null,
  };
}

const behaviourKeyOf = (code: string) =>
  ({ DLP_MONTHS_REQUIRED: "defectsLiabilityApplies", DLP_NOT_FOR_TYPE: "defectsLiabilityApplies", NOMINATION_NOT_FOR_TYPE: "nominationAllowed", NOMINATION_BILL_NOT_CHECKED: "nominationAllowed", BOND_FORMS_REQUIRED: "startRequiresSecurities" })[code] ?? null;

/// The closing as the organisation reads it: "29 Oct 2026, 14:30".
function closingText(at: Date | null, timeZone: string | null): string {
  if (!at) return NOT_SET;
  return timeZone ? `${formatDate(storedDayIn(at, timeZone))}, ${timeIn(at, timeZone)}` : `${formatDate(at)} (time zone not set)`;
}
const storedDayIn = (at: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

/// A template file of a configured part, as a line offers it: the file's name and the address that downloads it, or null where none is set (or its version was withdrawn).
export type TemplateFileView = { filename: string; href: string } | null;

/**
 * The pack's parts as the Tender documents tab lists them (SR-11, ruling 14): each line offers Template, Upload, Download and Replace, each with whether it can be
 * done now and, if not, why. There is no Open, Mark ready, Omit, Reopen or "View as frozen". A draft's state is derived from its content (`partIssue`); a frozen
 * pack's is the one it was frozen with. The Appendix stays a form, with a link to fill it in (SR-12, a decided difference).
 */
function packView(p: PackRow, c: NonNullable<Awaited<ReturnType<typeof context>>>, exerciseId: string, editable: boolean, content: ContentContext, templateFiles: ReadonlyMap<string, TemplateFileView>) {
  const manifest = packManifest(p.manifest);
  /// The restriction as this version stands under it: frozen with the pack, or the exercise's answer while it is a draft (U6).
  const restricted = p.frozenAt ? (readConditionsSnapshot(p.conditionsSnapshot)?.restriction.restricted ?? null) : c.ex.restrictedTender;
  const editFault = packEditFault(p.status, c.ex.status);
  const editReason = editFault ? partFaultText(editFault) : null;
  const kind = c.ex.packKindSnapshot;
  const freshParts = editable && p.status === "DRAFT" && c.org.today && kind && kind !== "NONE" ? newPartsOf(resolveComposition(c.configured, kind, c.ex.contractBasisCode, c.org.today), p.parts) : null;
  return {
    id: p.id,
    versionNo: p.versionNo,
    status: PACK_STATUS_LABEL[p.status],
    frozen: p.frozenAt != null,
    frozenOn: p.frozenAt ? formatOrgDay(p.frozenAt, c.org.timeZone) : null,
    returnedBecause: p.status === "RETURNED" ? p.returnedReason : null,
    /// Draft only: take the parts' two answers from the configuration as it stands (BD-64-39), or why that cannot help yet.
    refresh: editable && p.status === "DRAFT" ? refreshView(p.parts.map(partFactsOf), c.configured) : null,
    /// The list that refresh shows, as the key the officer confirms with it (64-C2).
    refreshKey: editable && p.status === "DRAFT" ? changeListKey(flagChanges(p.parts.map(partFactsOf), c.configured)) : null,
    /// Draft only (review M2): the parts configured since the draft was started, which the draft can take; null where there are none.
    newParts: freshParts ? newPartsView(freshParts) : null,
    newPartsKey: freshParts ? newPartsKey(freshParts) : null,
    parts: p.parts.map((row) => {
      const facts = partFactsOf(row);
      const frozenEntry = manifest?.find((m) => m.partCode === row.partCode) ?? null;
      const draft = p.status === "DRAFT";
      const issue = draft ? partIssue(facts, content) : null;
      const files = row.attachments.map((a) => ({ id: a.id, versionId: a.version.id, title: a.version.document.title, versionNo: a.version.versionNo, live: a.detachedAt == null && a.version.withdrawnAt == null }));
      const live = files.filter((f) => f.live);
      // What is issued from this part: its file where it takes one or one has been uploaded in place of its merged text; else its own source.
      const asFile = takesFile(facts, content) || (row.source === "TEMPLATE" && live.length > 0);
      const frozenFiles = frozenEntry?.files ?? [];
      const newest = draft ? (live[0] ? { versionId: live[live.length - 1].versionId, title: live[live.length - 1].title, versionNo: live[live.length - 1].versionNo } : null) : frozenFiles[0] ? { versionId: frozenFiles[0].versionId, title: frozenFiles[0].title, versionNo: frozenFiles[0].versionNo } : null;
      const state = draft
        ? issue!.state === "READY"
          ? "Ready"
          : issue!.state === "NOT_ISSUED"
            ? "Not issued"
            : "Not ready"
        : row.state === "OMITTED" && row.omittedReason === NOT_ISSUED_REASON
          ? "Not issued"
          : PART_STATE_LABEL[row.state];
      const stateKey = state === "Ready" ? ("ok" as const) : state === "Not issued" || state === "Omitted" ? ("neutral" as const) : ("warn" as const);
      // What is missing, in words: a part not ready says what it needs; an optional part with nothing to issue says it will be recorded so.
      const missing = issue && issue.state !== "READY" ? issue.faults.map(partFaultText).join(" ") : null;
      const fileGate: Allowed = !mayHoldFile(facts, content)
        ? { allowed: false, reason: row.source === "APPENDIX" ? "The Appendix is filled in as a form." : content.billOnScreen == null ? partFaultText({ code: "BILL_SWITCH_NOT_SET", level: "block" }) : "The bill of quantities is built on screen on this exercise, so it is not uploaded." }
        : !editable
          ? { allowed: false, reason: editReason ?? "These documents are not being prepared." }
          : { allowed: true };
      const single = row.source === "BQ_UNPRICED";
      const file = templateFiles.get(row.partCode) ?? null;
      return {
        id: row.id,
        printedNumber: row.printedNumber,
        label: row.labelSnapshot,
        /// The pack's own notice (its invitation): the part the printed pack opens at.
        isNotice: row.role === "INVITATION",
        isAppendix: row.source === "APPENDIX",
        role: PART_ROLE_LABEL[row.role],
        content: PART_CONTENT_LABEL[row.content],
        source: PART_SOURCE_LABEL[row.source],
        /// How the part is issued, in words: its file, its merged text, the form, or the bill.
        issuedAs: asFile ? "A file" : row.source === "TEMPLATE" ? "Merged text" : row.source === "APPENDIX" ? "The Appendix, filled in as a form" : "The bill of quantities, unpriced",
        uploadNote: uploadStampNote(restricted, asFile ? "UPLOAD" : row.source),
        preparedBy: c.unitName(row.ownerOrgUnitCode),
        // Review S5: the line says what the gate will hold the part to.
        mandatory: draft && billPartRequired(facts, content) ? "Yes" : yesNoNotSet(row.mandatory),
        inTableDocument: yesNoNotSet(row.inTableDocument),
        state,
        stateKey,
        omittedBecause: !draft && row.state === "OMITTED" && row.omittedReason !== NOT_ISSUED_REASON ? row.omittedReason : null,
        /// Review S6: a draft part an officer once omitted (before ruling 14), with the reason they gave. It is judged by its content now, and the line says so.
        earlierOmission: draft && wasOmittedByOfficer(facts) ? row.omittedReason : null,
        missing,
        template: row.template ? `${row.template.nameEn}, text version ${row.template.bodyVersion}` : row.source === "TEMPLATE" ? NOT_SET : null,
        files,
        actions: {
          /// Template: a merged-text part's library template and its merged draft; any other part's configured template file, or "No template set".
          template:
            row.source === "TEMPLATE"
              ? ({
                  kind: "MERGED" as const,
                  pick: pickTemplateView({ source: row.source, content: row.content, templateId: row.templateId, printedNumber: row.printedNumber, label: row.labelSnapshot }, c.templates, editable ? null : editFault, suitedTemplateCodes(c.configured, row.role)),
                  draftHref: row.templateId && editable ? `/sourcing/${exerciseId}/documents/draft/${row.id}` : null,
                  file,
                } as const)
              : file
                ? ({ kind: "FILE" as const, file } as const)
                : ({ kind: "NONE" as const, reason: row.source === "APPENDIX" ? "The Appendix is filled in as a form." : "No template set" } as const),
          upload: fileGate.allowed ? (single && live.length > 0 ? { allowed: false as const, reason: partFaultText({ code: "BILL_IS_ONE_FILE", level: "block" }) } : fileGate) : fileGate,
          replace: fileGate.allowed ? (live.length > 0 ? fileGate : { allowed: false as const, reason: "Nothing to replace yet. Upload the first file." }) : fileGate,
          download: newest ? ({ allowed: true as const, href: `/api/documents/versions/${newest.versionId}`, name: `${newest.title}, version ${newest.versionNo}`, more: (draft ? live.length : frozenFiles.length) - 1 } as const) : ({ allowed: false as const, reason: row.source === "TEMPLATE" ? (draft ? "Nothing is uploaded. The merged text is issued as it reads when the documents are submitted." : row.state === "OMITTED" && row.omittedReason === NOT_ISSUED_REASON ? "Nothing was uploaded and this part was not issued." : "Nothing was uploaded. The merged text was issued as it read when the documents were submitted.") : row.source === "APPENDIX" ? "The Appendix is filled in as a form." : "No file has been uploaded." } as const),
        },
        frozen: frozenEntry ? { files: frozenEntry.files.map((f) => ({ title: f.title, versionNo: f.versionNo, fingerprint: f.sha256 })) } : null,
      };
    }),
  };
}

/// Increment 2: where the pack with approval froze a notice stating the validity window, the approving step is told the days it must record (BD-64-31).
function withWindowNote<R extends { decide: object | null } | null>(route: R, submitted: PackRow | null): R {
  if (!route?.decide) return route;
  const stated = submitted ? readConditionsSnapshot(submitted.conditionsSnapshot)?.windowStated : null;
  const fixed = decisionWindow(stated ?? null);
  return { ...route, decide: { ...route.decide, fixedWindow: fixed } };
}

/// The templates the configuration names for parts of a role; null where it names none, so nothing is narrowed to an empty list.
function suitedTemplateCodes(configured: readonly { role: string; templateCode: string | null }[], role: string): ReadonlySet<string> | null {
  const codes = new Set(configured.filter((x) => x.role === role && x.templateCode).map((x) => x.templateCode as string));
  return codes.size > 0 ? codes : null;
}

async function routeView(ex: NonNullable<Awaited<ReturnType<typeof loadExercise>>>["ex"], org: { id: string; code: string; today: string | null }, req: { sectionUnitCode: string | null; requestingUnitCode: string; requestingPersonId: string }) {
  const routes = latestFirst(tenderingRoutesOf(ex.approvalInstances));
  const current = routes[0] ?? null;
  if (!current) return null;
  const pending = current.steps.find((s) => s.decision === "PENDING") ?? null;
  let people: { value: string; label: string }[] = [];
  if (pending && org.today && !pending.committeeCode) {
    const [roster, delegations, units] = await Promise.all([loadRoster(org.code), loadDelegations(org.code), db.orgUnit.findMany({ where: { organisationId: org.id } })]);
    const unitPath = pathTo(units as unknown as OrgUnit[], req.sectionUnitCode || req.requestingUnitCode, dayToDate(org.today)).reverse().map((u) => u.code);
    const office = pending.actingRoleCode ?? pending.roleCode;
    const h = office ? holdersFor(office, unitPath, roster, delegations, org.today) : null;
    const ids = new Set([...(h?.holderIds ?? []), ...(h?.delegates.map((d) => d.personId) ?? [])]);
    people = roster.people.filter((p) => ids.has(p.id) && p.id !== req.requestingPersonId).map((p) => ({ value: p.id, label: p.name }));
  }
  const last = pending ? current.steps.every((s) => s.id === pending.id || s.decision === "DONE") : false;
  // Who decided each step, signed or recorded from paper, is read from its attribution (Phase 2b).
  const decided = await loadAttributions(db, org.id, [{ entity: "ApprovalStep", slot: "decidedBy", ids: current.steps.map((s) => s.id) }]);
  return {
    status: tenderingRouteLabel(current.status, current.warnings),
    rule: current.ruleLabel ?? NOT_SET,
    matrix: current.matrixLabel ?? NOT_SET,
    ifRejected: "Returned for amendment",
    steps: current.steps.map((s) => ({
      id: s.id,
      office: s.actingRoleLabel ?? s.roleLabel,
      act: ACT_LABEL[s.act] ?? "Acts",
      decision: tenderingStepLabel(s.decision),
      decidedBy: s.decidedByName ? decided.read({ entity: "ApprovalStep", id: s.id, slot: "decidedBy" }, s.decidedByName).en : null,
      decidedOn: s.decidedOn ? formatDate(s.decidedOn) : null,
      reason: s.reason || null,
    })),
    decide: pending ? { stepId: pending.id, office: pending.actingRoleLabel ?? pending.roleLabel, people, recordsDates: last, committee: !!pending.committeeCode } : null,
    earlier: routes.slice(1).map((r) => ({ openedOn: formatDate(r.openedAt), status: tenderingRouteLabel(r.status, r.warnings), reason: r.rejectionReason || null })),
  };
}

// ------------------------------------------------------------------ the Appendix page

export async function appendixPage(organisationId: string, exerciseId: string) {
  const c = await context(organisationId, exerciseId);
  if (!c) return null;
  const pack = c.packs.find((p) => isLivePack(p.status)) ?? c.packs.find((p) => p.status === "APPROVED") ?? c.packs[0] ?? null;
  if (!pack?.appendix) return { exercise: { id: c.ex.id, reference: c.ex.reference, title: c.ex.title }, appendix: null, why: pack ? "This pack's parts have no Appendix to the Conditions of Contract." : c.ex.status === "DRAFT" ? "Move the exercise into preparation first, then start the tender documents." : "Start the tender documents first." };
  const a = appendixFactsOf(pack.appendix);
  const editable = packEditFault(pack.status, c.ex.status);
  const profile = profileOf(c.ex.classificationSnapshot);
  const dlpRule = profile?.find((p) => p.key === "defectsLiabilityApplies")?.value ?? null;
  const p = c.policy;
  const lad = ladDaily(a, null);
  return {
    exercise: { id: c.ex.id, reference: c.ex.reference, title: c.ex.title },
    version: pack.versionNo,
    /// Where the pack stands, for the page's tense: being entered, frozen, or the exercise not yet in preparation.
    state: (editable == null ? "EDITING" : editable.code === "PACK_NOT_DRAFT" ? "FROZEN" : "NOT_IN_PREPARATION") as AppendixState,
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
      tail: p.insurance.extraMonths == null ? `Insurance beyond the defects liability period: ${NOT_SET}` : `Insurance runs ${periodText(p.insurance.extraMonths, p.insurance.extraDays ?? 0)} beyond the defects liability period (${provenance(p.insuranceExtraProvenance).toLowerCase()}).`,
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
      value: a.dlpApplies == null ? NOT_SET : a.dlpApplies ? (a.dlpMonths == null ? NOT_SET : periodText(a.dlpMonths, 0)) : "Does not apply",
      /// FR-MTD-012: hidden, with the reason, where the contract type has none.
      hidden: dlpRule === false ? "The contract type has no defects liability period." : null,
      typeNotSet: dlpRule == null ? behaviourFaultText({ code: "BEHAVIOUR_NOT_SET", level: "block", data: { behaviour: "defectsLiabilityApplies" } }) : null,
    },
    interim: {
      first: money(a.firstInterimMinimum),
      /// The policy states the first certificate's minimum as a rule, not a flat figure: where the figure entered is the rule's floor, the rule is what is said.
      firstRule: p.firstCertificateFloor != null && p.firstCertificatePct != null && a.firstInterimMinimum != null && a.firstInterimMinimum === p.firstCertificateFloor ? `The lesser of ${formatSen(p.firstCertificateFloor)} and ${formatPct(p.firstCertificatePct)} of the builders' works value` : null,
      later: money(a.subsequentInterimMinimum),
      honourDays: a.honourCertificateDays == null ? NOT_SET : `${a.honourCertificateDays} days`,
      /// The policy's rule in words, with its provenance: computed against the awarded value, never the department's bill (SULIT).
      suggestion: p.firstCertificateFloor != null && p.firstCertificatePct != null ? `The policy's first-certificate minimum is the lesser of ${formatSen(p.firstCertificateFloor)} and ${formatPct(p.firstCertificatePct)} of the builders' works value (${provenance(p.firstCertificateProvenance).toLowerCase()}).` : null,
    },
    /// SR-12: the findings Save does not check, said on their own cards.
    hints: appendixHintsByCard(appendixFaults(a)),
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
export async function printView(organisationId: string, exerciseId: string, set: "pack" | "table" = "pack") {
  const c = await context(organisationId, exerciseId);
  if (!c) return null;
  const pack = c.packs.find((p) => p.status === "APPROVED") ?? c.packs.find((p) => isLivePack(p.status)) ?? null;
  // No pack to print: the page says so and links back, rather than reading as a missing page.
  if (!pack) return { none: true as const, exercise: { id: c.ex.id, reference: c.ex.reference, title: c.ex.title }, why: c.ex.packKindSnapshot == null && c.ex.status !== "DRAFT" ? "This exercise was prepared before tender document assembly, so its documents were prepared outside the portal." : "No tender documents have been started for this exercise, so there is nothing to print yet." };
  const title = `${PACK_KIND_LABEL[pack.packKind]}: ${c.ex.title}`;
  const watermark = pack.status === "APPROVED" ? null : pack.status === "SUBMITTED" ? "With approval, not issued" : "Draft, not issued";
  const manifest = packManifest(pack.manifest);
  // FR-DOC-010 (the part built here): the Tender Table Document is the parts flagged for it, ready.
  const document = set === "table" ? "Tender Table Document" : PACK_KIND_LABEL[pack.packKind];
  if (pack.frozenAt && manifest) {
    const snapshot = readConditionsSnapshot(pack.conditionsSnapshot);
    const restrictedFrozen = snapshot?.restriction.restricted ?? null;
    return {
      exercise: { id: c.ex.id, reference: c.ex.reference, title: c.ex.title },
      title,
      version: pack.versionNo,
      document,
      form: pack.formLabelSnapshot ?? NOT_SET,
      watermark,
      /// An approved pack's header states when it was approved and the window tendering runs over.
      approvedLine: pack.status === "APPROVED" ? `Approved for tendering ${formatDate(pack.approvedAt)} · Tendering ${formatDate(pack.approvedStartOn)} to ${closingText(pack.approvedClosingAt, c.org.timeZone)}` : null,
      /// FR-DOC-009: the restriction as frozen; null where not restricted or frozen before increment 2.
      stamp: snapshot?.restriction.restricted ? (snapshot.restriction.stampEn ?? snapshot.restriction.stampMs) : null,
      parts: (set === "table" ? tableDocumentManifest(manifest) : manifest).map((m) => ({
        printedNumber: m.printedNumber,
        label: m.label,
        omitted: m.state === "OMITTED" ? (m.omittedReason === NOT_ISSUED_REASON ? notIssuedWords(m.source) : `Omitted: ${m.omittedReason}`) : null,
        texts: pack.documents.filter((d) => d.partCode === m.partCode).map((d) => ({ language: d.language === "MS" ? "Malay" : "English", paragraphs: d.renderedText.split("\n\n"), fidelity: d.templateName ? `From ${d.templateName}${d.templateFormCode ? ` (${d.templateFormCode})` : ""}, text version ${d.templateBodyVersion}, frozen ${formatOrgDay(d.frozenAt, c.org.timeZone)}.` : `${PART_SOURCE_LABEL[d.source]}, frozen ${formatOrgDay(d.frozenAt, c.org.timeZone)}.` })),
        files: m.files.map((f) => ({ title: f.title, versionNo: f.versionNo, fingerprint: f.sha256 })),
        stampNote: uploadStampNote(restrictedFrozen, m.source),
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
  // Increment 2, live: the conditions' fields (the window empty until dates are proposed) and the stamp, as the freeze will apply them.
  const conditions = c.org.today ? await loadConditions(c.org.id, c.ex, pack.id, c.org.today) : null;
  const byLang = conditions ? conditionFieldValues(conditions, null) : null;
  // The window is stated only once the days are proposed at submission: a draft says so, in place of the gap.
  if (byLang) for (const lang of ["EN", "MS"] as const) byLang[lang][WINDOW_FIELD] = WINDOW_PLACEHOLDER;
  const whitelist = packWhitelist(conditions ? liveClauses(conditions.clauses.clauses, c.org.today!) : []);
  const stamp = conditions ? conditionStamp(conditions) : null;
  const shownParts = set === "table" ? pack.parts.filter((p) => p.inTableDocument === true && p.state !== "OMITTED") : pack.parts;
  return {
    exercise: { id: c.ex.id, reference: c.ex.reference, title: c.ex.title },
    title,
    version: pack.versionNo,
    document,
    form: pack.formLabelSnapshot ?? NOT_SET,
    watermark,
    stamp: stamp ? (stamp.EN ?? stamp.MS) : null,
    parts: shownParts.map((p) => ({
      printedNumber: p.printedNumber,
      label: p.labelSnapshot,
      omitted: p.state === "OMITTED" ? `Omitted: ${p.omittedReason}` : null,
      texts:
        p.source === "TEMPLATE" && p.template && pinnedFilesOf(p).length === 0
          ? (["EN"] as const).flatMap((lang) => {
              const body = p.template!.bodyEn;
              return body?.trim() ? [{ language: "English", paragraphs: stamped(renderedText(renderWith(body, { ...fields, ...(byLang?.[lang] ?? {}) }, whitelist)), stamp?.[lang]).split("\n\n"), fidelity: `From ${p.template!.nameEn}${p.template!.formCode ? ` (${p.template!.formCode})` : ""}, text version ${p.template!.bodyVersion}, as it stands now.` }] : [];
            })
          : p.source === "BQ_UNPRICED" && scope.bill
            ? [{ language: "English", paragraphs: stamped(unpricedBqText(scope.bill.frozen), stamp?.EN).split("\n\n"), fidelity: "The bill of quantities, unpriced, as it stands now." }]
            : p.source === "APPENDIX" && a
              ? [{ language: "English", paragraphs: stamped(appendixText(a, c.office), stamp?.EN).split("\n\n"), fidelity: "The Appendix as entered so far." }]
              : [],
      files: pinnedFilesOf(p).map((f) => ({ title: f.title, versionNo: f.versionNo, fingerprint: f.sha256 })),
      stampNote: uploadStampNote(stamp ? true : null, p.source),
    })),
  };
}

/**
 * One merged-text part as a plain-text draft to download (SR-11, ruling 14: "Template" on a merged-text line downloads the merged draft): its template in each language it has
 * text in, merged with the exercise's details as they stand now and marked as a draft. A field with nothing to merge is said as the merge says it. Null where the part is not a merged-text
 * part of the draft pack, or has no template. Reads only.
 */
export async function mergedDraft(organisationId: string, exerciseId: string, partId: string): Promise<{ filename: string; text: string } | null> {
  const c = await context(organisationId, exerciseId);
  if (!c) return null;
  const pack = c.packs.find((p) => isLivePack(p.status)) ?? null;
  const p = pack?.parts.find((x) => x.id === partId) ?? null;
  if (!pack || !p || p.source !== "TEMPLATE" || !p.template) return null;
  const org = await db.organisation.findUniqueOrThrow({ where: { id: c.org.id }, select: { name: true } });
  const basis = await db.contractBasis.findFirst({ where: { organisationId: c.org.id, code: pack.contractBasisCode }, select: { nameEn: true } });
  const type = c.ex.contractTypeCode ? await db.contractType.findFirst({ where: { organisationId: c.org.id, code: c.ex.contractTypeCode }, select: { nameEn: true } }) : null;
  const fields = packFieldValues({ organisationName: org.name, exerciseReference: c.ex.reference, exerciseTitle: c.ex.title, requisitionReference: c.req.reference, packKindLabel: PACK_KIND_LABEL[pack.packKind], versionNo: pack.versionNo, formLabel: pack.formLabelSnapshot, basisName: basis?.nameEn ?? null, typeName: type?.nameEn ?? null });
  const conditions = c.org.today ? await loadConditions(c.org.id, c.ex, pack.id, c.org.today) : null;
  const byLang = conditions ? conditionFieldValues(conditions, null) : null;
  if (byLang) for (const lang of ["EN", "MS"] as const) byLang[lang][WINDOW_FIELD] = WINDOW_PLACEHOLDER;
  const whitelist = packWhitelist(conditions ? liveClauses(conditions.clauses.clauses, c.org.today!) : []);
  const stamp = conditions ? conditionStamp(conditions) : null;
  const t = p.template;
  const blocks = (["EN"] as const).flatMap((lang) => {
    const body = t.bodyEn;
    if (!body?.trim()) return [];
    const text = stamped(renderedText(renderWith(body, { ...fields, ...(byLang?.[lang] ?? {}) }, whitelist)), stamp?.[lang]);
    return [`English\n\n${text}`];
  });
  if (blocks.length === 0) return null;
  const head = [`${c.ex.reference} · ${p.printedNumber}. ${p.labelSnapshot}`, `Draft, not issued: the template ${t.nameEn}, text version ${t.bodyVersion}, merged with this exercise's details as they stand now.`].join("\n");
  const safe = `${c.ex.reference} part ${p.printedNumber} draft`.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return { filename: `${safe}.txt`, text: [head, ...blocks].join("\n\n----\n\n") + "\n" };
}

// ------------------------------------------------------------------ Configuration › Tender documents

export async function tenderDocsConfig(organisationId: string, showRetired = false) {
  const org = await db.organisation.findUnique({ where: { id: organisationId }, select: { id: true, timeZone: true } });
  if (!org) return null;
  const [parts, policy, methods, bases, templates, units] = await Promise.all([
    loadConfiguredParts(org.id),
    loadTenderPolicy(org.id),
    db.sourcingMethod.findMany({ where: { organisationId: org.id }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { id: true, nameEn: true, documentPackKind: true, documentPackKindProvenance: true, retiredOn: true } }),
    db.contractBasis.findMany({ where: { organisationId: org.id }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { code: true, nameEn: true, retiredOn: true } }),
    db.documentTemplate.findMany({ where: { organisationId: org.id }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { code: true, nameEn: true, bodyVersion: true } }),
    db.orgUnit.findMany({ where: { organisationId: org.id }, orderBy: { nameEn: "asc" }, select: { code: true, nameEn: true, effectiveFrom: true, effectiveTo: true } }),
  ]);
  // The organisation's day, never UTC's: unset zone leaves a retirement not judged, and says so.
  const today = todayIn(new Date(), org.timeZone);
  const retired = (p: { retiredOn: string | null }) => partRetiredOn(p.retiredOn, today);
  // SR-11: the template file each part carries, by name (a file withdrawn since reads as none).
  const fileIds = [...new Set(parts.map((p) => p.templateFileVersionId).filter((x): x is string => !!x))];
  const fileVersions = fileIds.length ? await db.documentVersion.findMany({ where: { organisationId: org.id, id: { in: fileIds }, withdrawnAt: null }, select: { id: true, originalFilename: true, versionNo: true } }) : [];
  const templateFileOf = (id: string | null | undefined) => {
    const v = id ? fileVersions.find((x) => x.id === id) : null;
    return v ? `${v.originalFilename}, version ${v.versionNo}` : null;
  };
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
          // 6.7 (6.6 ruling): asked of a mandatory part only; the declaration is returned by definition.
          returned: r.mandatory !== true ? null : r.role === "DECLARATION" ? "Returned by the bidder (the declaration always is)" : r.returnedByBidder == null ? NOT_SET : r.returnedByBidder ? "Returned by the bidder" : "Not returned by the bidder",
          template: r.templateCode ? (templates.find((t) => t.code === r.templateCode)?.nameEn ?? "A template no longer configured") : null,
          /// SR-11: the template file an officer downloads from the part's line; null: no template set.
          templateFile: templateFileOf(r.templateFileVersionId),
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
    empty: parts.length === 0 ? "No parts set. Add parts for each pack kind first." : null,
    methods: methodRows,
    policy: {
      restrictionStampEn: policy.restrictionStampTextEn ?? NOT_SET,
      restrictionStampMs: policy.restrictionStampTextMs ?? NOT_SET,
      assuranceRequired: yesNoNotSet(policy.assuranceRequired),
      ladDailyRate: policy.ladDailyPct ? `${formatPct(policy.ladDailyPct)} of the contract sum a day` : NOT_SET,
      ladDailyRateProvenance: provenance(policy.ladDailyPctProvenance),
      firstCertificate: policy.firstCertificateFloor != null && policy.firstCertificatePct != null ? `The lesser of ${formatSen(policy.firstCertificateFloor)} and ${formatPct(policy.firstCertificatePct)} of the builders' works value` : NOT_SET,
      firstCertificateProvenance: provenance(policy.firstCertificateProvenance),
      insuranceTail: policy.insurance.extraMonths == null ? NOT_SET : `${periodText(policy.insurance.extraMonths, policy.insurance.extraDays ?? 0)} beyond the defects liability period`,
      insuranceTailProvenance: provenance(policy.insuranceExtraProvenance),
      designAndBuildTail: policy.insurance.dbExtraMonths == null ? NOT_SET : `${periodText(policy.insurance.dbExtraMonths, policy.insurance.dbExtraDays ?? 0)} beyond the defects liability period`,
      designAndBuildTailProvenance: provenance(policy.dbInsuranceExtraProvenance),
      governingSource: policy.governingSource || null,
    },
    options: {
      packKinds: [{ value: "TENDER", label: PACK_KIND_LABEL.TENDER }, { value: "QUOTATION", label: PACK_KIND_LABEL.QUOTATION }],
      methodPackKinds: [{ value: "TENDER", label: PACK_KIND_LABEL.TENDER }, { value: "QUOTATION", label: PACK_KIND_LABEL.QUOTATION }, { value: "NONE", label: PACK_KIND_LABEL.NONE }, { value: "unset", label: NOT_SET }],
      bases: bases.filter((b) => b.retiredOn == null).map((b) => ({ value: b.code, label: b.nameEn })),
      templates: templates.map((t) => ({ value: t.code, label: `${t.nameEn} (text version ${t.bodyVersion})` })),
      units: distinctOffices(units),
      roles: Object.entries(PART_ROLE_LABEL).map(([value, label]) => ({ value, label })),
      contents: Object.entries(PART_CONTENT_LABEL).map(([value, label]) => ({ value, label })),
      sources: Object.entries(PART_SOURCE_LABEL).map(([value, label]) => ({ value, label })),
    },
  };
}
