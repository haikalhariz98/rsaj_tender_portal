import type { ReactNode } from "react";

import { FileIcon, InboxIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { InfoChip } from "@/components/ui/info-chip";
import type { saleRegister } from "@/lib/window/read";

import { RecordSaleDrawer } from "./editors";
import { PurchasesList } from "./purchases-list";
import type { Person, WindowContext } from "./window-section";
import { RequestsList } from "./requests-list";
import { SaleList } from "./sale-list";

type Sales = NonNullable<Awaited<ReturnType<typeof saleRegister>>>;

/// The header's share of the Sale register: recording a sale is its primary act, disabled with the window's own reason when sale is not open.
export function saleHeader(d: Sales, c: WindowContext): { actions: ReactNode; notes: [string, string][] } {
  const bought = new Set(d.rows.filter((r) => !r.voided).map((r) => r.registrationNo));
  const invited = d.pathKey === "INVITED";
  const parties: Person[] = d.parties.filter((p) => !bought.has(p.registrationNo) && (!invited || p.invited)).map((p) => ({ value: p.id, label: `${p.name} (${p.registrationNo})` }));
  return {
    // SR-10 (ruling 16, G3): an exercise sold online is bought through the supplier portal, so the counter sale is not offered on it.
    actions: d.online ? null : <RecordSaleDrawer exerciseId={c.exerciseId} allowed={d.open} parties={parties} invited={invited} restricted={d.restricted} people={c.people} fee={d.fee} />,
    notes: [...(d.online || d.open.allowed ? [] : [["Record a sale", d.open.reason] as [string, string]]), ...(d.voidAll ? [["Void a sale", d.voidAll] as [string, string]] : [])],
  };
}

/**
 * The Sale register (FR-ADV-009 to 012): every set sold, with its receipt, amount, day and the
 * checks as attested, and the label that goes on the set. The register is the recipient list for
 * addenda and for notice of a change. Registration and suspension read "not checked" until the
 * supplier register exists, and that warning travels with each sale.
 */
export function SaleSection({ d, c }: { d: Sales; c: WindowContext }) {
  if (c.status === "DRAFT" || c.status === "DOCUMENTS_IN_PREPARATION" || c.status === "PENDING_APPROVAL_FOR_TENDERING") return null;
  const live = d.rows.filter((r) => !r.voided);
  return (
    <div className="flex flex-col gap-6">
      {d.reconciliation.length > 0 && (
        <Callout tone="warn" title={`${d.reconciliation.length} ${d.reconciliation.length === 1 ? "sale has" : "sales have"} no finance receipt number yet`}>
          Receipts to collect: {d.reconciliation.map((r) => `${r.purchaser} (sold ${r.soldOn}, ${r.amount})`).join("; ")}.
        </Callout>
      )}
      {d.simulatedNoMoney.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
          <InfoChip tone="info" detail="Simulated. No money moved and no finance receipt is due. Not takings." label="About Demo">Demo</InfoChip>
          <span>{d.simulatedNoMoney.length} simulated {d.simulatedNoMoney.length === 1 ? "sale" : "sales"}, no money received: {d.simulatedNoMoney.map((r) => `${r.purchaser} (sold ${r.soldOn}, ${r.amount})`).join("; ")}.</span>
        </div>
      )}

      {d.online && (
        <Card className="overflow-hidden">
          <CardHeader icon={<InboxIcon size={17} />} title="Bought online, awaiting payment" subtitle={`${d.awaitingPayment.length} waiting`} actions={d.onlinePayment ? <InfoChip tone="info" detail="Simulated payment. No money moves. Never a finance receipt, and it never reaches a finance export." label="About Demo">Demo</InfoChip> : <InfoChip tone="info" detail="Online payment is not switched on. The buyer pays at the finance counter. Record the receipt against the purchase to release the documents." label="About counter payment">Pay at counter</InfoChip>} />
          <PurchasesList exerciseId={c.exerciseId} purchases={d.awaitingPayment} />
        </Card>
      )}
      <Card className="overflow-hidden">
        <CardHeader
          icon={<FileIcon size={17} />}
          title="Sale register"
          subtitle={`${live.length} ${live.length === 1 ? "set" : "sets"} sold${d.rows.length > live.length ? `, ${d.rows.length - live.length} void` : ""} at ${d.fee}. ${d.phase}.`}
          divided={false}
          actions={<ButtonLink href={`/sourcing/${c.exerciseId}?tab=documents&section=publishing`} variant="ghost" size="sm">See the addenda</ButtonLink>}
        />
        <CardBody className="flex flex-col gap-3 border-t border-line">
          {d.rows.some((r) => r.simulated) && (
            <div className="flex items-center gap-2 text-[13px] text-ink-2">
              <InfoChip tone="info" detail="Some sales were paid on the simulator. No money moved and they are not finance receipts. No receipt number." label="About Demo">Demo</InfoChip>
              <span>Some sales are simulated.</span>
            </div>
          )}
          <Callout tone="warn" title="Only linked contractors are checked">
            Unlinked sales carry this warning to bid receipt.
          </Callout>
          {d.restricted && (
            <Callout tone="warn" title={`${d.restricted.label}`}>
              {d.restricted.asks} Refused if not shown or expired.
            </Callout>
          )}
        </CardBody>
        <SaleList exerciseId={c.exerciseId} sales={d.rows} />
      </Card>
      {d.requests.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader
            icon={<InboxIcon size={17} />}
            title="Asked for online"
            subtitle="Record the sale to mark sold"
          />
          <RequestsList requests={d.requests} />
        </Card>
      )}
    </div>
  );
}

