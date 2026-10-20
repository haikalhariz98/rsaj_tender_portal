import { DataList, type Row } from "@/components/data-list";
import { FileIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { CASE_PAGE, listCases, parseCaseListView, type CaseRow, type CaseRowView } from "@/lib/contract/case-load";
import { CASE_WORK_VIEWS } from "@/lib/contract/case-work-views";
import { awardChips, CASE_ENDED_TONE, CASE_ENDED_WORDS, CASE_VIEW_WORDS, standingWords } from "@/lib/contract/case-list-words";
import { PHASE_TONE, PHASE_WORDS } from "@/lib/contract/labels";
import { endedKind, phaseKind, primaryCaseStatus, type StatusCandidate } from "@/lib/contract/case-status";
import { caseHref } from "@/lib/contract/links";
import { DERIVE_CAP, endorsedPhases } from "@/lib/contract/load";
import type { ContractPhase } from "@/lib/contract/status";
import type { ContractStatus } from "@/lib/contract/types";
import { indentExpiryRaised, indentState } from "@/lib/award/indent";
import { AWARD_STATUS_TONE } from "@/lib/award/labels";
import { loadAwardPolicy } from "@/lib/award/repo";
import { returnReadsComplete } from "@/lib/award/stage-two";
import type { AwardStatus, InstrumentKind } from "@/lib/award/types";
import { isLive } from "@/lib/documents/evidence";
import { dayOf, daysFrom, storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { formatMoney, senFromDecimal } from "@/lib/money";
import { exerciseOrg } from "@/lib/method/repo";
import { inDelayContractIds } from "@/lib/supervision/load";
import { commencedPendingAll } from "@/lib/variation/view";
import { requireStaff } from "@/app/_auth/actor";
import { ENGLISH } from "@/lib/i18n/language";
import { CASES_LIST_WORDS as L, AWARD_STATUS_WORDS, INSTRUMENT_SHORT_WORDS } from "@/lib/contract/case-page-words";
import type { Words } from "@/lib/contract/labels";
import type { Language } from "@/lib/i18n/language";
import { say, sayWith } from "@/lib/i18n/say";
import { hiddenExercises } from "@/app/_auth/sulit";
import { listRegister } from "@/lib/award/repo";
import { db } from "@/lib/db";

import { CaseViewSelect, type ViewGroup } from "./case-view-select";
import { SecuritiesView } from "./securities-view";
import { SubmissionsView } from "./submissions-view";

export const dynamic = "force-dynamic";

/// Variations commenced pending approval shown per page; the set is judged whole first.
const COMMENCED_PAGE = 50;

/// The server-side views of the case list, in the order of their buttons (AC-17). The wave G views are their own readers (F0-8).
const STAGE_VIEWS = ["awarding", "signing", "on_site", "completed", "closed", "ended"] as const;
/// The old Awards list's organisation-wide work views, over the whole organisation (FR-AWD-006 for the indents).
const WORK_VIEWS = CASE_WORK_VIEWS;
const day = (d: Date | null) => (d ? storedDay(d) : null);

/**
 * The case list (Award and Contract Requirements v2, C-1; design note 0004 C9; AC-17, AC-18): every award from the day it is started,
 * with its contract once there is one, in five stages and a sixth view for the cancelled and terminated. Paging, counts and the
 * views are taken in the database by `listCases` (restricted exercises left out as `caseVisibility` says); a restricted case that is
 * issued shows only the columns the contracts list always had. The derived phases "awaiting conditions" and "ready to sign" are read
 * from each legally endorsed contract's gate and its company resolution, never stored (6.12 review).
 */
export default async function ProjectsPage(props: PageProps<"/projects">) {
  const actor = await requireStaff();
  const lang = ENGLISH;
  const t = (words: Words) => say(words, lang);
  const n = (words: Words, count: number) => sayWith(words, lang, { count: String(count) });
  const { page: p, view, sv, waiting, answered } = (await props.searchParams) as { page?: string; view?: string; sv?: string; waiting?: string; answered?: string };
  // AC-15: the organisation-wide securities view (the old Securities menu) stands alone, so no other view's data is read.
  if (view === "securities") return <SecuritiesView actor={actor} sv={sv} pageParam={p} lang={lang} />;
  // AC-16: "Submissions waiting" (the old Documents menu's review queue) stands alone as well.
  if (view === "submissions") return <SubmissionsView actor={actor} waiting={waiting} answered={answered} lang={lang} />;
  const page = Math.max(0, Number.parseInt(p ?? "0", 10) || 0);
  const parsed = parseCaseListView(view);
  // 6.13 Part A review 14: In Delay is a view over the whole set, judged across every possessed contract, then paged.
  const org0 = await exerciseOrg(actor.organisationId);
  const today = org0?.timeZone ? dayOf(new Date(), org0.timeZone) : null;
  const delay = org0 && today ? await inDelayContractIds(org0.id, today) : { ids: [], assumed: new Set<string>() };
  const delayIds = delay.ids;
  const delayView = parsed === "delay";
  // 6.13 Part A step 4 (FR-VAR-014): every variation commenced pending approval, across contracts, with its estimate
  // and age, judged over the whole set and then paged.
  const commencedView = parsed === "commenced";
  const commenced = org0 ? await commencedPendingAll(org0.id) : [];
  const exposure = commenced.reduce((a, v) => a + senFromDecimal(v.estimate), 0n);
  const hidden = await hiddenExercises(actor);
  // The two organisation-wide views' buttons carry their counts, as the others do (AC-15, AC-16); the same readings as the views, by count queries alone. Neither leaves out a contract's
  // rows for a restricted exercise (AC-45, AC-18, AC-19): a security is listed with the contract's own cells and nothing of the tender.
  const [securitiesCount, submissionsWaiting] = await Promise.all([
    listRegister(actor.organisationId, 0, "attention", true).then((r) => r.counts.attention),
    db.contractorSubmission.count({ where: { organisationId: actor.organisationId, outcome: null } }),
  ]);
  // "commenced" is the variations' exposure report above, not a view over cases; every other view is one `listCases` pages.
  const rowView: CaseRowView | undefined = parsed && parsed !== "commenced" && parsed !== "securities" && parsed !== "submissions" ? parsed : undefined;
  const data = await listCases(actor.organisationId, hidden, { view: rowView, page, delayIds, commencedContractIds: [...new Set(commenced.map((v) => v.contract.id))] });
  const derived: Map<string, ContractPhase> = org0 ? await endorsedPhases(org0.id, DERIVE_CAP) : new Map();
  const ready = [...derived.values()].filter((x) => x === "READY_TO_SIGN").length;
  const awaiting = [...derived.values()].filter((x) => x === "AWAITING_CONDITIONS").length;
  const pages = Math.ceil(data.total / CASE_PAGE);
  // 6.13 Part A (FR-SUP-010): In Delay, derived, never stored. Tagged ASSUMED (the shared badge) only where the
  // reading rests on the straight-line assumption (BD-613-12, narrowed by the residual review); a lapsed date for
  // completion does not.
  const inDelay = new Set(delayIds);
  const policy = org0 ? await loadAwardPolicy(org0.id) : null;

  const rows: Row[] = commencedView ? [] : data.rows.map((r) => caseRow(r, { derived, inDelay, delayAssumed: delay.assumed, policy, today: org0?.today ?? null, lang }));
  const at = (v: CaseRowView | undefined, n = 0) => {
    const q = new URLSearchParams();
    if (v) q.set("view", v);
    if (n > 0) q.set("page", String(n));
    const t = q.toString();
    return t ? `/projects?${t}` : "/projects";
  };

  const countLabel = (label: string, count: number) => sayWith(L.viewCount, lang, { label, count: String(count) });
  // The plain name of each view, for the card heading (the option's own label carries its count).
  const plainNames = new Map<string, string>();
  const option = (value: CaseRowView | "all", label: string, count: number) => {
    plainNames.set(value, label);
    return { value, label: countLabel(label, count), href: at(value === "all" ? undefined : value) };
  };
  const viewGroups: ViewGroup[] = [
    {
      label: t(L.groupStage),
      options: [
        option("all", t(L.all), data.counts.all),
        ...STAGE_VIEWS.map((v) => option(v, t(CASE_VIEW_WORDS[v]), data.counts[v])),
      ],
    },
    {
      label: t(L.groupAttention),
      options: [
        option("delay", t(L.inDelay), data.counts.delay),
        ...WORK_VIEWS.map((v) => (v === "expired" && !data.indentRuleSet ? { value: v, label: sayWith(L.validityNotSet, lang, { label: t(CASE_VIEW_WORDS[v]) }), href: at(v) } : option(v, t(CASE_VIEW_WORDS[v]), data.counts[v]))),
        { value: "commenced", label: n(L.commencedPending, commenced.length), href: "/projects?view=commenced" },
      ],
    },
    {
      label: t(L.groupRegisters),
      options: [
        { value: "securities", label: n(L.securitiesExpiring, securitiesCount), href: "/projects?view=securities" },
        { value: "submissions", label: n(L.submissionsWaiting, submissionsWaiting), href: "/projects?view=submissions" },
      ],
    },
  ];

  const current = delayView ? "delay" : (rowView ?? "all");
  // The heading names the list showing, as Sourcing's does: "All contracts" until a view narrows it.
  const chosenTitle = current === "all" ? t(L.allContracts) : (plainNames.get(current) ?? t(L.allContracts));

  return (
    <>
      <PageHeader
        title={t(L.title)}
        info={{ title: t(L.infoTitle), text: t(L.infoText) }}
        meta={[n(L.nAwarding, data.counts.awarding), n(L.nSigning, data.counts.signing), n(L.nOnSite, data.counts.on_site), n(L.nAwaitingConditions, awaiting), n(L.nReadyToSign, ready)]}
      />
      {commencedView ? (
        <CommencedCard rows={commenced} exposure={exposure} page={page} today={today} lang={lang} />
      ) : (
      <Card className="overflow-hidden">
        <CardHeader icon={<FileIcon size={17} />} title={chosenTitle} divided={false} />
        <DataList
          flat
          selectable={false}
          exportName="cases"
          searchPlaceholder={t(L.search)}
          emptyTitle={t(delayView ? L.noneInDelay : rowView ? L.noneHere : L.noCasesYet)}
          toolbarFilters={<CaseViewSelect groups={viewGroups} current={current} label={t(L.showCases)} chipLabel={t(L.viewChip)} />}
          rowAction={{ label: t(L.open), hrefTemplate: "/projects/{id}" }}
          rowOpens
          stackBelow="xl"
          columns={[
            { key: "contract", label: t(L.colCase), sortable: true, mobile: "primary" },
            { key: "contractor", label: t(L.colContractor), width: "200px", hideBelow: "2xl", mobile: "meta" },
            { key: "sum", label: t(L.colValue), width: "140px", numeric: true, sortable: true, mobile: "meta" },
            { key: "stage", label: t(L.colStage), width: "140px", sortable: true, mobile: "meta" },
            { key: "phase", label: t(L.colStatus), width: "240px", mobile: "meta" },
            { key: "dates", label: t(L.colDates), width: "220px", mobile: "meta" },
          ]}
          rows={rows}
        />
        {pages > 1 && (
          <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
            <span>
              {sayWith(L.pageRange, lang, { from: String(page * CASE_PAGE + 1), to: String(Math.min(data.total, (page + 1) * CASE_PAGE)), total: String(data.total) })}
            </span>
            <span className="flex gap-2">
              {page > 0 && <ButtonLink href={at(rowView, page - 1)} size="sm" variant="ghost">{t(L.previous)}</ButtonLink>}
              {page + 1 < pages && <ButtonLink href={at(rowView, page + 1)} size="sm" variant="ghost">{t(L.next)}</ButtonLink>}
            </span>
          </CardFooter>
        )}
      </Card>
      )}
    </>
  );
}

interface RowContext {
  derived: Map<string, ContractPhase>;
  inDelay: Set<string>;
  delayAssumed: Set<string>;
  policy: Awaited<ReturnType<typeof loadAwardPolicy>> | null;
  today: string | null;
  lang: Language;
}

type Tone = "brand" | "info" | "ok" | "warn" | "err";
const toneOf = (t: string): { tone?: Tone } => (t === "neutral" ? {} : { tone: t as Tone });

const strip = ({ text, tone, provenance }: StatusCandidate) => ({ text, ...(tone ? { tone } : {}), ...(provenance ? { provenance } : {}) });

/// One case as a row. A row held back to its contract stages (AC-18) has no `award`, so it carries the contract's columns alone.
function caseRow(r: CaseRow, cx: RowContext): Row {
  const lang = cx.lang;
  const t = (words: Words) => say(words, lang);
  const c = r.contract;
  const a = r.award;
  const title = a ? a.exercise.title : c!.award.exercise.title;
  const awardee = a ? a.awardeeName : c!.award.awardeeName;
  const reference = a ? a.reference : c!.award.reference;
  const status = c ? (c.status as ContractStatus) : null;
  const phase: ContractPhase | null = c && status ? (cx.derived.get(c.id) ?? (status as ContractPhase)) : null;
  const ended = r.standing.kind === "ENDED" ? r.standing.ended : null;
  const stageWords = t(standingWords(r.standing));
  const kind = a ? (a.instrumentKind as InstrumentKind) : null;

  // The status chips: the contract's phase (or the award's status before there is one), In Delay, then the awards list's own.
  const chips: StatusCandidate[] = [];
  if (ended) chips.push({ kind: endedKind(ended), text: t(CASE_ENDED_WORDS[ended]), ...toneOf(CASE_ENDED_TONE[ended]) });
  else if (phase) chips.push({ kind: phaseKind(phase), text: t(PHASE_WORDS[phase]), ...toneOf(PHASE_TONE[phase]) });
  else if (a) chips.push({ kind: "LIFECYCLE", text: t(AWARD_STATUS_WORDS[a.status as AwardStatus]), ...toneOf(AWARD_STATUS_TONE[a.status as AwardStatus]) });
  if (c && cx.inDelay.has(c.id)) chips.push({ kind: "IN_DELAY", text: t(L.inDelay), tone: "err", ...(cx.delayAssumed.has(c.id) ? { provenance: "ASSUMED" as const } : {}) });
  if (a && kind && !ended) {
    const awardStatus = a.status as AwardStatus;
    // OD-5: before acceptance counted with its scans; an accepted award is not re-judged.
    const scanned = new Set(a.attachments.filter(isLive).map((x) => x.purpose as string));
    const ret = a.awardReturn;
    const back = ret ? returnReadsComplete(a.status, kind, { ...ret, signedLetterReceivedOn: day(ret.signedLetterReceivedOn), declarationReceivedOn: day(ret.declarationReceivedOn), authorisationReceivedOn: day(ret.authorisationReceivedOn) }, scanned) : false;
    const indent = kind === "WORK_INDENT" && cx.today ? indentState(day(a.indentReceivedOn), cx.policy?.indentValidityDays ?? null, cx.today) : null;
    const held = [...(a.contract?.securities ?? []), ...(a.contract?.policies ?? [])];
    chips.push(...awardChips({ status: awardStatus, returned: back, toVerify: held.filter((x) => x.status === "LODGED").length, registered: held.length, hasCommitmentNo: !!a.erpCommitmentNo, indentExpired: indentExpiryRaised(indent, day(a.commencedOn), awardStatus) }, lang));
  }

  // Founder, 2026-10-20: one status per row; the others sit behind "+N".
  const { primary, others } = primaryCaseStatus(chips);
  const money = c ? senFromDecimal(c.contractSum) : a ? senFromDecimal(a.awardedValue) : 0n;
  const completion = c?.dateForCompletion ?? null;
  return {
    id: r.contractId ?? r.awardId,
    search: [title, c?.number ?? "", awardee, reference, stageWords, ...chips.map((x) => x.text)].join(" "),
    sortKeys: { contract: title },
    cells: {
      contract: { kind: "link", text: title, href: caseHref({ awardId: r.awardId, contractId: r.contractId }), sub: c ? sayWith(L.contractNumber, lang, { number: c.number }) : sayWith(L.noContractYet, lang, { reference }) },
      contractor: { kind: "text", text: awardee },
      // Money in sen, shown and sorted exactly by the list (never a float).
      sum: { kind: "money", sen: money.toString() },
      stage: { kind: "badge", text: stageWords },
      phase: primary ? { kind: "status", main: strip(primary), others: others.map(strip) } : { kind: "chips", items: [] },
      dates: c
        ? { kind: "stack", title: c.contractDate ? sayWith(L.contractDate, lang, { date: formatDate(storedDay(c.contractDate), lang) }) : t(L.notSigned), sub: completion ? sayWith(L.completion, lang, { date: formatDate(storedDay(completion), lang) }) : t(L.completionNotSet) }
        : { kind: "stack", title: kind ? t(INSTRUMENT_SHORT_WORDS[kind]) : t(L.instrument), sub: t(L.contractNotNumbered) },
    },
  };
}

type Commenced = Awaited<ReturnType<typeof commencedPendingAll>>[number];

/// FR-VAR-014: the exposure report. Each variation's age is counted in the organisation's days from its commencement
/// to today (time zone not set: no age is shown rather than one read in UTC).
function CommencedCard({ rows, exposure, page, today, lang }: { rows: Commenced[]; exposure: bigint; page: number; today: string | null; lang: Language }) {
  const t = (words: Words) => say(words, lang);
  const pages = Math.ceil(rows.length / COMMENCED_PAGE);
  const at = Math.min(page, Math.max(0, pages - 1));
  const shown = rows.slice(at * COMMENCED_PAGE, (at + 1) * COMMENCED_PAGE);
  const ageOf = (on: Date) => (today ? daysFrom(storedDay(on), today) : null);
  const list: Row[] = shown.map((v) => {
    const age = ageOf(v.commencedOn!);
    return {
      id: v.id,
      search: [v.reference ?? "", v.description, v.contract.number, v.contract.award.exercise.title, v.contract.award.awardeeName].join(" "),
      sortKeys: { age: age ?? 0 },
      cells: {
        variation: { kind: "link", text: v.reference ? sayWith(L.variationRef, lang, { reference: v.reference }) : t(L.variationUnnumbered), href: `/projects/${v.contract.id}/variations/${v.id}`, sub: v.description },
        contract: { kind: "stack", title: v.contract.award.exercise.title, sub: sayWith(L.contractAndContractor, lang, { number: v.contract.number, contractor: v.contract.award.awardeeName }) },
        estimate: { kind: "money", sen: senFromDecimal(v.estimate).toString() },
        age: { kind: "stack", title: age == null ? t(L.timeZoneNotSet) : sayWith(age === 1 ? L.oneDay : L.nDays, lang, { count: String(age) }), sub: sayWith(L.commencedOn, lang, { date: formatDate(storedDay(v.commencedOn!), lang) }) },
      },
    };
  });
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<FileIcon size={17} />}
        title={t(L.commencedTitle)}
        subtitle={sayWith(L.commencedSubtitle, lang, { count: String(rows.length), amount: formatMoney(exposure) })}
        actions={<ButtonLink href="/projects" size="sm" variant="secondary">{t(L.allContracts)}</ButtonLink>}
        divided={false}
      />
      <DataList
        flat
        selectable={false}
        exportName="commenced-pending-approval"
        searchPlaceholder={t(L.commencedSearch)}
        emptyTitle={t(L.none)}
        stackBelow="xl"
        columns={[
          { key: "variation", label: t(L.colVariation), mobile: "primary" },
          { key: "contract", label: t(L.colContract), width: "260px", hideBelow: "2xl", mobile: "meta" },
          { key: "estimate", label: t(L.colEstimate), width: "140px", numeric: true, sortable: true, mobile: "meta" },
          { key: "age", label: t(L.colAge), width: "160px", sortable: true, mobile: "meta" },
        ]}
        rows={list}
      />
      {pages > 1 && (
        <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
          <span>{sayWith(L.variationsRange, lang, { from: String(at * COMMENCED_PAGE + 1), to: String(Math.min(rows.length, (at + 1) * COMMENCED_PAGE)), total: String(rows.length) })}</span>
          <span className="flex gap-2">
            {at > 0 && <ButtonLink href={`/projects?view=commenced&page=${at - 1}`} size="sm" variant="ghost">{t(L.previous)}</ButtonLink>}
            {at + 1 < pages && <ButtonLink href={`/projects?view=commenced&page=${at + 1}`} size="sm" variant="ghost">{t(L.next)}</ButtonLink>}
          </span>
        </CardFooter>
      )}
    </Card>
  );
}
