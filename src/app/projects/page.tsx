import { DataList, type Row } from "@/components/data-list";
import { FileIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { PHASE_TONE, PHASE_WORDS } from "@/lib/contract/labels";
import { CONTRACT_PAGE, endorsedPhases, listContracts } from "@/lib/contract/load";
import { beforeExecution, CONTRACT_PHASES, isExecuted, type ContractPhase } from "@/lib/contract/status";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOf, daysFrom, storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { formatMoney, senFromDecimal } from "@/lib/money";
import { exerciseOrg } from "@/lib/method/repo";
import { DELAY_BASIS } from "@/lib/supervision/labels";
import { inDelayContractIds } from "@/lib/supervision/load";
import { commencedPendingAll } from "@/lib/variation/view";

export const dynamic = "force-dynamic";

const TONE = { brand: "brand", info: "info", ok: "ok", warn: "warn", err: "err", neutral: undefined } as const;
/// Variations commenced pending approval shown per page; the set is judged whole first.
const COMMENCED_PAGE = 50;
/// The derived phases are read for at most this many legally endorsed contracts; more are counted, not split.
const DERIVE_CAP = 200;

/**
 * Projects (OD-6 A): the contracts after award, each forming, executed or running. The header's counts
 * are taken in the database over every contract; "awaiting conditions" and "ready to sign" are derived
 * from each legally endorsed contract's readiness gate and its company resolution, never stored: the
 * configuration read once and the endorsed contracts' gate rows in one query (6.12 review).
 */
export default async function ProjectsPage(props: PageProps<"/projects">) {
  const { page: p, view } = (await props.searchParams) as { page?: string; view?: string };
  const page = Math.max(0, Number.parseInt(p ?? "0", 10) || 0);
  // 6.13 Part A review 14: In Delay is a view over the whole set, judged across every possessed contract, then paged.
  const org0 = await exerciseOrg();
  const today = org0?.timeZone ? dayOf(new Date(), org0.timeZone) : null;
  const delay = org0 && today ? await inDelayContractIds(org0.id, today) : { ids: [], assumed: new Set<string>() };
  const delayIds = delay.ids;
  const delayView = view === "delay";
  // 6.13 Part A step 4 (FR-VAR-014): every variation commenced pending approval, across contracts, with its estimate
  // and age, judged over the whole set and then paged.
  const commencedView = view === "commenced";
  const commenced = org0 ? await commencedPendingAll(org0.id) : [];
  const exposure = commenced.reduce((a, v) => a + senFromDecimal(v.estimate), 0n);
  const data = await listContracts(page, delayView ? delayIds : null);
  const derived: Map<string, ContractPhase> = data.org ? await endorsedPhases(data.org.id, DERIVE_CAP) : new Map();
  const ready = [...derived.values()].filter((x) => x === "READY_TO_SIGN").length;
  const awaiting = [...derived.values()].filter((x) => x === "AWAITING_CONDITIONS").length;
  const pages = Math.ceil(data.total / CONTRACT_PAGE);
  // 6.13 Part A (FR-SUP-010): In Delay, derived, never stored. Tagged ASSUMED (the shared badge) only where the
  // reading rests on the straight-line assumption (BD-613-12, narrowed by the residual review); a lapsed date for
  // completion does not.
  const inDelay = new Set(delayIds);

  const rows: Row[] = data.rows.map((r) => {
    const status = r.status as ContractStatus;
    const phase = derived.get(r.id) ?? (status as ContractPhase);
    // The version in force today, read through baselineFor (ADR 0021).
    const completion = r.dateForCompletion;
    return {
      id: r.id,
      views: [
        ...(status === "NUMBER_ALLOCATED" ? ["unstarted"] : []),
        // Review S1: the contract's own rules, never a list of its own (load.ts counts EXECUTED_STATES the same way).
        ...(beforeExecution(status) ? ["forming"] : []),
        ...(phase === "READY_TO_SIGN" ? ["ready"] : []),
        ...(isExecuted(status) ? ["executed"] : []),
      ],
      search: [r.award.exercise.title, r.number, r.award.awardeeName, r.award.reference, PHASE_WORDS[phase].en].join(" "),
      sortKeys: { contract: r.award.exercise.title },
      cells: {
        contract: { kind: "link", text: r.award.exercise.title, href: `/projects/${r.id}`, sub: `Contract ${r.number}` },
        contractor: { kind: "text", text: r.award.awardeeName },
        // Money in sen, shown and sorted exactly by the list (never a float).
        sum: { kind: "money", sen: senFromDecimal(r.contractSum).toString() },
        phase: inDelay.has(r.id) ? { kind: "chips", items: [{ text: PHASE_WORDS[phase].en, ...(TONE[PHASE_TONE[phase]] ? { tone: TONE[PHASE_TONE[phase]] } : {}) }, { text: "In Delay", tone: "err", ...(delay.assumed.has(r.id) ? { provenance: "ASSUMED" as const } : {}) }] } : { kind: "badge", text: PHASE_WORDS[phase].en, tone: TONE[PHASE_TONE[phase]] },
        dates: { kind: "stack", title: r.contractDate ? `Contract Date ${formatDate(storedDay(r.contractDate))}` : "Not signed", sub: completion ? `Completion ${formatDate(storedDay(completion))}` : "Completion date not set until possession" },
      },
    };
  });

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Contracts after award: formed, signed, stamped and distributed, on a fixed baseline."
        meta={[`${data.counts.preparing} in preparation`, `${data.counts.returned} returned for amendment`, `${data.counts.legal} with the legal office`, `${awaiting} awaiting conditions`, `${ready} ready to sign`, `${data.counts.executed} executed`, <span key="delay" className="inline-flex flex-wrap items-center gap-1.5">
            {`${delayIds.length} In Delay`}
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
          title={delayView ? "Contracts In Delay" : "Contracts"}
          subtitle={
            delayView ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {`Every contract In Delay today, judged across all of them, newest number first.${delay.assumed.size > 0 ? ` ${DELAY_BASIS}` : ""}`}
                {delay.assumed.size > 0 && <ProvenanceBadge value="ASSUMED" />}
              </span>
            ) : (
              "Newest number first. A contract appears here when its award's instrument is issued."
            )
          }
          actions={
            <span className="flex flex-wrap gap-2">
              {delayView ? <ButtonLink href="/projects" size="sm" variant="secondary">All contracts</ButtonLink> : <ButtonLink href="/projects?view=delay" size="sm" variant="secondary">{`In Delay (${delayIds.length})`}</ButtonLink>}
              <ButtonLink href="/projects?view=commenced" size="sm" variant="secondary">{`Commenced pending approval (${commenced.length})`}</ButtonLink>
            </span>
          }
          divided={false}
        />
        <DataList
          flat
          selectable={false}
          exportName="contracts"
          searchPlaceholder="Search by title, number or contractor"
          emptyTitle={delayView ? "None In Delay" : "No contracts yet"}
          emptyBody={delayView ? "No contract is In Delay today." : "A contract is numbered when its award's instrument is issued."}
          views={[
            { id: "unstarted", label: "Not started" },
            { id: "forming", label: "Being formed" },
            { id: "ready", label: "Ready to sign" },
            { id: "executed", label: "Executed" },
          ]}
          filters={[{ key: "phase", label: "Where it stands", order: CONTRACT_PHASES.map((x) => PHASE_WORDS[x].en) }]}
          rowAction={{ label: "Open", hrefTemplate: "/projects/{id}" }}
          rowOpens
          stackBelow="xl"
          columns={[
            { key: "contract", label: "Contract", sortable: true, mobile: "primary" },
            { key: "contractor", label: "Contractor", width: "200px", hideBelow: "2xl", mobile: "meta" },
            { key: "sum", label: "Contract sum", width: "140px", numeric: true, sortable: true, mobile: "meta" },
            { key: "phase", label: "Where it stands", width: "200px", sortable: true, mobile: "meta" },
            { key: "dates", label: "Dates", width: "220px", mobile: "meta" },
          ]}
          rows={rows}
        />
        {pages > 1 && (
          <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
            <span>
              Contracts {page * CONTRACT_PAGE + 1}–{Math.min(data.total, (page + 1) * CONTRACT_PAGE)} of {data.total}. Search and the views look within this page.
            </span>
            <span className="flex gap-2">
              {page > 0 && <ButtonLink href={`/projects?${delayView ? "view=delay&" : ""}page=${page - 1}`} size="sm" variant="ghost">Previous</ButtonLink>}
              {page + 1 < pages && <ButtonLink href={`/projects?${delayView ? "view=delay&" : ""}page=${page + 1}`} size="sm" variant="ghost">Next</ButtonLink>}
            </span>
          </CardFooter>
        )}
      </Card>
      )}
    </>
  );
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
