import { DataList } from "@/components/data-list";
import { FilesIcon } from "@/components/icons";
import { Blocked } from "@/components/ui/blocked";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import type { PortalRow, PortalStart } from "@/lib/project-docs/portal-read";

import { NewDocumentDrawer } from "./document-drawers";
import { portalTone, SENDING_CLOSED } from "./document-words";

const NOTE_ID = "portal-documents-note";

/// The project page's own address for this list: the cursor of an older page rides in the query beside the tab.
export const portalDocumentsHref = (contractId: string, after: string | null = null) => {
  const q = new URLSearchParams({ tab: "submissions", ...(after ? { docsAfter: after } : {}) });
  return `/supplier/projects/${encodeURIComponent(contractId)}?${q.toString()}`;
};

/**
 * The contractor's Documents list on a contract (the simple Project workspace, plan step 5): every document it may see, newest first, with its kind, the day of its latest
 * version, where it stands and who it waits on. All in words, as the loader gave them: no count and no figure (PW-4). Older documents are a link, never a quiet cut-off.
 * "New document" is offered when the contract and the organisation's settings allow it, and blocked with the reason when not.
 */
export function PortalDocumentsCard({ contractId, rows, next, after, start, token }: { contractId: string; rows: PortalRow[]; next: string | null; after: string | null; start: PortalStart; token: string | null }) {
  const reason = !token ? SENDING_CLOSED : start.create.allowed ? null : start.create.reasons.join(" ");
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<FilesIcon size={17} />}
        title="Documents"
        info={{ label: "About documents", text: `Send files, or ask ${start.organisationName} for a document. If one is sent back, the remarks come with it. Notices and claims are sent here too: pick the kind. Send a new version until it is approved or taken up.` }}
        divided={false}
        actions={reason ? <Blocked label="New document" reason={reason} noteId={NOTE_ID} /> : <NewDocumentDrawer contractId={contractId} token={token} organisationName={start.organisationName} kinds={start.kinds} />}
      />
      {reason && (
        <p id={NOTE_ID} className="px-5 pb-4 text-[12.5px] text-ink-3 sm:px-6">
          {reason}
        </p>
      )}
      <DataList
        flat
        selectable={false}
        paging={false}
        exportName="documents"
        searchPlaceholder="Search by title"
        emptyTitle="No documents yet"
        stackBelow="xl"
        columns={[
          { key: "title", label: "Document", sortable: true, mobile: "primary" },
          { key: "kind", label: "Kind", width: "170px", hideBelow: "lg", mobile: "meta" },
          { key: "latest", label: "Latest version", width: "140px", nowrap: true, sortable: true, mobile: "meta" },
          { key: "state", label: "State", width: "210px", sortable: true, mobile: "meta" },
          { key: "waits", label: "Waiting on", width: "200px", mobile: "meta" },
        ]}
        rows={rows.map((r) => {
          const tone = portalTone(r);
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
            {after && <ButtonLink href={portalDocumentsHref(contractId)} size="sm" variant="ghost">Newest</ButtonLink>}
            {next && <ButtonLink href={portalDocumentsHref(contractId, next)} size="sm" variant="ghost">Older documents</ButtonLink>}
          </span>
        </CardFooter>
      )}
    </Card>
  );
}
