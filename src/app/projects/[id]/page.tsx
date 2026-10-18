import type { ReactNode } from "react";
import Link from "next/link";
import { ActGate } from "@/components/act-gate";
import { actStatusBlocker, actStatusText } from "@/lib/contract/act-status";
import { CONTRACT_STATUS_WORDS } from "@/lib/contract/labels";
import { historyEntityLabel, PAYMENT_ENTITIES, RECORD_TYPE_WORDS, SUPERVISION_ENTITIES, VARIATION_ENTITIES } from "@/lib/audit/entity-labels";
import { notFound, redirect } from "next/navigation";
import { AWARD_NOTE_ID } from "@/app/awards/editors";
import { loadCase } from "@/app/_auth/case";
import { Stepper, type StepperStep } from "@/components/ui/stepper";
import { AWARD_STATUS_LABEL, AWARD_STATUS_TONE, INSTRUMENT_SHORT } from "@/lib/award/labels";
import { loadAward } from "@/lib/award/repo";
import type { AwardStatus, InstrumentKind } from "@/lib/award/types";
import { caseStage } from "@/lib/contract/case-stage";
import { CASE_STEP_LABEL, CLOSE_OUT_PARKED, caseSteps, type CaseAction, type CaseFacts } from "@/lib/contract/case-steps";
import { CASE_TABS, HISTORY_TAB } from "@/lib/contract/case-tabs";
import { caseHistorySources, resolveCaseView } from "@/lib/contract/case-view";
import { CASE_ACTION_AT, caseHref, keepQuery } from "@/lib/contract/links";
import type { HiddenAct } from "@/lib/supervision/authority";
import { buildAwardView, type AwardPanelId } from "./award/award-view";
import { possessionBlockerOf, signingActOf, startState } from "./signing-acts";

import { ReadinessGateList } from "@/components/contract/readiness-gate";
import { AwardIcon, BuildingIcon, CheckIcon, ClipboardIcon, ClockIcon, FileIcon, FilesIcon, InboxIcon, RouteIcon, ScaleIcon, ShieldIcon, SlidersIcon, ToolsIcon, UsersIcon, WalletIcon } from "@/components/icons";
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
import { isExecuted } from "@/lib/contract/status";
import type { ContractStatus } from "@/lib/contract/types";
import { storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate, formatOrgDay } from "@/lib/format";
import { formatMoney, parseSen, senFromDecimal } from "@/lib/money";
import { fieldsOfScope, ROUTED_MATTER_VALUE_FIELD } from "@/lib/sulit-fields";
import { sulitGate, sulitGates } from "@/app/_auth/sulit";
import { contractDocumentFacts } from "@/lib/certificate/register";
import { sulitHistoryValue } from "@/lib/auth/sulit-history";
import { through, type Sulit } from "@/lib/auth/sulit-access";

import { BaselinePanel } from "./baseline-panel";
import { DocumentsPanel } from "./documents-panel";
import { SubmissionsTab } from "./submissions-tab";
import { StartPreparationDrawer, WcCheckDrawer } from "./editors";
import { FormationPanel, FORMATION_SECTIONS, type FormationSection } from "./formation-panels";
import { PAYMENT_SECTIONS, PaymentsPanel, PaymentSummaryCard, paymentView, type PaymentSection, type PaymentView } from "./payment-panels";
import { OnSiteCard, SITE_SECTIONS, SitePanel, supervisionView, TeamPanel, type SiteSection, type SupervisionView } from "./supervision-panels";
import { hiddenFor } from "@/lib/supervision/authority";
import { delegationFactsOf } from "@/lib/supervision/load";
import { SUPERVISION_ACTS } from "@/lib/supervision/types";
import { VARIATION_SECTIONS, VariationsPanel, VariationSummaryCard, type VariationSection } from "./variation-panels";
import { variationView, type VariationView } from "@/lib/variation/view";
import { requireStaff } from "@/app/_auth/actor";
import { exerciseIsHidden } from "@/app/_auth/sulit";

export const dynamic = "force-dynamic";

type Option = { value: string; label: string };
const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);
const notSet = (what = "Not set") => <span className="text-ink-4">{what}</span>;
const TONE = { brand: "brand", info: "info", ok: "ok", warn: "warn", err: "err", neutral: undefined } as const;

// ------------------------------------------------------------------ the case

/// How each tab of the case looks in the strip. The ids are `CASE_TABS`' (src/lib/contract/case-tabs.ts), which decides which stage
/// lists which; "instrument" is the Letter (AC-19).
const TAB_LOOK: Readonly<Record<string, { label: string; icon: ReactNode }>> = {
  overview: { label: "Overview", icon: <AwardIcon size={15} /> },
  approval: { label: "Approval", icon: <RouteIcon size={15} /> },
  instrument: { label: "Letter", icon: <FileIcon size={15} /> },
  distribution: { label: "Distribution", icon: <InboxIcon size={15} /> },
  return: { label: "Return", icon: <ClipboardIcon size={15} /> },
  routing: { label: "Routing sheet", icon: <SlidersIcon size={15} /> },
  conditions: { label: "Conditions", icon: <CheckIcon size={15} /> },
  securities: { label: "Securities and insurance", icon: <ShieldIcon size={15} /> },
  formation: { label: "Formation", icon: <ToolsIcon size={15} /> },
  baseline: { label: "Baseline", icon: <FileIcon size={15} /> },
  team: { label: "Team", icon: <UsersIcon size={15} /> },
  site: { label: "Site", icon: <BuildingIcon size={15} /> },
  payments: { label: "Payments", icon: <WalletIcon size={15} /> },
  variations: { label: "Variations", icon: <ScaleIcon size={15} /> },
  documents: { label: "Documents", icon: <FilesIcon size={15} /> },
  submissions: { label: "Submissions", icon: <InboxIcon size={15} /> },
};

/// The tabs that have a second level, with the sections the case page reads from its address.
const SECTIONED = { formation: FORMATION_SECTIONS, site: SITE_SECTIONS, payments: PAYMENT_SECTIONS, variations: VARIATION_SECTIONS } as const;

const STEP_STATE = { done: "done", "in-progress": "current", waiting: "waiting", parked: "parked" } as const;

/// The label of a main button that is a link to the panel holding the act's drawer (see `CASE_ACTION_AT`).
const LINK_ACTION_LABEL: Readonly<Partial<Record<CaseAction, string>>> = {
  RECORD_DESPATCH: "Record despatch",
  RECORD_RETURN: "Record the return",
  LODGE_SECURITY: "Lodge a security",
  VERIFY_SECURITY: "Verify securities",
  SUBMIT_TO_LEGAL: "Send to the legal office",
  RECORD_SIGNATURE: "Record the signatures",
  RECORD_STAMPING: "Record the stamping",
  RECORD_POSSESSION: "Record possession of site",
};

const RESTRICTED_AWARD_STAGE = "The award stage of this exercise is restricted to the people named on it. The contract stages are open to you.";

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
  const { tab, section, page, waiting, answered } = { tab: first("tab"), section: first("section"), page: first("page"), waiting: first("waiting"), answered: first("answered") };
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
  const standing = caseStage({ award: { status: award.status as AwardStatus, instrumentKind: award.instrumentKind as InstrumentKind }, contract: status ? { status } : null, commencement: { commencedOn: day(award.commencedOn) } });
  const caseFacts: CaseFacts = {
    visibility,
    standing,
    award: av?.stepFacts ?? null,
    // Under CONTRACT_STAGES_ONLY the conditions are the award's, so they are not judged (F0-4).
    beforeSigning: !c ? null : av ? av.before : { readiness: null, securitiesToVerify: 0, lodgeOffered: false },
    signing: lc ? { status: status!, act: signingActOf(lc, facts, today, start, possession) } : null,
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
  const contractTab = lc && !view.history ? view.tab : null;
  const needsPeople = !!lc && !view.history && !!contractTab && ["formation", "team", "site", "payments", "variations", "securities"].includes(contractTab);
  const people: Option[] = needsPeople ? (await db.person.findMany({ where: { organisationId: l.org.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })).map((p) => ({ value: p.id, label: p.name })) : [];
  const supervisionTabs = ["overview", "team", "site", "payments", "variations"];
  const projectTab = lc && stage === "project" && !view.history ? contractTab : null;
  if (lc && projectTab && supervisionTabs.includes(projectTab)) {
    const v = await supervisionOf();
    if (!hiddenActs.length) hiddenActs = hiddenOf(v);
  }
  const payments = lc && projectTab && (projectTab === "overview" || projectTab === "payments") ? await paymentView(lc, today) : null;
  const variations = lc && projectTab && (projectTab === "overview" || projectTab === "variations") ? await variationView(lc, today) : null;
  const documentFacts = lc && projectTab === "documents" ? await contractDocumentFacts(l.org.id, lc.contract.id, today) : null;
  // The contract's gate (the priced working, the figures a certificate's override trail names) is asked only where a panel of the contract shows them.
  const needsContractGate = !!lc && ((projectTab === "overview") || (stage === "signing" && !view.history && view.tab === "formation") || (view.history && sources.includes("contract")));
  const sulit = needsContractGate && c ? await sulitGate(actor, { scope: "contract", entity: "Contract", id: c.id, label: c.number }, fieldsOfScope("contract")) : null;
  const history = lc && view.history && sources.includes("contract") ? await contractHistory(lc, { withSecurities: visibility === "WHOLE" }) : null;
  // The people who decide a contract matter's route read that matter's amount, and nothing else of the contract (ruling of 2026-10-08): asked (and logged) only where a row carries one.
  const matterIds = history ? [...new Set(history.entries.filter((e) => e.entity === "ContractMatter" && e.changes.some((ch) => ch.field === ROUTED_MATTER_VALUE_FIELD)).map((e) => e.entityId))] : [];
  const matterGates = matterIds.length ? await sulitGates(actor, matterIds.map((id) => ({ scope: "contract" as const, entity: "ContractMatter", id, label: "A contract matter" })), [ROUTED_MATTER_VALUE_FIELD]) : new Map<string, Sulit<true>>();

  const formationSection = (FORMATION_SECTIONS.find((s) => s.id === section)?.id ?? "assembly") as FormationSection;
  const siteSection = (SITE_SECTIONS.find((s) => s.id === section)?.id ?? "start") as SiteSection;
  const paymentSection = (PAYMENT_SECTIONS.find((s) => s.id === section)?.id ?? "valuations") as PaymentSection;
  const variationSection = (VARIATION_SECTIONS.find((s) => s.id === section)?.id ?? "variations") as VariationSection;
  const sectionOf: Record<string, string> = { formation: formationSection, site: siteSection, payments: paymentSection, variations: variationSection };

  const notice = (title: string, body: ReactNode) => (
    <Card>
      <EmptyState title={title}>{body}</EmptyState>
    </Card>
  );
  const panelFor = (t: string): ReactNode => {
    if (stage === "award") return fin?.panel(t as AwardPanelId) ?? null;
    // Before the contract exists the award's conditions and its bond requirement are still entered here (FR-AWD-014): the award's panels need no Contract row.
    if (!lc || !c) return stage === "before-signing" && (t === "conditions" || t === "securities") ? (fin?.panel(t) ?? null) : null;
    switch (t) {
      case "conditions":
        // The conditions are read from the award (F0-4): a reader who sees the contract stages only is told so.
        return fin ? fin.panel("conditions") : notice("The award's conditions are restricted", RESTRICTED_AWARD_STAGE);
      case "securities":
        return (
          <div className="flex flex-col gap-6">
            {fin?.panel("securities", { termsReadOnly: true })}
            <SecuritiesPanel l={lc} people={people} today={today} wagesCheckOnly={!!fin} />
          </div>
        );
      case "formation":
        return facts && sulit ? <FormationPanel sulit={sulit!} l={lc} section={formationSection} facts={facts} people={people} today={today} /> : notice("Not judged", "Set the organisation's time zone first.");
      case "baseline":
        return facts ? <BaselinePanel l={lc} facts={facts} timeZone={l.org.timeZone} /> : notice("Not judged", "Set the organisation's time zone first.");
      case "overview":
        return supervision && payments && variations && sulit ? <OverviewPanel sulit={sulit} l={lc} awardOpen={visibility === "WHOLE"} facts={facts} today={today} supervision={supervision} payments={payments} variations={variations} /> : null;
      case "team":
        return supervision ? <TeamPanel l={lc} v={supervision} people={people} today={today} /> : null;
      case "site":
        return supervision ? <SitePanel l={lc} v={supervision} people={people} today={today} section={siteSection} page={pageNo} hidden={hiddenActs} /> : null;
      case "payments":
        return supervision && payments ? <PaymentsPanel l={lc} v={payments} people={people} today={today} section={paymentSection} page={pageNo} hidden={hiddenActs} /> : null;
      case "variations":
        return supervision && variations ? <VariationsPanel l={lc} v={variations} people={people} today={today} section={variationSection} page={pageNo} hidden={hiddenActs} /> : null;
      case "documents":
        return documentFacts ? <DocumentsPanel contractId={c.id} page={pageNo} facts={documentFacts} /> : null;
      case "submissions":
        return <SubmissionsTab organisationId={l.org.id} contractId={c.id} status={status!} today={today} waiting={waiting} answered={answered} />;
      default:
        return null;
    }
  };
  const historyPanel = (
    <div className="flex flex-col gap-6">
      {sources.length > 1 && <h2 className="text-[13px] font-semibold tracking-wide text-ink-3 uppercase">The contract</h2>}
      {lc && history && sulit && <HistoryPanel sulit={sulit} matterGates={matterGates} entries={history.entries} total={history.total} timeZone={l.org.timeZone} />}
      {sources.length > 1 && <h2 className="text-[13px] font-semibold tracking-wide text-ink-3 uppercase">The award</h2>}
      {fin?.panel("history")}
    </div>
  );

  const stageTabs = stage === "close-out" ? [] : CASE_TABS[stage];
  const tabs: TabSpec[] = [
    ...stageTabs.map((t): TabSpec => {
      const sections = SECTIONED[t as keyof typeof SECTIONED];
      return { id: t, label: TAB_LOOK[t].label, icon: TAB_LOOK[t].icon, lazy: true, ...(sections ? { sections: [...sections], section: sectionOf[t] } : {}), panel: !view.history && view.tab === t ? panelFor(t) : null };
    }),
    { id: HISTORY_TAB, label: "History", icon: <ClockIcon size={15} />, lazy: true, panel: view.history ? historyPanel : null },
  ];

  // ----------------------------------------------------------------- the header, the bar, the main button
  const phase = facts?.phase ?? status;
  const stepperSteps: StepperStep[] = steps.map((s) => ({
    key: s.key,
    label: CASE_STEP_LABEL[s.key],
    state: STEP_STATE[s.state],
    stateText: s.key === "award" && visibility === "CONTRACT_STAGES_ONLY" ? "restricted to the people named on the exercise" : undefined,
    href: caseHref(ref, { stage: s.key }),
  }));
  // Review S1: the family's row first, in the acts' own words, for the one drawer the header offers.
  const formationShut = status ? actStatusBlocker("FORMATION", status) : null;
  const linkAt = viewed.action ? CASE_ACTION_AT[viewed.action] : undefined;
  const mainNode =
    viewed.action && av && (viewed.action === "SEND_FOR_APPROVAL" || viewed.action === "ISSUE" || viewed.action === "RECORD_COMMENCEMENT")
      ? av.main[viewed.action]
      : viewed.action === "START_PREPARATION" && lc && start
        ? <ActGate blocker={formationShut}><StartPreparationDrawer id={lc.contract.id} blocker={start.blocker} frozen={start.frozen} /></ActGate>
        : null;
  const mainLink = linkAt && viewed.action ? <ButtonLink href={caseHref(ref, linkAt)} size="sm" variant="primary">{LINK_ACTION_LABEL[viewed.action]}</ButtonLink> : null;
  // On the Award stage the award's own drawers stay in the header, as on the award's page (C-3); the step's main act is one of them.
  const actions = fin?.chrome ? <>{fin.chrome.actions}{mainLink}</> : <>{mainNode}{mainLink}</>;
  const awardStatus = award.status as AwardStatus;

  return (
    <>
      <RecordCrumb label={c?.number ?? award.reference} />
      <PageHeader
        eyebrow={<Link href="/projects">Contracts</Link>}
        title={c ? `Contract ${c.number}` : award.awardeeName}
        badge={c && phase ? <Badge tone={TONE[PHASE_TONE[phase as keyof typeof PHASE_TONE]]} dot>{PHASE_WORDS[phase as keyof typeof PHASE_WORDS].en}</Badge> : <Badge tone={AWARD_STATUS_TONE[awardStatus]} dot>{AWARD_STATUS_LABEL[awardStatus]}</Badge>}
        subtitle={ex.title}
        meta={[
          c ? award.awardeeName : <span key="ref" className="font-mono text-[12.5px]">{award.reference}</span>,
          formatMoney(senFromDecimal(c ? c.contractSum : award.awardedValue)),
          // The award-only case already names its reference first.
          c ? (visibility === "WHOLE" ? <Link key="aw" href={caseHref(ref, { stage: "award" })}>{award.reference}</Link> : award.reference) : null,
          visibility === "WHOLE" ? <span key="for">for <Link href={`/sourcing/${ex.id}?tab=award`}>{ex.reference}</Link></span> : null,
          c ? (c.contractDate ? `Contract Date ${formatDate(day(c.contractDate))}` : "Not signed") : INSTRUMENT_SHORT[award.instrumentKind as InstrumentKind],
        ]}
        actions={actions}
        actionsNote={fin?.chrome?.headerNote}
        actionsNoteId={AWARD_NOTE_ID}
      />
      <div className="mb-6 flex flex-col gap-3">
        {awardCallouts}
        {fin?.chrome?.callouts}
        {c && !today && !fin?.chrome && (
          <Callout tone="warn" title="The organisation's time zone is not set" action={<ButtonLink href="/configuration/organisation" size="sm">Set time zone</ButtonLink>}>
            Every act on a contract records the organisation&apos;s day, and the Contract Date is the day of the signature act: none is assumed to be UTC.
          </Callout>
        )}
        {status === "CANCELLED" && c && (
          <Callout tone="warn" title="Cancelled with its award">
            {c.cancelReason || "No reason recorded."} The number stays allocated as a gap; everything recorded is kept as it was.
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
            The Stage Three briefing at signing is not on record. It does not block anything (a Should); record it under Signing › Formation › Signing.
          </Callout>
        )}
      </div>
      <Card className="mb-6">
        <CardBody className="flex flex-col gap-5">
          <Stepper steps={stepperSteps} label="Stages of this case" selected={stage} />
          <p className="text-[13.5px] text-ink-2">
            <span className="font-semibold text-ink">What&apos;s next on {CASE_STEP_LABEL[stage]}:</span> {viewed.next}
          </p>
        </CardBody>
      </Card>
      {view.awardRefused ? (
        notice("The award stage is restricted", RESTRICTED_AWARD_STAGE)
      ) : view.noContractYet ? (
        notice(CASE_STEP_LABEL[stage], viewed.next)
      ) : stage === "close-out" ? (
        notice("Close-out", CLOSE_OUT_PARKED)
      ) : (
        <Tabs initial={view.history ? HISTORY_TAB : (view.tab ?? undefined)} label="Case" tabs={tabs} keep={{ stage }} />
      )}
    </>
  );
}

type Facts = NonNullable<Awaited<ReturnType<typeof signingFacts>>>;

// ------------------------------------------------------------------ overview

async function OverviewPanel({ sulit, l, awardOpen, facts, today, supervision, payments, variations }: { sulit: Sulit<true>; l: LoadedContract; awardOpen: boolean; facts: Facts | null; today: string | null; supervision: SupervisionView; payments: PaymentView; variations: VariationView }) {
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
    <ActGate blocker={shut}>
    <div className="flex flex-col gap-6">
      {start && (
        <Card>
          <CardHeader icon={<ToolsIcon size={17} />} title="Not started" subtitle="The contract is numbered. Preparing it freezes what it is formed under and builds the baseline's draft." actions={<StartPreparationDrawer id={c.id} blocker={start.blocker} frozen={start.frozen} />} />
        </Card>
      )}
      <OnSiteCard l={l} v={supervision} />
      <SecuritiesSummaryCard l={l} today={today} />
      <PaymentSummaryCard l={l} v={payments} />
      <VariationSummaryCard l={l} v={variations} />
      <Card>
        <CardHeader icon={<FileIcon size={17} />} title="The contract" subtitle="As awarded, numbered at issue, and as it is being formed." />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              { label: "Contract number", value: <span className="flex flex-col items-start gap-1"><span className="font-mono text-[13px]">{c.number}</span>{year.seriesNumber && <span className="text-[12.5px] text-ink-3">{CONTRACT_YEAR_WORDS.series(year.issueYear).en}</span>}</span> },
              { label: "Contractor", value: l.award.awardeeName },
              { label: "Contract sum", value: <span className="flex flex-col items-start gap-1"><span className="tabular-nums">{formatMoney(senFromDecimal(c.contractSum))}</span><span className="text-[12.5px] text-ink-3">The Letter of Acceptance&apos;s sum (assumed: corrections do not change it).</span></span> },
              { label: "Arithmetic corrections", value: variance == null ? notSet("None recorded") : <span className="flex flex-col items-start gap-1"><SulitValue of={through(sulit, `${variance < 0n ? "−" : "+"}${formatMoney(variance < 0n ? -variance : variance)}`)} /><span className="text-[12.5px] text-ink-3">Against the tendered figures: shown, not applied.</span></span> },
              {
                label: "Contract Date",
                value: c.contractDate ? (
                  <span className="flex flex-col items-start gap-1">
                    <span>{formatDate(day(c.contractDate))}</span>
                    <span className="text-[12.5px] text-ink-3">The day the signature for the employer was recorded.</span>
                    {year.yearsDiffer && <Chip tone="warn">{CONTRACT_YEAR_WORDS.differs(year.issueYear, year.contractDateYear!).en}</Chip>}
                    {c.contractDateCorrectedFrom && <Chip tone="info">{`Corrected from ${formatDate(day(c.contractDateCorrectedFrom))}: ${c.contractDateCorrectionReason}`}</Chip>}
                  </span>
                ) : notSet("Not signed: the day of the signature act, never typed"),
              },
              { label: "Stamped", value: c.stampedOn ? `${formatDate(day(c.stampedOn))} · reference ${c.stampingRef}` : notSet("Not recorded") },
              { label: "Formed under", value: snap ? `${snap.basis.name}; legal review by ${snap.policy.legalOfficeLabel}; frozen ${formatDate(snap.startedOn)}` : notSet("Preparation not started") },
              { label: "Award", value: awardOpen ? <Link href={caseHref({ awardId: l.award.id, contractId: l.contract.id }, { stage: "award" })} className="font-semibold">{l.award.reference}</Link> : l.award.reference },
            ]}
          />
        </CardBody>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader icon={<ShieldIcon size={17} />} title="Ready to sign?" subtitle="The readiness gate, as the award shows it. Preparation continues while it is red." actions={facts ? <Badge tone={facts.gate.ready ? "ok" : "warn"}>{facts.gate.ready ? "Gate met" : "Gate not met"}</Badge> : undefined} />
        {facts ? <ReadinessGateList items={facts.gate.items} bondNotRequiredReason={l.award.bondNotRequiredReason} /> : <EmptyState size="sm" title="Not judged">Set the organisation&apos;s time zone first.</EmptyState>}
      </Card>
      <Card className="overflow-hidden">
        <CardHeader icon={<CheckIcon size={17} />} title="The award's conditions" subtitle="Before work starts, each with the day it is needed by. Recorded on the award." divided={l.award.conditions.length > 0} />
        {l.award.conditions.length === 0 ? (
          <EmptyState size="sm" title="None recorded">The award records none.</EmptyState>
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
  );
}

// ------------------------------------------------------------------ securities

/// AC-21: the Project stage's summary of the register, for the advance-payment guarantees and retention bonds that are lodged after signing. It opens the Before signing panel, where the lodge and review drawers are.
async function SecuritiesSummaryCard({ l, today }: { l: LoadedContract; today: string | null }) {
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
        title="Securities and insurance"
        subtitle="Bonds, guarantees and policies on this contract. Advance-payment guarantees and retention bonds are lodged and checked in the same panel."
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
        <CardHeader icon={<ShieldIcon size={17} />} title="Workmen's compensation wages check" subtitle="Recorded on the contract once the policy is verified. Recorded, not judged." />
        <ActGate blocker={shut}>
          <ul className="divide-y divide-line/70">
            {wcPolicies.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="text-[12.5px] break-words text-ink-3">
                  {p.wcCheckedOn ? `Wages check recorded ${formatDate(day(p.wcCheckedOn))} by ${p.wcCheckedBy?.name ?? "an officer"}: declared uncovered wages ${formatMoney(parseSen(p.wcDeclaredUncoveredWages!.toString()))}. Recorded, not judged: basis not set (D4).` : "The uncovered-wages check is not recorded: the gate's insurance item is not met until it is."}
                </span>
                {!p.wcCheckedOn && wcOpen && (p.status === "VERIFIED" ? <WcCheckDrawer id={c.id} policyId={p.id} label={INSURANCE_KIND_LABEL[p.kind]} people={people} today={today} /> : <Blocked label="Record the wages check" reason="Verify the policy above first." />)}
              </li>
            ))}
          </ul>
        </ActGate>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<ShieldIcon size={17} />} title="Securities and insurances" subtitle={`The contract's register, read-only here: lodging and checking sit with the people named on the exercise. ${remindersText(offsets)}, shown and not sent.`} divided={c.securities.length + c.policies.length === 0} />
      {c.securities.length + c.policies.length === 0 ? (
        <EmptyState size="sm" title="Nothing lodged">Nothing has been lodged on this contract.</EmptyState>
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
                      {p.wcCheckedOn ? `Wages check recorded ${formatDate(day(p.wcCheckedOn))} by ${p.wcCheckedBy?.name ?? "an officer"}: declared uncovered wages ${formatMoney(parseSen(p.wcDeclaredUncoveredWages!.toString()))}. Recorded, not judged: basis not set (D4).` : "The uncovered-wages check is not recorded: the gate's insurance item is not met until it is."}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  {p.status !== "REJECTED" && alert(p.periodEnd)}
                  <Chip tone={REGISTER_STATUS_TONE[p.status]}>{REGISTER_STATUS_LABEL[p.status]}</Chip>
                  {wc && !p.wcCheckedOn && wcOpen && (p.status === "VERIFIED" ? <WcCheckDrawer id={c.id} policyId={p.id} label={INSURANCE_KIND_LABEL[p.kind]} people={people} today={today} /> : <Blocked label="Record the wages check" reason="Verify the policy first." />)}
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
  CaseOwnershipEvent: "Case handed over",
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
};
function HistoryPanel({ sulit, matterGates, entries, total, timeZone }: { sulit: Sulit<true>; matterGates: ReadonlyMap<string, Sulit<true>>; entries: Awaited<ReturnType<typeof contractHistory>>["entries"]; total: number; timeZone: string | null }) {
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
      <CardHeader icon={<ClockIcon size={17} />} title="History" subtitle={`${total > entries.length ? `Showing the latest ${entries.length} of ${total} changes. ` : "Every change to this contract and what is under it. "}Each change names who made it; any from before sign-in is not attributed. Identity-card numbers are masked here.`} divided={entries.length === 0} />
      {entries.length === 0 ? (
        <EmptyState size="sm" title="No recorded changes">Changes made through the portal appear here.</EmptyState>
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
    </Card>
  );
}
