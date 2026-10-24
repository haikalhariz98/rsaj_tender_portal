import type { Metadata } from "next";

import { ToolsIcon } from "@/components/icons";
import { DataList, type Row } from "@/components/data-list";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { CONTRACT_STATUS_WORDS } from "@/lib/contract/labels";
import { db } from "@/lib/db";
import { contractsToAccept } from "@/lib/portal/projects/award-card-store";
import { loadMyContracts } from "@/lib/portal/projects/list-store";

import { requireSupplier } from "../../_auth/supplier";

export const metadata: Metadata = { title: "My Projects" };
export const dynamic = "force-dynamic";

/**
 * The signed-in contractor's contracts (Phase 4e; spec section 5.3, the appointed contractor): every contract whose award names the supplier on the register, with what waits for the contractor
 * on each. The supplier is the SESSION's and nothing in the address names one. Rows are data, so the list sorts and searches them on the client.
 */
export default async function SupplierProjectsPage() {
  const actor = await requireSupplier();
  const [rows, accept] = await Promise.all([loadMyContracts(db, actor), contractsToAccept(db, actor)]);
  const toAccept = new Set(accept.map((c) => c.id));
  const list: Row[] = rows.map((r) => {
    const status = CONTRACT_STATUS_WORDS[r.status].en;
    const chips = [
      ...(toAccept.has(r.id) ? [{ text: "To accept", tone: "warn" as const }] : []),
      ...(r.toAttest ? [{ text: `${r.toAttest} diary ${r.toAttest === 1 ? "entry" : "entries"} to attest`, tone: "warn" as const }] : []),
      ...(r.toSign ? [{ text: `${r.toSign} ${r.toSign === 1 ? "certificate" : "certificates"} to sign`, tone: "warn" as const }] : []),
      ...(r.returned ? [{ text: `${r.returned} returned`, tone: "warn" as const }] : []),
      ...(r.waitingOnOffice ? [{ text: `${r.waitingOnOffice} with the office`, tone: "info" as const }] : []),
    ];
    return {
      id: r.id,
      cells: {
        contract: { kind: "stack", title: r.title, sub: `Contract ${r.number} · ${r.reference}`, monoSub: true },
        status: { kind: "badge", text: status, tone: r.status === "ACTIVE" ? "ok" : r.status === "CANCELLED" || r.status === "TERMINATED" ? "err" : undefined },
        waiting: chips.length ? { kind: "chips", items: chips } : { kind: "text", text: "Nothing waiting", dim: true },
      },
      sortKeys: { contract: r.title.toLowerCase() },
      search: `${r.title} ${r.number} ${r.reference} ${status}`,
      views: [r.status === "ACTIVE" ? "active" : "other", ...(chips.some((c) => c.tone === "warn") ? ["attention"] : [])],
    };
  });
  return (
    <>
      <PageHeader title="My Projects" subtitle={actor.supplierName} meta={[actor.displayName]} />
      <Card className="overflow-hidden">
        <CardHeader icon={<ToolsIcon size={17} />} title="Contracts you hold" divided={false} />
        <DataList
          flat
          selectable={false}
          exportName="my-projects"
          searchPlaceholder="Search by title, number or reference"
          emptyTitle="No contract yet"
          views={[
            { id: "active", label: "Active" },
            { id: "attention", label: "Waiting for you", emptyTitle: "Nothing waits for you" },
            { id: "other", label: "Other" },
          ]}
          rowAction={{ label: "Open", hrefTemplate: "/supplier/projects/{id}" }}
          rowOpens
          stackBelow="xl"
          columns={[
            { key: "contract", label: "Contract", sortable: true, mobile: "primary" },
            { key: "status", label: "Status", width: "220px", mobile: "meta" },
            { key: "waiting", label: "Waiting for you", width: "360px", mobile: "meta" },
          ]}
          rows={list}
        />
      </Card>
    </>
  );
}
