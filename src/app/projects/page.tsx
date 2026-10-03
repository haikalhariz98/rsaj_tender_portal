import { DataList, type Row } from "@/components/data-list";
import { FileIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { PHASE_TONE, PHASE_WORDS } from "@/lib/contract/labels";
import { CONTRACT_PAGE, endorsedPhases, listContracts } from "@/lib/contract/load";
import { CONTRACT_PHASES, type ContractPhase } from "@/lib/contract/status";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOf, storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { exerciseOrg } from "@/lib/method/repo";
import { DELAY_BASIS } from "@/lib/supervision/labels";
import { inDelayContractIds } from "@/lib/supervision/load";

export const dynamic = "force-dynamic";

const TONE = { brand: "brand", info: "info", ok: "ok", warn: "warn", err: "err", neutral: undefined } as const;
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
  const delayIds = org0 && today ? await inDelayContractIds(org0.id, today) : [];
  const delayView = view === "delay";
  const data = await listContracts(page, delayView ? delayIds : null);
  const derived: Map<string, ContractPhase> = data.org ? await endorsedPhases(data.org.id, DERIVE_CAP) : new Map();
  const ready = [...derived.values()].filter((x) => x === "READY_TO_SIGN").length;
  const awaiting = [...derived.values()].filter((x) => x === "AWAITING_CONDITIONS").length;
  const pages = Math.ceil(data.total / CONTRACT_PAGE);
  // 6.13 Part A (FR-SUP-010): In Delay, derived, never stored; the reading rests on an assumption (BD-613-12).
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
        ...(["IN_PREPARATION", "RETURNED_FOR_AMENDMENT", "PENDING_LEGAL_ENDORSEMENT", "LEGALLY_ENDORSED"].includes(status) ? ["forming"] : []),
        ...(phase === "READY_TO_SIGN" ? ["ready"] : []),
        ...(["EXECUTED", "STAMPED", "ACTIVE"].includes(status) ? ["executed"] : []),
      ],
      search: [r.award.exercise.title, r.number, r.award.awardeeName, r.award.reference, PHASE_WORDS[phase].en].join(" "),
      sortKeys: { sum: Number(r.contractSum.toString()), contract: r.award.exercise.title },
      cells: {
        contract: { kind: "link", text: r.award.exercise.title, href: `/projects/${r.id}`, sub: `Contract ${r.number}` },
        contractor: { kind: "text", text: r.award.awardeeName },
        sum: { kind: "money", value: Number(r.contractSum.toString()) },
        phase: inDelay.has(r.id) ? { kind: "chips", items: [{ text: PHASE_WORDS[phase].en, ...(TONE[PHASE_TONE[phase]] ? { tone: TONE[PHASE_TONE[phase]] } : {}) }, { text: "In Delay (assumed reading)", tone: "err" }] } : { kind: "badge", text: PHASE_WORDS[phase].en, tone: TONE[PHASE_TONE[phase]] },
        dates: { kind: "stack", title: r.contractDate ? `Contract Date ${formatDate(storedDay(r.contractDate))}` : "Not signed", sub: completion ? `Completion ${formatDate(storedDay(completion))}` : "Completion date not set until possession" },
      },
    };
  });

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Contracts after award: formed, signed, stamped and distributed, on a fixed baseline."
        meta={[`${data.counts.preparing} in preparation`, `${data.counts.returned} returned for amendment`, `${data.counts.legal} with the legal office`, `${awaiting} awaiting conditions`, `${ready} ready to sign`, `${data.counts.executed} executed`, `${delayIds.length} In Delay (assumed reading)`]}
      />
      <Callout tone="info" className="mb-6" title="Still to come here">
        Possession of site, supervision and site records are recorded on each contract&apos;s Team and Site tabs. Still to come: variations, extensions of time and liquidated damages; valuations, interim certificates, retention and the payment waterfall; completion, defects and the final account. Each contract&apos;s baseline here is what they will read.
      </Callout>
      <Card className="overflow-hidden">
        <CardHeader
          icon={<FileIcon size={17} />}
          title={delayView ? "Contracts In Delay" : "Contracts"}
          subtitle={delayView ? `Every contract In Delay today, judged across all of them, newest number first. ${DELAY_BASIS} (assumed)` : "Newest number first. A contract appears here when its award's instrument is issued."}
          actions={delayView ? <ButtonLink href="/projects" size="sm" variant="secondary">All contracts</ButtonLink> : <ButtonLink href="/projects?view=delay" size="sm" variant="secondary">{`In Delay (${delayIds.length})`}</ButtonLink>}
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
    </>
  );
}
