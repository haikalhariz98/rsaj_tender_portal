import { DataList, type Row } from "@/components/data-list";
import { FileIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { CASE_PAGE, listCases, parseCaseListView, type CaseRow, type CaseRowView } from "@/lib/contract/case-load";
import { CASE_WORK_VIEWS } from "@/lib/contract/case-work-views";
import { awardChips, CASE_ENDED_TONE, CASE_ENDED_WORDS, CASE_STAGE_WORDS, CASE_VIEW_WORDS, standingWords } from "@/lib/contract/case-list-words";
import { PHASE_TONE, PHASE_WORDS } from "@/lib/contract/labels";
import { caseHref } from "@/lib/contract/links";
import { DERIVE_CAP, endorsedPhases } from "@/lib/contract/load";
import type { ContractPhase } from "@/lib/contract/status";
import type { ContractStatus } from "@/lib/contract/types";
import { indentExpiryRaised, indentState } from "@/lib/award/indent";
import { AWARD_STATUS_LABEL, AWARD_STATUS_TONE, INSTRUMENT_SHORT } from "@/lib/award/labels";
import { loadAwardPolicy } from "@/lib/award/repo";
import { returnReadsComplete } from "@/lib/award/stage-two";
import type { AwardStatus, InstrumentKind } from "@/lib/award/types";
import { isLive } from "@/lib/documents/evidence";
import { dayOf, daysFrom, storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { formatMoney, senFromDecimal } from "@/lib/money";
import { exerciseOrg } from "@/lib/method/repo";
import { DELAY_BASIS } from "@/lib/supervision/labels";
import { inDelayContractIds } from "@/lib/supervision/load";
import { commencedPendingAll } from "@/lib/variation/view";
import { requireStaff } from "@/app/_auth/actor";
import { hiddenExercises } from "@/app/_auth/sulit";
import { listRegister } from "@/lib/award/repo";
import { db } from "@/lib/db";

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
  const { page: p, view, sv, waiting, answered } = (await props.searchParams) as { page?: string; view?: string; sv?: string; waiting?: string; answered?: string };
  // AC-15: the organisation-wide securities view (the old Securities menu) stands alone, so no other view's data is read.
  if (view === "securities") return <SecuritiesView actor={actor} sv={sv} pageParam={p} />;
  // AC-16: "Submissions waiting" (the old Documents menu's review queue) stands alone as well.
  if (view === "submissions") return <SubmissionsView actor={actor} waiting={waiting} answered={answered} />;
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
  // The two organisation-wide views' buttons carry their counts, as the others do (AC-15, AC-16); the same readings as the views, by count queries alone. The securities view
  // leaves out restricted exercises the reader is not named on (FR-MTD-007); the submissions view does not (AC-18, AC-19).
  const [securitiesCount, submissionsWaiting] = await Promise.all([
    listRegister(actor.organisationId, 0, "attention", hidden, true).then((r) => r.counts.attention),
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

  const rows: Row[] = commencedView ? [] : data.rows.map((r) => caseRow(r, { derived, inDelay, delayAssumed: delay.assumed, policy, today: org0?.today ?? null }));
  const at = (v: CaseRowView | undefined, n = 0) => {
    const q = new URLSearchParams();
    if (v) q.set("view", v);
    if (n > 0) q.set("page", String(n));
    const t = q.toString();
    return t ? `/projects?${t}` : "/projects";
  };

  return (
    <>
      <PageHeader
        title="Contracts"
        subtitle="Every award from the day it is started, then its contract, to site and close."
        meta={[`${data.counts.awarding} awarding`, `${data.counts.signing} signing`, `${data.counts.on_site} on site`, `${awaiting} awaiting conditions`, `${ready} ready to sign`, <span key="delay" className="inline-flex flex-wrap items-center gap-1.5">
            {`${data.counts.delay} In Delay`}
            {delay.assumed.size > 0 && (
              <>
                {`, ${delay.assumed.size} on the straight-line reading`}
                <ProvenanceBadge value="ASSUMED" />
              </>
            )}
          </span>,
        ]}
      />
      <Callout tone="info" className="mb-6" title="Still to come here">
        Possession of site, supervision and site records are recorded on each contract&apos;s Team and Site tabs; valuations, interim certificates, retention, the warning letter, the Certificate of Non-Completion and liquidated damages on its Payments tab; variations and the adjustment of the contract sum on its Variations tab. Still to come: extensions of time and the rest of the time and default chain; completion, defects, nominated parties and the final account. Each contract&apos;s baseline here is what they will read.
      </Callout>
      {commencedView ? (
        <CommencedCard rows={commenced} exposure={exposure} page={page} today={today} />
      ) : (
      <Card className="overflow-hidden">
        <CardHeader
          icon={<FileIcon size={17} />}
          title={delayView ? "Cases In Delay" : rowView && rowView !== "delay" ? CASE_VIEW_WORDS[rowView].en : "All cases"}
          subtitle={
            delayView ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {`Every contract In Delay today, judged across all of them, newest first.${delay.assumed.size > 0 ? ` ${DELAY_BASIS}` : ""}`}
                {delay.assumed.size > 0 && <ProvenanceBadge value="ASSUMED" />}
              </span>
            ) : (
              "Newest first. A case begins as an award and gets a contract number when its instrument is issued."
            )
          }
          actions={
            <span className="flex flex-wrap gap-2">
              <ButtonLink href="/projects?view=commenced" size="sm" variant="secondary">{`Commenced pending approval (${commenced.length})`}</ButtonLink>
              <ButtonLink href="/projects?view=securities" size="sm" variant="secondary">{`Securities expiring or not verified (${securitiesCount})`}</ButtonLink>
              <ButtonLink href="/projects?view=submissions" size="sm" variant="secondary">{`Submissions waiting (${submissionsWaiting})`}</ButtonLink>
            </span>
          }
          divided={false}
        />
        <nav aria-label="Stages" className="flex flex-wrap gap-2 px-5 pb-4 sm:px-6">
          <ButtonLink href={at(undefined)} size="sm" variant={!rowView ? "primary" : "secondary"}>{`All (${data.counts.all})`}</ButtonLink>
          {STAGE_VIEWS.map((v) => (
            <ButtonLink key={v} href={at(v)} size="sm" variant={rowView === v ? "primary" : "secondary"}>{`${CASE_VIEW_WORDS[v].en} (${data.counts[v]})`}</ButtonLink>
          ))}
          <ButtonLink href={at("delay")} size="sm" variant={delayView ? "primary" : "secondary"}>{`In Delay (${data.counts.delay})`}</ButtonLink>
        </nav>
        <nav aria-label="Awards that need work" className="flex flex-wrap gap-2 px-5 pb-4 sm:px-6">
          {WORK_VIEWS.map((v) => (
            <ButtonLink key={v} href={at(v)} size="sm" variant={rowView === v ? "primary" : "secondary"}>
              {v === "expired" && !data.indentRuleSet ? `${CASE_VIEW_WORDS[v].en} (validity not set)` : `${CASE_VIEW_WORDS[v].en} (${data.counts[v]})`}
            </ButtonLink>
          ))}
        </nav>
        <DataList
          flat
          selectable={false}
          exportName="cases"
          searchPlaceholder="Search by title, number or contractor"
          emptyTitle={delayView ? "None In Delay" : rowView ? "None here" : "No cases yet"}
          emptyBody={delayView ? "No contract is In Delay today." : rowView ? "No case is at this stage." : "An award is started from its exercise's Award tab."}
          filters={[{ key: "stage", label: "Stage", order: [...Object.values(CASE_STAGE_WORDS).map((x) => x.en), CASE_VIEW_WORDS.ended.en] }]}
          rowAction={{ label: "Open", hrefTemplate: "/projects/{id}" }}
          rowOpens
          stackBelow="xl"
          columns={[
            { key: "contract", label: "Case", sortable: true, mobile: "primary" },
            { key: "contractor", label: "Contractor", width: "200px", hideBelow: "2xl", mobile: "meta" },
            { key: "sum", label: "Value", width: "140px", numeric: true, sortable: true, mobile: "meta" },
            { key: "stage", label: "Stage", width: "140px", sortable: true, mobile: "meta" },
            { key: "phase", label: "Status", width: "240px", mobile: "meta" },
            { key: "dates", label: "Dates", width: "220px", mobile: "meta" },
          ]}
          rows={rows}
        />
        {pages > 1 && (
          <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
            <span>
              Cases {page * CASE_PAGE + 1}–{Math.min(data.total, (page + 1) * CASE_PAGE)} of {data.total}. Search and the filter look within this page.
            </span>
            <span className="flex gap-2">
              {page > 0 && <ButtonLink href={at(rowView, page - 1)} size="sm" variant="ghost">Previous</ButtonLink>}
              {page + 1 < pages && <ButtonLink href={at(rowView, page + 1)} size="sm" variant="ghost">Next</ButtonLink>}
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
}

type Tone = "brand" | "info" | "ok" | "warn" | "err";
const toneOf = (t: string): { tone?: Tone } => (t === "neutral" ? {} : { tone: t as Tone });

/// One case as a row. A row held back to its contract stages (AC-18) has no `award`, so it carries the contract's columns alone.
function caseRow(r: CaseRow, cx: RowContext): Row {
  const c = r.contract;
  const a = r.award;
  const title = a ? a.exercise.title : c!.award.exercise.title;
  const awardee = a ? a.awardeeName : c!.award.awardeeName;
  const reference = a ? a.reference : c!.award.reference;
  const status = c ? (c.status as ContractStatus) : null;
  const phase: ContractPhase | null = c && status ? (cx.derived.get(c.id) ?? (status as ContractPhase)) : null;
  const ended = r.standing.kind === "ENDED" ? r.standing.ended : null;
  const stageWords = standingWords(r.standing).en;
  const kind = a ? (a.instrumentKind as InstrumentKind) : null;

  // The status chips: the contract's phase (or the award's status before there is one), In Delay, then the awards list's own.
  const chips: { text: string; tone?: Tone; provenance?: "ASSUMED" }[] = [];
  if (ended) chips.push({ text: CASE_ENDED_WORDS[ended].en, ...toneOf(CASE_ENDED_TONE[ended]) });
  else if (phase) chips.push({ text: PHASE_WORDS[phase].en, ...toneOf(PHASE_TONE[phase]) });
  else if (a) chips.push({ text: AWARD_STATUS_LABEL[a.status as AwardStatus], ...toneOf(AWARD_STATUS_TONE[a.status as AwardStatus]) });
  if (c && cx.inDelay.has(c.id)) chips.push({ text: "In Delay", tone: "err", ...(cx.delayAssumed.has(c.id) ? { provenance: "ASSUMED" as const } : {}) });
  if (a && kind && !ended) {
    const awardStatus = a.status as AwardStatus;
    // OD-5: before acceptance counted with its scans; an accepted award is not re-judged.
    const scanned = new Set(a.attachments.filter(isLive).map((x) => x.purpose as string));
    const ret = a.awardReturn;
    const back = ret ? returnReadsComplete(a.status, kind, { ...ret, signedLetterReceivedOn: day(ret.signedLetterReceivedOn), declarationReceivedOn: day(ret.declarationReceivedOn), authorisationReceivedOn: day(ret.authorisationReceivedOn) }, scanned) : false;
    const indent = kind === "WORK_INDENT" && cx.today ? indentState(day(a.indentReceivedOn), cx.policy?.indentValidityDays ?? null, cx.today) : null;
    const held = [...(a.contract?.securities ?? []), ...(a.contract?.policies ?? [])];
    chips.push(...awardChips({ status: awardStatus, returned: back, toVerify: held.filter((x) => x.status === "LODGED").length, registered: held.length, hasCommitmentNo: !!a.erpCommitmentNo, indentExpired: indentExpiryRaised(indent, day(a.commencedOn), awardStatus) }));
  }

  const money = c ? senFromDecimal(c.contractSum) : a ? senFromDecimal(a.awardedValue) : 0n;
  const completion = c?.dateForCompletion ?? null;
  return {
    id: r.contractId ?? r.awardId,
    search: [title, c?.number ?? "", awardee, reference, stageWords, ...chips.map((x) => x.text)].join(" "),
    sortKeys: { contract: title },
    cells: {
      contract: { kind: "link", text: title, href: caseHref({ awardId: r.awardId, contractId: r.contractId }), sub: c ? `Contract ${c.number}` : `${reference} · no contract number yet` },
      contractor: { kind: "text", text: awardee },
      // Money in sen, shown and sorted exactly by the list (never a float).
      sum: { kind: "money", sen: money.toString() },
      stage: { kind: "badge", text: stageWords },
      phase: { kind: "chips", items: chips },
      dates: c
        ? { kind: "stack", title: c.contractDate ? `Contract Date ${formatDate(storedDay(c.contractDate))}` : "Not signed", sub: completion ? `Completion ${formatDate(storedDay(completion))}` : "Completion date not set until possession" }
        : { kind: "stack", title: kind ? INSTRUMENT_SHORT[kind] : "Instrument", sub: "Contract not yet numbered" },
    },
  };
}

type Commenced = Awaited<ReturnType<typeof commencedPendingAll>>[number];

/// FR-VAR-014: the exposure report. Each variation's age is counted in the organisation's days from its commencement
/// to today (time zone not set: no age is shown rather than one read in UTC).
function CommencedCard({ rows, exposure, page, today }: { rows: Commenced[]; exposure: bigint; page: number; today: string | null }) {
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
        variation: { kind: "link", text: v.reference ? `Variation ${v.reference}` : "Variation (not yet numbered)", href: `/projects/${v.contract.id}/variations/${v.id}`, sub: v.description },
        contract: { kind: "stack", title: v.contract.award.exercise.title, sub: `Contract ${v.contract.number} · ${v.contract.award.awardeeName}` },
        estimate: { kind: "money", sen: senFromDecimal(v.estimate).toString() },
        age: { kind: "stack", title: age == null ? "Time zone not set" : `${age} ${age === 1 ? "day" : "days"}`, sub: `Commenced ${formatDate(storedDay(v.commencedOn!))}` },
      },
    };
  });
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<FileIcon size={17} />}
        title="Commenced pending approval"
        subtitle={`Work started on the S.O.'s support before the variation's approval, across every contract, oldest first. ${rows.length} in all, an estimated ${formatMoney(exposure)} not yet approved.`}
        actions={<ButtonLink href="/projects" size="sm" variant="secondary">All contracts</ButtonLink>}
        divided={false}
      />
      <DataList
        flat
        selectable={false}
        exportName="commenced-pending-approval"
        searchPlaceholder="Search by variation, contract or contractor"
        emptyTitle="None"
        emptyBody="No variation has commenced pending its approval."
        stackBelow="xl"
        columns={[
          { key: "variation", label: "Variation", mobile: "primary" },
          { key: "contract", label: "Contract", width: "260px", hideBelow: "2xl", mobile: "meta" },
          { key: "estimate", label: "Estimate", width: "140px", numeric: true, sortable: true, mobile: "meta" },
          { key: "age", label: "Age", width: "160px", sortable: true, mobile: "meta" },
        ]}
        rows={list}
      />
      {pages > 1 && (
        <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
          <span>{`Variations ${at * COMMENCED_PAGE + 1}–${Math.min(rows.length, (at + 1) * COMMENCED_PAGE)} of ${rows.length}. The totals above are over all of them.`}</span>
          <span className="flex gap-2">
            {at > 0 && <ButtonLink href={`/projects?view=commenced&page=${at - 1}`} size="sm" variant="ghost">Previous</ButtonLink>}
            {at + 1 < pages && <ButtonLink href={`/projects?view=commenced&page=${at + 1}`} size="sm" variant="ghost">Next</ButtonLink>}
          </span>
        </CardFooter>
      )}
    </Card>
  );
}
