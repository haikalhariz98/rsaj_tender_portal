import { DataList } from "@/components/data-list";
import { InboxIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { STATE_TONE } from "@/app/projects/[id]/document-words";
import type { StaffActor } from "@/lib/auth/types";
import { CASES_LIST_WORDS } from "@/lib/contract/case-page-words";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { exerciseOrg } from "@/lib/method/repo";
import { EARLIER_RECORD } from "@/lib/project-docs/earlier";
import { isWaitingFilter, loadDocumentsWaiting, waitingFilterWords, WAITING_FILTERS, type DocumentsWaitingRow, type WaitingFilter } from "@/lib/project-docs/waiting-read";

import { CaseViewSelect } from "./case-view-select";

/// This view's own address: the filter and the cursor of a later page ride in the query beside `view`.
export const documentsWaitingHref = (filter: WaitingFilter, after: string | null = null) => {
  const q = new URLSearchParams({ view: "submissions", ...(filter === "ALL" ? {} : { waiting: filter }), ...(after ? { waitingAfter: after } : {}) });
  return `/projects?${q.toString()}`;
};

/**
 * "Documents waiting" (the simple Project workspace, PW-11): across the organisation, what waits on it, from both sources: documents (the six kinds the contractor sends, versions
 * waiting for approval, requests to the organisation) and the earlier records not yet answered. A view of the Contracts list; its address keeps `view=submissions` so the notices and
 * links that name it still arrive. Two filters, All and Waiting for me, served by the loader; paged by a cursor with no count (PW-4). Not filtered by restricted exercise (AC-18, AC-19).
 */
export async function DocumentsWaitingView({ actor, filterParam, afterParam }: { actor: StaffActor; filterParam: string | undefined; afterParam: string | undefined }) {
  const filter = isWaitingFilter(filterParam) ? filterParam : "ALL";
  const after = afterParam || null;
  const org = await exerciseOrg(actor.organisationId);
  const waiting = org ? await loadDocumentsWaiting(db, { org: { id: org.id, code: org.code, name: org.name }, viewerPersonId: actor.personId, today: org.today, filter, after }) : { rows: [], next: null };
  return <DocumentsWaitingList rows={waiting.rows} next={waiting.next} filter={filter} after={after} />;
}

/// The page itself, from what the loader gave: rows as data, so it renders without a database.
export function DocumentsWaitingList({ rows, next, filter, after }: { rows: DocumentsWaitingRow[]; next: string | null; filter: WaitingFilter; after: string | null }) {
  return (
    <>
      <PageHeader title="Documents waiting" actions={<ButtonLink href="/projects" size="sm" variant="secondary">{CASES_LIST_WORDS.allContracts.en}</ButtonLink>} />
      <Card className="overflow-hidden">
        <CardHeader
          icon={<InboxIcon size={17} />}
          title="Waiting on the organisation"
          info={{ label: "About documents waiting", text: "Documents the contractor has sent and not yet had an answer, versions waiting for approval, and requests made to the organisation. Open one to answer it. Earlier records are what the contractor sent before documents." }}
          divided={false}
        />
        <DataList
          flat
          selectable={false}
          paging={false}
          exportName="documents-waiting"
          searchPlaceholder="Search by title, contract or contractor"
          emptyTitle={filter === "ALL" ? "Nothing is waiting" : "Nothing is waiting for you"}
          toolbarFilters={
            <CaseViewSelect label="Show documents" chipLabel="Show" current={filter} groups={[{ label: "Show", options: WAITING_FILTERS.map((f) => ({ value: f, label: waitingFilterWords(f), href: documentsWaitingHref(f) })) }]} />
          }
          stackBelow="xl"
          columns={[
            { key: "title", label: "Document", sortable: true, mobile: "primary" },
            { key: "contract", label: "Contract", width: "210px", mobile: "meta" },
            { key: "kind", label: "Kind", width: "190px", hideBelow: "lg", mobile: "meta" },
            { key: "latest", label: "Latest version", width: "140px", nowrap: true, sortable: true, mobile: "meta" },
            { key: "state", label: "State", width: "180px", mobile: "meta" },
          ]}
          rows={rows.map((r) => {
            const tone = STATE_TONE[r.state];
            return {
              id: r.id,
              search: [r.title, r.contractNumber, r.contractor, r.kindLabel ?? "", r.stateLabel].join(" "),
              sortKeys: { title: r.title.toLowerCase(), latest: r.latestOn ?? "" },
              cells: {
                title: { kind: "link", text: r.title, href: r.href },
                contract: { kind: "stack", title: r.contractNumber, sub: r.contractor },
                ...(r.kindLabel ? { kind: r.earlier ? { kind: "chips", items: [{ text: r.kindLabel }, { text: r.earlier.label || EARLIER_RECORD, tone: "info" }] } : { kind: "text", text: r.kindLabel } } : {}),
                latest: { kind: "text", text: r.latestOn ? formatDate(r.latestOn) : "Not yet", dim: !r.latestOn },
                state: { kind: "badge", text: r.stateLabel, ...(tone === "neutral" ? {} : { tone }) },
              },
            };
          })}
        />
        {(next || after) && (
          <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
            <span>Newest first</span>
            <span className="flex gap-2">
              {after && <ButtonLink href={documentsWaitingHref(filter)} size="sm" variant="ghost">Newest</ButtonLink>}
              {next && <ButtonLink href={documentsWaitingHref(filter, next)} size="sm" variant="ghost">Older documents</ButtonLink>}
            </span>
          </CardFooter>
        )}
      </Card>
    </>
  );
}
