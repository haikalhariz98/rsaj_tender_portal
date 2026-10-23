import { CaseViewSelect } from "@/app/projects/case-view-select";
import { DataList } from "@/components/data-list";
import { FilesIcon } from "@/components/icons";
import { Blocked } from "@/components/ui/blocked";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { MoreText } from "@/components/ui/more-text";
import { formatDate } from "@/lib/format";
import type { WorkspaceStart } from "@/lib/project-docs/page-store";
import { REGISTER_FILTERS, registerFilterWords, type RegisterFilter, type RegisterRow } from "@/lib/project-docs/register";
import { CLASS_NOT_SET_LEAD, faultText } from "@/lib/project-docs/labels";
import { supervisionFaultWords } from "@/lib/supervision/labels";

import { NewDocumentDrawer } from "./document-editors";
import { STATE_TONE } from "./document-words";

const NOTE_ID = "documents-note";
/// PW-48: the supervision words for no S.O. resolved; the contractor's documents are still received, and nobody is told.
const NO_SO_WORDS = supervisionFaultWords({ code: "NO_SO", level: "block" }).en;

/// The Project stage's own address for this list: the filter and the page's cursor ride in the query beside the tab.
export const documentsHref = (contractId: string, filter: RegisterFilter, after: string | null = null) => {
  const q = new URLSearchParams({ stage: "project", tab: "submissions", ...(filter === "ALL" ? {} : { docs: filter }), ...(after ? { docsAfter: after } : {}) });
  return `/projects/${encodeURIComponent(contractId)}?${q.toString()}`;
};

/**
 * The contract's Documents list (the simple Project workspace, ADR 0042; plan step 4 §5.3): every document of the contract, newest first, with its kind, the day of its
 * latest version, where it stands and who it waits on. No count and no figure (PW-4). The filters are the server's (`loadRegister`), so a filtered list never quietly misses
 * an older document; older ones are a link. "New document" is offered when the reader may start one, and blocked with the reason when not.
 */
export function ProjectDocumentsCard({ contractId, orgName, rows, filter, next, after, start }: { contractId: string; orgName: string; rows: RegisterRow[]; filter: RegisterFilter; next: string | null; after: string | null; start: WorkspaceStart }) {
  const classWords = faultText({ code: "CLASS_NOT_SET", level: "block" }, orgName);
  const others = start.create.reasons.filter((r) => r !== classWords);
  const blocked = !start.create.allowed;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<FilesIcon size={17} />}
        title="Documents"
        subtitle={<MoreText label="About documents" text={`Start a document by uploading files, or ask the contractor for it. A document can have approvers. A rejection goes back with remarks until a new version is approved. Notices and claims the contractor sends are here too: mark each taken up, or return it with remarks. Earlier records are what the contractor sent before documents; they are read only.`} />}
        divided={false}
        actions={blocked ? <Blocked label="New document" reason={start.create.reasons.join(" ")} noteId={NOTE_ID} /> : <NewDocumentDrawer contractId={contractId} picker={start.picker} />}
      />
      {(blocked || start.noSoResolved) && (
        <div id={NOTE_ID} className="flex flex-col gap-2 px-5 pb-4 sm:px-6">
          {!start.classSet && <Callout tone="warn" title={CLASS_NOT_SET_LEAD} action={<MoreText text={classWords} label="Where it is set" />} />}
          {start.noSoResolved && <Callout tone="warn" title={NO_SO_WORDS} />}
          {blocked && others.length > 0 && <p className="text-[12.5px] text-ink-3">{others.join(" ")}</p>}
        </div>
      )}
      <DataList
        flat
        selectable={false}
        paging={false}
        exportName="documents"
        searchPlaceholder="Search by title"
        emptyTitle={filter === "ALL" ? "No documents yet" : "No documents in this list"}
        toolbarFilters={
          <CaseViewSelect
            label="Show documents"
            chipLabel="Show"
            current={filter}
            groups={[{ label: "Show", options: REGISTER_FILTERS.map((f) => ({ value: f, label: registerFilterWords(f, orgName), href: documentsHref(contractId, f) })) }]}
          />
        }
        stackBelow="xl"
        columns={[
          { key: "title", label: "Document", sortable: true, mobile: "primary" },
          { key: "kind", label: "Kind", width: "170px", hideBelow: "lg", mobile: "meta" },
          { key: "latest", label: "Latest version", width: "140px", nowrap: true, sortable: true, mobile: "meta" },
          { key: "state", label: "State", width: "190px", sortable: true, mobile: "meta" },
          { key: "waits", label: "Waiting on", width: "220px", mobile: "meta" },
        ]}
        rows={rows.map((r) => {
          const tone = STATE_TONE[r.state];
          return {
          id: r.id,
          search: [r.title, r.kindLabel ?? "", r.stateLabel, r.waitsOnLabel ?? ""].join(" "),
          sortKeys: { title: r.title.toLowerCase(), latest: r.latestOn ?? "", state: r.stateLabel },
          cells: {
            title: { kind: "link", text: r.title, href: r.href },
            // An earlier record is marked beside its kind, so it reads as what it is (PW-11).
            ...(r.kindLabel ? { kind: r.earlier ? { kind: "chips", items: [{ text: r.kindLabel }, { text: r.earlier.label, tone: "info" }] } : { kind: "text", text: r.kindLabel } } : {}),
            latest: { kind: "text", text: r.latestOn ? formatDate(r.latestOn) : "Not yet", dim: !r.latestOn },
            state: { kind: "badge", text: r.stateLabel, ...(tone === "neutral" ? {} : { tone }) },
            waits: r.waitsOnLabel ? { kind: "text", text: r.waitsOnLabel } : { kind: "text", text: "Nobody", dim: true },
          },
          };
        })}
      />
      {(next || after) && (
        <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
          <span>Newest first</span>
          <span className="flex gap-2">
            {after && <ButtonLink href={documentsHref(contractId, filter)} size="sm" variant="ghost">Newest</ButtonLink>}
            {next && <ButtonLink href={documentsHref(contractId, filter, next)} size="sm" variant="ghost">Older documents</ButtonLink>}
          </span>
        </CardFooter>
      )}
    </Card>
  );
}
