import { fundingCard, fundingFact, fundingTextForContract, fundingTextForRequisition, impactCard } from "@/lib/funding/store";
import { FundingCard } from "./funding-card";
import { ImpactCard } from "./impact-card";
import { MoreText } from "@/components/ui/more-text";
import { billItemOptions } from "@/lib/contract/bill-items";
import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { ActGate } from "@/components/act-gate";
import { actStatusBlocker, actStatusText } from "@/lib/contract/act-status";
import { CONTRACT_STATUS_WORDS, type Words } from "@/lib/contract/labels";
import { ENGLISH } from "@/lib/i18n/language";
import { COMPONENT_WORDS } from "@/lib/i18n/catalogues/components";
import type { Language } from "@/lib/i18n/language";
import { say, sayWith } from "@/lib/i18n/say";
import { AWARD_STATUS_WORDS, CASE_HEADER_WORDS as H, CASE_LINK_ACTION_WORDS, CASE_PANEL_TITLE_WORDS as P, CASE_REFUSAL_WORDS as R, CASE_STEP_WORDS, CASE_TAB_WORDS, INSTRUMENT_SHORT_WORDS } from "@/lib/contract/case-page-words";
import { historyEntityLabel, PAYMENT_ENTITIES, RECORD_TYPE_WORDS, SUPERVISION_ENTITIES, TIME_ENTITIES, VARIATION_ENTITIES } from "@/lib/audit/entity-labels";
import { timeView } from "@/lib/time/view";
import { notFound, redirect } from "next/navigation";
import { AWARD_NOTE_ID } from "@/app/awards/editors";
import { loadCase } from "@/app/_auth/case";
import { Stepper, type StepperStep } from "@/components/ui/stepper";
import { AWARD_STATUS_TONE } from "@/lib/award/labels";
import { loadAward } from "@/lib/award/repo";
import type { AwardStatus, InstrumentKind } from "@/lib/award/types";
import { caseStage } from "@/lib/contract/case-stage";
import { caseSteps, defaultCaseStep, earlierOpenSteps, SIGNED_CONTRACT_STATUSES, type CaseAction, type CaseFacts } from "@/lib/contract/case-steps";
import { nextLine, primaryAction } from "@/lib/contract/primary-action";
import { MoreActions } from "@/components/ui/more-actions";
import { CASE_TABS, HISTORY_TAB } from "@/lib/contract/case-tabs";
import { caseHistorySources, resolveCaseView } from "@/lib/contract/case-view";
import { CASE_ACTION_AT, caseHref, keepQuery } from "@/lib/contract/links";
import type { HiddenAct } from "@/lib/supervision/authority";
import { buildAwardView, type AwardPanelId } from "./award/award-view";
import { possessionBlockerOf, signingActOf, startState } from "./signing-acts";

import { ReadinessGateList } from "@/components/contract/readiness-gate";
import { AwardIcon, BuildingIcon, CalendarIcon, CheckIcon, ClipboardIcon, ClockIcon, FileIcon, FilesIcon, InboxIcon, RouteIcon, ScaleIcon, ShieldIcon, SlidersIcon, ToolsIcon, UsersIcon, WalletIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Tabs, type TabSpec } from "@/components/tabs";
import { Badge, Chip, SulitValue } from "@/components/ui/badge";
import { Blocked } from "@/components/ui/blocked";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { KeyValues } from "@/components/ui/stat";
import { INSURANCE_KIND_LABEL, REGISTER_STATUS_LABEL, REGISTER_STATUS_TONE, SECURITY_KIND_LABEL, WC_BASIS_LABEL } from "@/lib/award/labels";
import { loadExpiryOffsets } from "@/lib/award/repo";
import { expiryAlert, expiryChip, remindersText } from "@/lib/securities/expiry";
import { arithmeticVariance } from "@/lib/contract/formation";
import { signingFacts } from "@/lib/contract/judge";
import { historyFieldLabel, historyValue } from "@/lib/contract/history-words";
import { CONTRACT_YEAR_WORDS, contractYearReading } from "@/lib/contract/issue-year";
import { PHASE_TONE, PHASE_WORDS } from "@/lib/contract/labels";
import { contractHistory } from "@/lib/contract/load";
import { readFormationSnapshot } from "@/lib/contract/preparation";
import { loadContract, type LoadedContract } from "@/lib/contract/repo";
import { briefingMissing } from "@/lib/contract/sign";
import { isExecuted, possessionTaken } from "@/lib/contract/status";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOrNull as day, dayToDate } from "@/lib/dates";
import { raiseCaseClockNotices } from "@/lib/award/clock-notices";
import { db } from "@/lib/db";
import { formatDate, formatOrgDay } from "@/lib/format";
import { formatMoney, parseSen, senFromDecimal } from "@/lib/money";
import { fieldsOfScope, ROUTED_MATTER_VALUE_FIELD } from "@/lib/sulit-fields";
import { sulitGate, sulitGates } from "@/app/_auth/sulit";
import { contractDocumentFacts } from "@/lib/certificate/register";
import { sulitHistoryValue } from "@/lib/auth/sulit-history";
import { through, type Sulit } from "@/lib/auth/sulit-access";

import type { StaffActor } from "@/lib/auth/types";
import { CONTACT_NAME_FIELDS, loadKickOffCard } from "@/lib/project-docs/kick-off-read";
import type { ContactSubject } from "@/lib/project-docs/team-read";
import { BaselinePanel } from "./baseline-panel";
import { KickOffCard } from "./kick-off-card";
import { DocumentsPanel } from "./documents-panel";
import { SubmissionsTab } from "./submissions-tab";
import { StartPreparationDrawer, WcCheckDrawer } from "./editors";
import { FormationPanel } from "./formation-panels";
import { loadSupplyClaims, paymentRouteOf } from "@/lib/project-docs/supply-read";
import { PaymentsPanel, PaymentSummaryCard, paymentView, type PaymentView } from "./payment-panels";
import { OnSiteCard, SitePanel, supervisionView, TeamPanel, type SupervisionView } from "./supervision-panels";
import { hiddenFor } from "@/lib/supervision/authority";
import { delegationFactsOf } from "@/lib/supervision/load";
import { SUPERVISION_ACTS } from "@/lib/supervision/types";
import { VariationsPanel, VariationSummaryCard } from "./variation-panels";
import { TimePanel } from "./time-panels";
import { CompletionPanel, DefectsPanel } from "./closeout-panels";
import { closeoutView, dlpNotice } from "@/lib/closeout/view";
import { variationView, type VariationView } from "@/lib/variation/view";
import { requireStaff } from "@/app/_auth/actor";
import { exerciseIsHidden } from "@/app/_auth/sulit";

export const metadata = { title: "Project" };

export const dynamic = "force-dynamic";

type Option = { value: string; label: string };
const notSet = (what = "Not set") => <span className="text-ink-4">{what}</span>;
const TONE = { brand: "brand", info: "info", ok: "ok", warn: "warn", err: "err", neutral: undefined } as const;

// ------------------------------------------------------------------ the case

/// How each tab of the case looks in the strip. The ids are `CASE_TABS`' (src/lib/contract/case-tabs.ts), which decides which stage
/// lists which; "instrument" is the Letter (AC-19).
const TAB_ICON: Readonly<Record<string, ReactNode>> = {
  overview: <AwardIcon size={15} />,
  approval: <RouteIcon size={15} />,
  instrument: <FileIcon size={15} />,
  distribution: <InboxIcon size={15} />,
  return: <ClipboardIcon size={15} />,
  routing: <SlidersIcon size={15} />,
  conditions: <CheckIcon size={15} />,
  securities: <ShieldIcon size={15} />,
  formation: <ToolsIcon size={15} />,
  baseline: <FileIcon size={15} />,
  team: <UsersIcon size={15} />,
  site: <BuildingIcon size={15} />,
  payments: <WalletIcon size={15} />,
  variations: <ScaleIcon size={15} />,
  time: <CalendarIcon size={15} />,
  documents: <FilesIcon size={15} />,
  submissions: <InboxIcon size={15} />,
};


const STEP_STATE = { done: "done", "in-progress": "current", waiting: "waiting" } as const;

/// The label of a main button that is a link to the panel holding the act's drawer (see `CASE_ACTION_AT`).
const LINK_ACTION_WORDS: Readonly<Partial<Record<CaseAction, Words>>> = CASE_LINK_ACTION_WORDS;

/// AC-37 (a): the conditions are not withheld (the Project overview shows them); only adding and settling them is restricted (`CASE_REFUSAL_WORDS`).

/**
 * The case (Award and Contract Requirements v2, C-1, C-2; design note 0004 C5; ADR 0037): one page for an award from "Start the
 * award" to "On site", keyed by the contract once there is one and by the award until then. A step bar of five stages, a "What's
 * next" line and one main button; below it the tabs of the stage being viewed, one at a time.
 *
 * - `loadCase` answers first: unknown or hidden is a 404, an award id whose contract exists is a redirect that keeps the query.
 * - The Award stage reads the award's readers and the exercise's SULIT gates (`buildAwardView`). The contract stages read the
 *   contract's readers and its own `contract` gate. Neither gate is handed to the other's panels.
 * - A reader who sees the contract stages only (a restricted exercise, once issued) gets no award reader at all (AC-18).
 * - A case with no Contract row runs no contract reader.
 */
export default async function CasePage(props: PageProps<"/projects/[id]">) {
  const actor = await requireStaff();
  const lang = ENGLISH;
  const t = (words: Words) => say(words, lang);
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams as Promise<Record<string, string | string[] | undefined>>]);
  const first = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : v?.[0];
  };
  const loaded = await loadCase(actor, id);
  if (loaded.kind === "NOT_FOUND") notFound();
  if (loaded.kind === "REDIRECT") redirect(`/projects/${encodeURIComponent(loaded.contractId)}${keepQuery(sp)}`);
  const visibility = loaded.visibility;
  const lc = loaded.kind === "CONTRACT" ? await loadContract(actor.organisationId, loaded.contractId) : null;
  const l = lc ?? (await loadAward(actor.organisationId, loaded.awardId));
  if (!l) notFound();
  const { award, ex } = l;
  const c = lc?.contract ?? null;
  const status = c ? (c.status as ContractStatus) : null;
  const today = l.org.today;
  const ref = { awardId: award.id, contractId: c?.id ?? null };
  // ADR 0046 FS-5: the contract's own split once recorded, else the requisition's source. A contract fact, so a reader of the contract stages sees it (FS-11).
  const funding = c || visibility === "WHOLE" ? await fundingFact(db, l.org.id, c ? await fundingTextForContract(db, l.org.id, c.id) : await fundingTextForRequisition(db, l.org.id, ex.requisitionId)) : null;
  const { tab, page, docs, docsAfter, earlier } = { tab: first("tab"), page: first("page"), docs: first("docs"), docsAfter: first("docsAfter"), earlier: first("earlier") };
  const pageNo = Math.max(0, Number.parseInt(page ?? "0", 10) || 0);

  // ----------------------------------------------------------------- what the step bar needs
  // The award's facts, for a reader who sees the whole case; none of the award's readers run for the others (AC-18).
  const av = visibility === "WHOLE" ? await buildAwardView({ actor, l }) : null;
  // The contract's signing facts, once there is a Contract row: Signing's act and the header's phase (the phase needs a time zone).
  const facts = lc && today ? await signingFacts(lc, null, today) : null;
  const start = lc ? await startState(lc, today) : null;
  // Possession of site is the one signing act that needs the supervision reader; only at STAMPED.
  let supervision: SupervisionView | null = null;
  const supervisionOf = async () => (supervision ??= await supervisionView(lc!, today));
  let hiddenActs: HiddenAct[] = [];
  const hiddenOf = (v: SupervisionView) => (today && !actor.system ? hiddenFor(actor.personId, v.so?.office ?? null, delegationFactsOf(v.s), today, SUPERVISION_ACTS) : []);
  let possession: { blocker: string | null; hidden: boolean } | null = null;
  if (lc && status === "STAMPED") {
    const v = await supervisionOf();
    hiddenActs = hiddenOf(v);
    possession = { blocker: await possessionBlockerOf(lc, v, today), hidden: hiddenActs.includes("PRINCIPAL_OR_SO") };
  }
  // Phase 2 close-out stage B: the close-out step reads its facts once the contract is in force (plan §3.2).
  const closeout = lc && status && possessionTaken(status) ? await closeoutView(lc, today) : null;
  const standing = caseStage({ award: { status: award.status as AwardStatus, instrumentKind: award.instrumentKind as InstrumentKind }, contract: status ? { status } : null, commencement: { commencedOn: day(award.commencedOn) } });
  const caseFacts: CaseFacts = {
    visibility,
    standing,
    award: av?.stepFacts ?? null,
    // Under CONTRACT_STAGES_ONLY the conditions are the award's, so they are not judged (F0-4).
    beforeSigning: !c ? null : av ? av.before : { readiness: null, securitiesToVerify: 0, lodgeOffered: false },
    signing: lc ? { status: status!, act: signingActOf(lc, facts, today, start, possession) } : null,
    // With no time zone the day is unknown, so the step says nothing it would have to judge by a day.
    closeOut: today ? (closeout?.next ?? null) : null,
  };
  const steps = caseSteps(caseFacts);
  const view = resolveCaseView({ stage: first("stage"), tab, steps, standing, hasContract: !!c, visibility });
  const viewed = steps.find((s) => s.key === view.stage)!;
  const sources = caseHistorySources({ hasContract: !!c, visibility });
  // The Award stage was asked for by a reader not named on a restricted exercise: the refusal is written to the access log now (FR-MTD-007), not on every contract stage.
  if (view.awardRefused) await exerciseIsHidden(actor, award.exerciseId);

  // ----------------------------------------------------------------- the viewed stage, and only it
  const stage = view.stage;
  const awardTab: AwardPanelId | "none" = view.history ? "history" : stage === "award" || stage === "before-signing" ? ((view.tab ?? "overview") as AwardPanelId) : "none";
  // The award's tab-specific readers run only for the award tab being shown (or the award's history); nothing for a stage that is not the award's.
  const awardShown = !view.awardRefused && !view.noContractYet && (view.history ? sources.includes("award") : stage === "award" || (stage === "before-signing" && (view.tab === "conditions" || view.tab === "securities")));
  const fin = av && awardShown ? await av.finish({ tab: awardTab, chrome: stage === "award" && !view.history }) : null;
  // The award's own warnings (cancelled, barred supplier, late commencement, expired indent) show on every stage to a reader who sees the whole case (FR-AWD-006, FR-AWD-009).
  const awardCallouts = av ? await av.caseCallouts() : null;
  // FR-AWD-006, FR-AWD-009 (C13): the same two clocks, told to staff once per recipient and day. A restricted exercise's notice carries its exercise, so others never see it.
  if (av && av.lateClocks.length > 0) {
    await raiseCaseClockNotices({ organisationId: l.org.id, awardId: award.id, awardLabel: award.reference, exerciseId: award.exerciseId, href: `/projects/${c?.id ?? award.id}`, clocks: await av.clockTellings() });
  }
  const contractTab = lc && !view.history ? view.tab : null;
  const needsPeople = !!lc && !view.history && !!contractTab && ["formation", "team", "site", "payments", "variations", "time", "securities", "completion", "defects"].includes(contractTab);
  const people: Option[] = needsPeople ? (await db.person.findMany({ where: { organisationId: l.org.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })).map((p) => ({ value: p.id, label: p.name })) : [];
  const supervisionTabs = ["overview", "team", "site", "payments", "variations", "time"];
  const projectTab = lc && stage === "project" && !view.history ? contractTab : null;
  const closeoutTab = lc && stage === "close-out" && !view.history ? contractTab : null;
  if (lc && ((projectTab && supervisionTabs.includes(projectTab)) || closeoutTab)) {
    const v = await supervisionOf();
    if (!hiddenActs.length) hiddenActs = hiddenOf(v);
  }
  const payments = lc && projectTab && (projectTab === "overview" || projectTab === "payments") ? await paymentView(lc, today) : null;
  // Supply invoices are read only for the Payments tab, and only on the delivery order and invoice route (ADR 0045 D5).
  const supply = lc && projectTab === "payments" && (await paymentRouteOf(db, lc)) === "DELIVERY_ORDER_INVOICE" ? await loadSupplyClaims(db, { organisationId: lc.org.id, orgName: lc.org.name, contractId: lc.contract.id }) : null;
  const variations = lc && projectTab && (projectTab === "overview" || projectTab === "variations") ? await variationView(lc, today) : null;
  const time = lc && projectTab === "time" ? await timeView(lc) : null;
  // Plan §4.3: the DLP's notice is told when the Completion tab is read, as the award's clocks are.
  const dlpTold = lc && closeout && closeoutTab === "completion" ? await dlpNotice(lc, closeout, today) : null;
  const documentFacts = lc && projectTab === "documents" ? await contractDocumentFacts(l.org.id, lc.contract.id, today) : null;
  // The contract's gate (the priced working, the figures a certificate's override trail names) is asked only where a panel of the contract shows them.
  const needsContractGate = !!lc && ((projectTab === "overview") || (stage === "signing" && !view.history && view.tab === "formation") || (view.history && sources.includes("contract")));
  const sulit = needsContractGate && c ? await sulitGate(actor, { scope: "contract", entity: "Contract", id: c.id, label: c.number }, fieldsOfScope("contract")) : null;
  const history = lc && view.history && sources.includes("contract") ? await contractHistory(lc, { withAwardActs: visibility === "WHOLE" }) : null;
  // The people who decide a contract matter's route read that matter's amount, and nothing else of the contract (ruling of 2026-10-08): asked (and logged) only where a row carries one.
  const matterIds = history ? [...new Set(history.entries.filter((e) => e.entity === "ContractMatter" && e.changes.some((ch) => ch.field === ROUTED_MATTER_VALUE_FIELD)).map((e) => e.entityId))] : [];
  const matterGates = matterIds.length ? await sulitGates(actor, matterIds.map((id) => ({ scope: "contract" as const, entity: "ContractMatter", id, label: "A contract matter" })), [ROUTED_MATTER_VALUE_FIELD]) : new Map<string, Sulit<true>>();


  const notice = (title: string, body: string) => (
    <Card>
      <EmptyState title={title} action={<MoreText text={body} label="Why" />} />
    </Card>
  );
  const panelFor = (tabId: string): ReactNode => {
    if (stage === "award") return fin?.panel(tabId as AwardPanelId) ?? null;
    // Before the contract exists the award's conditions and its bond requirement are still entered here (FR-AWD-014): the award's panels need no Contract row.
    if (!lc || !c) return stage === "before-signing" && (tabId === "conditions" || tabId === "securities") ? (fin?.panel(tabId) ?? null) : null;
    switch (tabId) {
      case "conditions":
        // The conditions are read from the award (F0-4): a reader who sees the contract stages only is told so.
        return fin ? fin.panel("conditions") : notice(t(R.conditionsRestrictedTitle), t(R.conditionsRestrictedBody));
      case "securities":
        return (
          <div className="flex flex-col gap-6">
            {fin?.panel("securities", { termsReadOnly: true })}
            <SecuritiesPanel l={lc} people={people} today={today} wagesCheckOnly={!!fin} />
          </div>
        );
      case "formation":
        return facts && sulit ? <FormationWithBill sulit={sulit!} l={lc} facts={facts} people={people} today={today} /> : notice(t(R.notJudged), t(R.setTimeZoneFirst));
      case "baseline":
        return facts ? <BaselinePanel l={lc} facts={facts} timeZone={l.org.timeZone} /> : notice(t(R.notJudged), t(R.setTimeZoneFirst));
      case "overview":
        return supervision && payments && variations && sulit ? <OverviewPanel actor={actor} sulit={sulit} l={lc} awardOpen={visibility === "WHOLE"} facts={facts} today={today} supervision={supervision} payments={payments} variations={variations} /> : null;
      case "team":
        return supervision ? <TeamPanel actor={actor} l={lc} v={supervision} people={people} today={today} /> : null;
      case "site":
        return supervision ? <SitePanel l={lc} v={supervision} people={people} today={today} page={pageNo} hidden={hiddenActs} /> : null;
      case "payments":
        return supervision && payments ? <PaymentsPanel l={lc} v={payments} people={people} today={today} page={pageNo} hidden={hiddenActs} supply={supply} /> : null;
      case "variations":
        return supervision && variations ? <VariationsPanel l={lc} v={variations} people={people} today={today} page={pageNo} hidden={hiddenActs} /> : null;
      case "time":
        return time ? <TimePanel l={lc} v={time} people={people} today={today} hidden={hiddenActs} /> : null;
      case "completion":
        return closeout ? <CompletionPanel l={lc} v={closeout} people={people} today={today} hidden={hiddenActs} told={dlpTold} /> : notice(t(CASE_STEP_WORDS["close-out"]), viewed.next);
      case "defects":
        return closeout ? <DefectsPanel l={lc} v={closeout} people={people} today={today} hidden={hiddenActs} /> : notice(t(CASE_STEP_WORDS["close-out"]), viewed.next);
      case "documents":
        return documentFacts ? <DocumentsPanel contractId={c.id} page={pageNo} facts={documentFacts} /> : null;
      case "submissions":
        return <SubmissionsTab l={lc} actor={actor} organisationId={l.org.id} contractId={c.id} status={status!} docs={docs} docsAfter={docsAfter} earlier={earlier} />;
      default:
        return null;
    }
  };
  const historyPanel = (
    <div className="flex flex-col gap-6">
      {sources.length > 1 && <h2 className="text-[13px] font-semibold tracking-wide text-ink-3 uppercase">{t(P.theContract)}</h2>}
      {lc && history && sulit && <HistoryPanel withheldRows={visibility !== "WHOLE"} sulit={sulit} matterGates={matterGates} entries={history.entries} total={history.total} timeZone={l.org.timeZone} lang={lang} />}
      {sources.length > 1 && <h2 className="text-[13px] font-semibold tracking-wide text-ink-3 uppercase">{t(P.theAward)}</h2>}
      {fin?.panel("history")}
    </div>
  );

  const stageTabs = CASE_TABS[stage];
  const tabs: TabSpec[] = [
    ...stageTabs.map((tabId): TabSpec => {
      return { id: tabId, label: t(CASE_TAB_WORDS[tabId]), icon: TAB_ICON[tabId], lazy: true, panel: !view.history && view.tab === tabId ? panelFor(tabId) : null };
    }),
    { id: HISTORY_TAB, label: t(COMPONENT_WORDS.history), icon: <ClockIcon size={15} />, lazy: true, panel: view.history ? historyPanel : null },
  ];

  // ----------------------------------------------------------------- the header, the bar, the main button
  const phase = facts?.phase ?? status;
  const leftovers = earlierOpenSteps(steps, standing, stage);
  // The bar draws the case itself, not the tab being viewed: steps behind the live stage still open are warnings whichever stage is on screen.
  const unfinished = earlierOpenSteps(steps, standing, defaultCaseStep(steps, standing)).map((x) => x.key);
  const stepperSteps: StepperStep[] = steps.map((s) => ({
    key: s.key,
    label: t(CASE_STEP_WORDS[s.key]),
    // An earlier step left open is drawn as a warning, so the viewed stage is the only current step (review B7).
    ...(unfinished.includes(s.key) ? { state: "rejected" as const, tone: "warn" as const, stateText: "Not finished" } : {
      state: STEP_STATE[s.state],
      stateText: s.key === "award" && visibility === "CONTRACT_STAGES_ONLY" ? t(H.awardRestricted) : undefined,
    }),
    href: caseHref(ref, { stage: s.key }),
  }));
  // Review S1: the family's row first, in the acts' own words, for the one drawer the header offers.
  const formationShut = status ? actStatusBlocker("FORMATION", status) : null;
  // The header's one primary action (plan 6.6): the viewed stage's own; the award's other drawers sit in the menu.
  const act = primaryAction(stage, steps);
  const linkAt = act ? CASE_ACTION_AT[act] : undefined;
  const mainNode =
    act && av && (act === "SEND_FOR_APPROVAL" || act === "ISSUE" || act === "RECORD_COMMENCEMENT")
      ? av.main[act]
      : act === "START_PREPARATION" && lc && start
        ? <ActGate blocker={formationShut}><StartPreparationDrawer id={lc.contract.id} blocker={start.blocker} frozen={start.frozen} /></ActGate>
        : null;
  // Phase 2 close-out stage B: a close-out certificate in progress opens on its own page.
  const certHref = act === "OPEN_CERTIFICATE" && c && closeout?.next.certificateId ? `/projects/${c.id}/certificates/${closeout.next.certificateId}` : null;
  const mainLink = certHref ? <ButtonLink href={certHref} size="sm" variant="primary">{t(LINK_ACTION_WORDS.OPEN_CERTIFICATE!)}</ButtonLink> : linkAt && act ? <ButtonLink href={caseHref(ref, linkAt)} size="sm" variant="primary">{LINK_ACTION_WORDS[act] ? t(LINK_ACTION_WORDS[act]!) : null}</ButtonLink> : null;
  // On the Award stage the award's own drawers (C-3) sit in the menu; a step with no act of its own shows the blocked one, with its reason.
  // A stage with nothing of its own to do (the live Project stage with the award still open) points back at the step that holds the work.
  const mainBack = !mainNode && !mainLink && !fin?.chrome?.fallback && leftovers[0] ? <ButtonLink href={caseHref(ref, { stage: leftovers[0].key })} size="sm" variant="primary">Finish {t(CASE_STEP_WORDS[leftovers[0].key])}</ButtonLink> : null;
  const actions = (
    <>
      {mainNode ?? mainLink ?? fin?.chrome?.fallback ?? mainBack}
      {fin?.chrome?.menu && <MoreActions>{fin.chrome.menu}</MoreActions>}
    </>
  );
  const awardStatus = award.status as AwardStatus;

  return (
    <>
      <RecordCrumb label={c?.number ?? award.reference} />
      <PageHeader
        title={c ? sayWith(H.contractNumber, lang, { number: c.number }) : award.awardeeName}
        badge={c && phase ? <Badge tone={TONE[PHASE_TONE[phase as keyof typeof PHASE_TONE]]} dot>{t(PHASE_WORDS[phase as keyof typeof PHASE_WORDS])}</Badge> : <Badge tone={AWARD_STATUS_TONE[awardStatus]} dot>{t(AWARD_STATUS_WORDS[awardStatus])}</Badge>}
        subtitle={visibility === "WHOLE" ? ex.title : t(H.titleRestricted)}
        meta={[
          c ? award.awardeeName : <span key="ref" className="font-mono text-[12.5px]">{award.reference}</span>,
          formatMoney(senFromDecimal(c ? c.contractSum : award.awardedValue)),
          // The award-only case already names its reference first.
          c ? (visibility === "WHOLE" ? <Link key="aw" href={caseHref(ref, { stage: "award" })}>{award.reference}</Link> : award.reference) : null,
          visibility === "WHOLE" ? <span key="for">{t(H.forExercise)} <Link href={`/sourcing/${ex.id}?tab=award`}>{ex.reference}</Link></span> : null,
          c ? (c.contractDate ? sayWith(H.contractDate, lang, { date: formatDate(day(c.contractDate), lang) }) : t(H.notSigned)) : t(INSTRUMENT_SHORT_WORDS[award.instrumentKind as InstrumentKind]),
          funding,
        ]}
        actions={actions}
        actionsNote={fin?.chrome?.headerNote}
        actionsNoteId={AWARD_NOTE_ID}
      />
      <div className="mb-6 flex flex-col gap-3">
        {leftovers.map((x) => (
          <Callout key={x.key} tone="warn" title={`${t(CASE_STEP_WORDS[x.key])} is not finished`} action={mainBack && x === leftovers[0] ? undefined : <ButtonLink href={caseHref(ref, { stage: x.key })} size="sm">Open</ButtonLink>}>
            {x.next}
          </Callout>
        ))}
        {awardCallouts}
        {fin?.chrome?.callouts}
        {c && !today && !fin?.chrome && (
          <Callout tone="warn" title="Time zone not set. Dates cannot be judged." action={<ButtonLink href="/configuration/organisation" size="sm">Set time zone</ButtonLink>} />
        )}
        {status === "CANCELLED" && c && (
          <Callout tone="warn" title="Cancelled with its award">
            {c.cancelReason || "No reason recorded."}
          </Callout>
        )}
        {/* ADR 0031 (run 1a): a terminated or closed contract says what is still recorded on it, in the acts' own words. */}
        {c && (status === "TERMINATED" || status === "CLOSED") && (
          <Callout tone="warn" title={CONTRACT_STATUS_WORDS[status].en}>
            {actStatusText({ code: status === "TERMINATED" ? "CONTRACT_TERMINATED" : "CONTRACT_CLOSED", level: "block" })}
          </Callout>
        )}
        {c && status && briefingMissing(status, !!c.briefing) && (
          <Callout tone="warn" title="No Integrity Pact briefing recorded">
            Record it under Signing › Formation.
          </Callout>
        )}
      </div>
      <Card className="mb-6">
        <CardBody className="flex flex-col gap-5">
          <Stepper steps={stepperSteps} label={t(H.stagesLabel)} selected={stage} />
          {nextLine(viewed) && (
            <p className="text-[13.5px] text-ink-2">
              <span className="font-semibold text-ink">{t(H.whatsNextOn)}</span> {nextLine(viewed)}
            </p>
          )}
        </CardBody>
      </Card>
      {view.awardRefused ? (
        notice(t(R.awardStageRestrictedTitle), t(R.awardStageRestrictedBody))
      ) : view.noContractYet ? (
        notice(t(CASE_STEP_WORDS[stage]), viewed.next)
      ) : (
        <Tabs initial={view.history ? HISTORY_TAB : (view.tab ?? undefined)} label={t(H.caseTabs)} tabs={tabs} keep={{ stage }} />
      )}
    </>
  );
}

type Facts = NonNullable<Awaited<ReturnType<typeof signingFacts>>>;

// ------------------------------------------------------------------ overview

/// The formation tab with the contract's tendered bill beside it, so an item is picked, not typed (read for this tab only).
async function FormationWithBill(props: Omit<ComponentProps<typeof FormationPanel>, "bill">) {
  return <FormationPanel {...props} bill={await billItemOptions(props.l.org.id, props.l.ex.id)} />;
}

async function OverviewPanel({ actor, sulit, l, awardOpen, facts, today, supervision, payments, variations }: { actor: StaffActor; sulit: Sulit<true>; l: LoadedContract; awardOpen: boolean; facts: Facts | null; today: string | null; supervision: SupervisionView; payments: PaymentView; variations: VariationView }) {
  const lang = ENGLISH;
  const t = (words: Words) => say(words, lang);
  // Review S1: the family's row first, in the acts' own words; every drawer and blocked control below is gated by it.
  const shut = actStatusBlocker("FORMATION", l.contract.status as ContractStatus);
  const c = l.contract;
  const snap = readFormationSnapshot(c.formationSnapshot);
  const arithmetic = c.checks.find((k) => k.kind === "ARITHMETIC");
  const variance = arithmetic && arithmetic.corrections.length ? arithmeticVariance(arithmetic.corrections.map((x) => ({ tendered: senFromDecimal(x.tendered), corrected: senFromDecimal(x.corrected) }))) : null;
  // C-2 (wave C step C5): the start act's words are computed once, in signing-acts.ts, for this card and for the case page's step bar.
  const start = await startState(l, today);
  // S-1: the year the number was issued is the organisation's day of issue, never digits read from the number.
  const year = contractYearReading(c);
  return (
    <div className="flex flex-col gap-6">
    <KickOffSection actor={actor} l={l} />
    <ActGate blocker={shut}>
    <div className="flex flex-col gap-6">
      {start && (
        <Card>
          <CardHeader icon={<ToolsIcon size={17} />} title={t(P.notStarted)} subtitle="Preparing freezes the formation basis." actions={<StartPreparationDrawer id={c.id} blocker={start.blocker} frozen={start.frozen} />} />
        </Card>
      )}
      <OnSiteCard l={l} v={supervision} />
      <SecuritiesSummaryCard l={l} today={today} />
      <PaymentSummaryCard l={l} v={payments} />
      <VariationSummaryCard l={l} v={variations} />
      <Card>
        <CardHeader icon={<FileIcon size={17} />} title={t(P.theContract)} />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              { label: "Contract number", value: <span className="flex flex-col items-start gap-1"><span className="font-mono text-[13px]">{c.number}</span>{year.seriesNumber && <span className="text-[12.5px] text-ink-3">{CONTRACT_YEAR_WORDS.series(year.issueYear).en}</span>}</span> },
              { label: "Contractor", value: l.award.awardeeName },
              { label: "Contract sum", value: <span className="flex flex-col items-start gap-1"><span className="tabular-nums">{formatMoney(senFromDecimal(c.contractSum))}</span></span> },
              { label: "Arithmetic corrections", value: variance == null ? notSet("None recorded") : <span className="flex flex-col items-start gap-1"><SulitValue of={through(sulit, `${variance < 0n ? "−" : "+"}${formatMoney(variance < 0n ? -variance : variance)}`)} /><Chip tone="neutral">Not applied</Chip></span> },
              {
                label: "Contract Date",
                value: c.contractDate ? (
                  <span className="flex flex-col items-start gap-1">
                    <span>{formatDate(day(c.contractDate))}</span>
                    
                    {year.yearsDiffer && <Chip tone="warn">{CONTRACT_YEAR_WORDS.differs(year.issueYear, year.contractDateYear!).en}</Chip>}
                    {c.contractDateCorrectedFrom && <Chip tone="info">{`Corrected from ${formatDate(day(c.contractDateCorrectedFrom))}: ${c.contractDateCorrectionReason}`}</Chip>}
                  </span>
                ) : notSet("Not signed"),
              },
              { label: "Stamped", value: c.stampedOn ? `${formatDate(day(c.stampedOn))} · reference ${c.stampingRef}` : notSet("Not recorded") },
              { label: "Formed under", value: snap ? `${snap.basis.name}; legal review by ${snap.policy.legalOfficeLabel}; frozen ${formatDate(snap.startedOn)}` : notSet("Preparation not started") },
              { label: "Award", value: awardOpen ? <Link href={caseHref({ awardId: l.award.id, contractId: l.contract.id }, { stage: "award" })} className="font-semibold">{l.award.reference}</Link> : l.award.reference },
            ]}
          />
        </CardBody>
      </Card>
      {/* Once the contract is signed the question is answered: the card goes (plan 6.6). */}
      {!SIGNED_CONTRACT_STATUSES.includes(c.status as ContractStatus) && (
        <Card className="overflow-hidden">
          <CardHeader icon={<ShieldIcon size={17} />} title={t(P.readyToSign)} actions={facts ? <Badge tone={facts.gate.ready ? "ok" : "warn"}>{facts.gate.ready ? "Ready" : "Not ready"}</Badge> : undefined} />
          {facts ? <ReadinessGateList items={facts.gate.items} bondNotRequiredReason={l.award.bondNotRequiredReason} /> : <EmptyState size="sm" title={t(R.notJudged)} action={<MoreText text={t(R.setTimeZoneFirst)} label="Why" />} />}
        </Card>
      )}
      <Card className="overflow-hidden">
        <CardHeader icon={<CheckIcon size={17} />} title={t(P.awardConditions)} divided={l.award.conditions.length > 0} />
        {l.award.conditions.length === 0 ? (
          <EmptyState size="sm" title="None recorded" />
        ) : (
          <ul className="divide-y divide-line/70">
            {l.award.conditions.map((x) => (
              <li key={x.id} className="flex flex-col gap-1 px-5 py-3 sm:px-6">
                <span className="text-[13.5px] font-semibold break-words text-ink">{x.kindName}</span>
                <span className="text-[12.5px] break-words text-ink-3">{[x.reference || null, x.requiredBy ? `needed by ${formatDate(x.requiredBy)}` : "no day set", x.satisfiedOn ? `met ${formatDate(x.satisfiedOn)}` : "not met", x.excludesEot ? "a delay gives no extension of time" : null].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
    </ActGate>
    <FundingSection l={l} today={today} />
    </div>
  );
}

/// ADR 0046: the contract's funding split and impact figures. Outside the formation family's gate: their acts are record acts of their own (FS-7, FS-12).
async function FundingSection({ l, today }: { l: LoadedContract; today: string | null }) {
  const on = today ? dayToDate(today) : new Date();
  const [funding, impact] = [await fundingCard(db, l.org.id, l.contract.id, on), await impactCard(db, l.org.id, l.contract.id, on)];
  // A customer who keeps no funding source and no measure sees neither card.
  if (funding.sources.length === 0 && funding.rows.length === 0 && !impact) return null;
  return (
    <>
      {(funding.sources.length > 0 || funding.rows.length > 0) && <FundingCard contractId={l.contract.id} status={l.contract.status as ContractStatus} view={funding} />}
      {impact && <ImpactCard contractId={l.contract.id} status={l.contract.status as ContractStatus} view={impact} />}
    </>
  );
}

/// The kick-off meeting's card. It sits outside the formation family's gate on purpose: its acts are the Project workspace's, and their gates (with the table's PROJECT_WORKSPACE row first) come whole from the loader.
async function KickOffSection({ actor, l }: { actor: StaffActor; l: LoadedContract }) {
  const names = (s: ContactSubject) => sulitGate(actor, s, CONTACT_NAME_FIELDS);
  const card = await loadKickOffCard(db, l, actor, new Date(), names);
  return <KickOffCard card={card} contractId={l.contract.id} briefingHref={caseHref({ awardId: l.award.id, contractId: l.contract.id }, { stage: "signing", tab: "formation", section: "signing" })} />;
}

// ------------------------------------------------------------------ securities

/// AC-21: the Project stage's summary of the register, for the advance-payment guarantees and retention bonds that are lodged after signing. It opens the Before signing panel, where the lodge and review drawers are.
async function SecuritiesSummaryCard({ l, today }: { l: LoadedContract; today: string | null }) {
  const lang = ENGLISH;
  const t = (words: Words) => say(words, lang);
  const c = l.contract;
  const offsets = await loadExpiryOffsets(l.org.id);
  const rows = [...c.securities.map((s) => ({ status: s.status, on: s.expiresOn })), ...c.policies.map((p) => ({ status: p.status, on: p.periodEnd }))];
  const waiting = rows.filter((x) => x.status === "LODGED").length;
  const chips = rows.filter((x) => x.status !== "REJECTED").map((x) => (today ? expiryChip(expiryAlert(day(x.on), offsets, today)) : null)).filter((x) => x != null);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    <Card>
      <CardHeader
        icon={<ShieldIcon size={17} />}
        title={t(P.securitiesAndInsurance)}
                actions={<ButtonLink href={caseHref({ awardId: l.award.id, contractId: c.id }, { stage: "before-signing", tab: "securities" })} size="sm" variant="secondary">Open securities</ButtonLink>}
      />
      <CardBody className="flex flex-wrap items-center gap-2 text-[13.5px] text-ink-2">
        {rows.length === 0 ? (
          <span className="text-ink-4">Nothing lodged yet.</span>
        ) : (
          <>
            <span>{`${plural(c.securities.length, "security", "securities")}, ${plural(c.policies.length, "insurance policy", "insurance policies")}.`}</span>
            <Chip tone={waiting ? "warn" : "ok"}>{waiting ? `${waiting} lodged, not verified` : "All checked"}</Chip>
            {chips.map((x, i) => (
              <Chip key={i} tone={x.tone}>{x.text}</Chip>
            ))}
          </>
        )}
      </CardBody>
    </Card>
  );
}

async function SecuritiesPanel({ l, people, today, wagesCheckOnly }: { l: LoadedContract; people: Option[]; today: string | null; wagesCheckOnly: boolean }) {
  const lang = ENGLISH;
  const t = (words: Words) => say(words, lang);
  const c = l.contract;
  // AC-15: the same chips as the award's tab (one wording, `expiryChip`) and the configured reminder intervals, which with none set say so.
  const offsets = await loadExpiryOffsets(l.org.id);
  const alert = (d: Date | null) => {
    const chip = today ? expiryChip(expiryAlert(day(d), offsets, today)) : null;
    return chip ? <Chip tone={chip.tone}>{chip.text}</Chip> : null;
  };
  // Review S1: the wages check's own act (FORMATION's row, then "executed" by isExecuted), never a list of its own.
  const status = c.status as ContractStatus;
  const shut = actStatusBlocker("FORMATION", status);
  const wcOpen = !shut && !isExecuted(status);
  const wcOnWages = l.award.wcBasis === "UNCOVERED_WAGES";
  // The award's register above already lists everything with its drawers (AC-21): here only the wages check, which is a contract act, is added.
  if (wagesCheckOnly) {
    const wcPolicies = c.policies.filter((p) => p.kind === "WORKMENS_COMPENSATION" && wcOnWages);
    if (wcPolicies.length === 0) return null;
    return (
      <Card className="overflow-hidden">
        <CardHeader icon={<ShieldIcon size={17} />} title={t(P.wagesCheck)} />
        <ActGate blocker={shut}>
          <ul className="divide-y divide-line/70">
            {wcPolicies.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="text-[12.5px] break-words text-ink-3">
                  {p.wcCheckedOn ? `Wages check recorded ${formatDate(day(p.wcCheckedOn))} by ${p.wcCheckedBy?.name ?? "an officer"}: declared uncovered wages ${formatMoney(parseSen(p.wcDeclaredUncoveredWages!.toString()))}. Not judged.` : "Wages check not recorded. The insurance item stays open."}
                </span>
                {!p.wcCheckedOn && wcOpen && (p.status === "VERIFIED" ? <WcCheckDrawer id={c.id} policyId={p.id} label={INSURANCE_KIND_LABEL[p.kind]} people={people} today={today} /> : <Blocked label={t(R.recordWagesCheck)} reason={t(R.verifyPolicyAbove)} />)}
              </li>
            ))}
          </ul>
        </ActGate>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<ShieldIcon size={17} />} title={t(P.securitiesAndInsurances)} subtitle={`Read-only here. ${remindersText(offsets)}.`} divided={c.securities.length + c.policies.length === 0} />
      {c.securities.length + c.policies.length === 0 ? (
        <EmptyState size="sm" title="Nothing lodged" />
      ) : (
        <ActGate blocker={shut}>
        <ul className="divide-y divide-line/70">
          {c.securities.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold break-words text-ink">{`${SECURITY_KIND_LABEL[s.kind]} · ${formatMoney(senFromDecimal(s.value))}`}</span>
                <span className="block text-[12.5px] break-words text-ink-3">{[s.issuer?.name ?? s.issuerNameAsWritten, s.instrumentRef || null, s.expiresOn ? `expires ${formatDate(s.expiresOn)}` : null].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="flex shrink-0 flex-wrap items-center gap-2">
                {s.status !== "REJECTED" && alert(s.expiresOn)}
                <Chip tone={REGISTER_STATUS_TONE[s.status]}>{REGISTER_STATUS_LABEL[s.status]}</Chip>
              </span>
            </li>
          ))}
          {c.policies.map((p) => {
            const wc = p.kind === "WORKMENS_COMPENSATION" && wcOnWages;
            return (
              <li key={p.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold break-words text-ink">{`${INSURANCE_KIND_LABEL[p.kind]} · ${formatMoney(senFromDecimal(p.sumInsured))}`}</span>
                  <span className="block text-[12.5px] break-words text-ink-3">
                    {[p.issuer?.name ?? p.issuerNameAsWritten, p.policyNo || null, `${formatDate(p.periodStart)} to ${formatDate(p.periodEnd)}`, p.kind === "WORKMENS_COMPENSATION" && l.award.wcBasis ? WC_BASIS_LABEL[l.award.wcBasis].toLowerCase() : null].filter(Boolean).join(" · ")}
                  </span>
                  {wc && (
                    <span className="block text-[12.5px] break-words text-ink-3">
                      {p.wcCheckedOn ? `Wages check recorded ${formatDate(day(p.wcCheckedOn))} by ${p.wcCheckedBy?.name ?? "an officer"}: declared uncovered wages ${formatMoney(parseSen(p.wcDeclaredUncoveredWages!.toString()))}. Not judged.` : "Wages check not recorded. The insurance item stays open."}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  {p.status !== "REJECTED" && alert(p.periodEnd)}
                  <Chip tone={REGISTER_STATUS_TONE[p.status]}>{REGISTER_STATUS_LABEL[p.status]}</Chip>
                  {wc && !p.wcCheckedOn && wcOpen && (p.status === "VERIFIED" ? <WcCheckDrawer id={c.id} policyId={p.id} label={INSURANCE_KIND_LABEL[p.kind]} people={people} today={today} /> : <Blocked label={t(R.recordWagesCheck)} reason={t(R.verifyPolicyFirst)} />)}
                </span>
              </li>
            );
          })}
        </ul>
        </ActGate>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ history

const ACTION_LABEL = { CREATE: "Created", UPDATE: "Changed", DELETE: "Removed" } as const;
const ENTITY_LABEL: Record<string, string> = {
  Contract: "Contract",
  ContractAssemblyPart: "Document part",
  ContractReconciliation: "Reconciliation",
  ReconciliationAmendment: "Amendment",
  FormationCheck: "Check",
  ArithmeticCorrection: "Arithmetic correction",
  RateComparison: "Rate compared",
  LegalReview: "Legal review",
  InsurancePolicy: "Insurance policy",
  ContractSignature: "Signature",
  IntegrityBriefing: "Integrity briefing",
  ContractBaseline: "Baseline",
  IssuedCopy: "Controlled copy",
  CustodyItem: "Original in custody",
  CustodyMovement: "Custody movement",
  CaseOwnershipEvent: "Handed to contracts",
  SecurityInstrument: "Security",
  // 6.14: a certificate's rows, written under the contract's label.
  Certificate: "Certificate",
  CertificateSignature: "Certificate signature",
  CertificateOverride: "Certificate figure overridden",
  RoutingCheck: "Routing check",
  // 612-C1: a correction of the award's recorded terms, written under the contract's label.
  AwardTermCorrection: RECORD_TYPE_WORDS.AwardTermCorrection.en,
  // 6.13 Part A: the contract's supervision.
  ...Object.fromEntries(SUPERVISION_ENTITIES.map((e) => [e, RECORD_TYPE_WORDS[e].en])),
  // 6.13 Part A step 3: interim payment, the damages chain, and a certificate's approval route.
  ...Object.fromEntries(PAYMENT_ENTITIES.map((e) => [e, RECORD_TYPE_WORDS[e].en])),
  // 6.13 Part A step 4: variations, the matters tabled from them, and the adjustment of the contract sum.
  ...Object.fromEntries(VARIATION_ENTITIES.map((e) => [e, RECORD_TYPE_WORDS[e].en])),
  // Phase 2 close-out stage A: time and damages.
  ...Object.fromEntries(TIME_ENTITIES.map((e) => [e, RECORD_TYPE_WORDS[e].en])),
};
function HistoryPanel({ withheldRows, sulit, matterGates, entries, total, timeZone, lang }: { withheldRows: boolean; sulit: Sulit<true>; matterGates: ReadonlyMap<string, Sulit<true>>; entries: Awaited<ReturnType<typeof contractHistory>>["entries"]; total: number; timeZone: string | null; lang: Language }) {
  // Known codes in words; real values (LHDN, PS) as they are; a code without words never shown.
  const read = (field: string, value: string | null, entity: string): string => historyValue(field, value, formatDate, entity);
  // A registered SULIT field's value is shown or withheld as the contract's one answer says, as on the sibling History panels.
  const chipped = (field: string, value: string | null, entity: string, entityId?: string): ReactNode => {
    // A matter's routed value is also read by the people who decide the matter's route (its own gate), where the contract's answer is withheld.
    const viaMatter = sulit.state === "WITHHELD" && field === ROUTED_MATTER_VALUE_FIELD && entityId ? matterGates.get(entityId) : undefined;
    const held = value ? (viaMatter?.state === "GRANTED" ? sulitHistoryValue(field, "contract", viaMatter, read(field, value, entity)) : sulitHistoryValue(field, "contract", sulit, read(field, value, entity))) : null;
    return held ? <SulitValue of={held} /> : read(field, value, entity);
  };
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<ClockIcon size={17} />} title={say(COMPONENT_WORDS.history, lang)} subtitle={total > entries.length ? `Latest ${entries.length} of ${total}` : undefined} divided={entries.length === 0} />
      {entries.length === 0 ? (
        <EmptyState size="sm" title="No recorded changes" />
      ) : (
        <ul className="divide-y divide-line/70">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-1.5 px-5 py-3 sm:px-6">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <Badge tone={e.action === "CREATE" ? "ok" : e.action === "DELETE" ? "err" : "info"}>{ACTION_LABEL[e.action]}</Badge>
                <span className="font-semibold text-ink">{ENTITY_LABEL[e.entity] ?? "Record"}</span>
                <span className="min-w-0 break-words text-ink-2">{historyEntityLabel(e.entity, e.entityLabel)}</span>
                <span className="flex-1" />
                <span className="text-[12px] text-ink-3">{formatOrgDay(e.at, timeZone)}</span>
              </div>
              {e.changes.length > 0 && (
                <ul className="text-[12.5px] break-words text-ink-3">
                  {e.changes.filter((ch) => !/(Code|Key|Id)$/.test(ch.field)).map((ch) => (
                    <li key={ch.field}>
                      {historyFieldLabel(ch.field, e.entity)}: {(e.action === "UPDATE" || ch.before != null) && <>{chipped(ch.field, ch.before, e.entity, e.entityId)} → </>}
                      <span className="text-ink-2">{chipped(ch.field, e.action === "DELETE" ? ch.before : ch.after, e.entity, e.entityId)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {e.reason && <p className="text-[12.5px] text-ink-3">Reason: {e.reason}</p>}
            </li>
          ))}
        </ul>
      )}
      {/* AC-37 (b): for a reader who sees the contract stages only, the award's own acts (lodging and verifying securities included) are left out, and the list says so. */}
      {withheldRows && <p className="border-t border-line px-5 py-3 text-[12.5px] text-ink-3 sm:px-6">Award acts are hidden here.</p>}
    </Card>
  );
}
