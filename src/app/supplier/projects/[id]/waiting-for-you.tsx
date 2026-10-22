import { DataList } from "@/components/data-list";
import { ButtonLink } from "@/components/ui/button";
import type { WaitingRow } from "@/lib/project-docs/portal-read";

/**
 * "Waiting for you" as a list (the simple Project workspace, plan step 5; PW-13): the documents the organisation has asked the contractor for, or sent back with remarks. Words
 * only, as the loader gave them: no count, no days waiting. On the portal home it spans the contractor's contracts and names each (`withContract`); on one project's overview it
 * is that contract's alone. A page of it is shown; where there are more, a link leads to the list that holds them all. Nothing is drawn for no rows: the screen decides what to say.
 */
export function WaitingList({ rows, withContract, more }: { rows: WaitingRow[]; withContract: boolean; more: { href: string; label: string } | null }) {
  return (
    <>
      <DataList
        flat
        selectable={false}
        paging={false}
        toolbar={false}
        stackBelow="xl"
        columns={[
          { key: "title", label: "Document", mobile: "primary" },
          ...(withContract ? [{ key: "contract", label: "Contract", width: "260px", hideBelow: "lg" as const, mobile: "meta" as const }] : []),
          { key: "state", label: "State", width: "190px", mobile: "meta" },
        ]}
        rows={rows.map((r) => ({
          id: r.documentId,
          search: [r.title, r.contractLabel, r.stateLabel].join(" "),
          cells: {
            title: { kind: "link", text: r.title, href: r.href, ...(r.kindLabel ? { sub: r.kindLabel } : {}) },
            ...(withContract ? { contract: { kind: "text", text: r.contractLabel } } : {}),
            state: { kind: "badge", text: r.stateLabel, tone: "warn" },
          },
        }))}
      />
      {more && (
        <div className="flex justify-end px-5 py-3 sm:px-6">
          <ButtonLink href={more.href} size="sm" variant="ghost">
            {more.label}
          </ButtonLink>
        </div>
      )}
    </>
  );
}
