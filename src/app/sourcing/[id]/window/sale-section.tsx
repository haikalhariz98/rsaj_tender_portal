import type { ReactNode } from "react";

import { FileIcon, InboxIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
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
    actions: d.online ? null : <RecordSaleDrawer exerciseId={c.exerciseId} allowed={d.open} parties={parties} invited={invited} restricted={d.restricted} people={c.people} fee={d.fee} suppliers={d.suppliers.options} suppliersTotal={d.suppliers.total} />,
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
          The number is typed in from finance&apos;s receipt. Until then the sale stays on the list of receipts to collect: {d.reconciliation.map((r) => `${r.purchaser} (sold ${r.soldOn}, ${r.amount})`).join("; ")}.
        </Callout>
      )}
      {d.online && (
        <Callout tone="info" title="These documents are bought online">
          {d.onlinePayment
            ? "A supplier buys them through the portal and pays on the demonstration payment simulator; the sale appears below the moment it is paid. A simulated payment is never a finance receipt: it carries no receipt number, is not among the receipts to collect and never reaches a finance export."
            : "A supplier buys them through the portal. Online payment is not switched on, so the buyer pays at the finance counter and you record the receipt against its purchase below; the documents are then released."}
        </Callout>
      )}
      {d.online && (
        <Card className="overflow-hidden">
          <CardHeader icon={<InboxIcon size={17} />} title="Bought online, awaiting payment" subtitle={`${d.awaitingPayment.length} ${d.awaitingPayment.length === 1 ? "purchase waits" : "purchases wait"} for payment. Record the finance receipt of one that paid at the counter.`} />
          <PurchasesList exerciseId={c.exerciseId} purchases={d.awaitingPayment} onlinePayment={d.onlinePayment} />
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
            <Callout tone="warn" title="Some sales were paid on the payment simulator">
              A sale marked Simulated payment is a demonstration: no money moved and it is not a finance receipt. It carries no receipt number and is not counted among the receipts to collect.
            </Callout>
          )}
          <Callout tone="warn" title="Registration and suspension are checked only for a linked contractor">
            A contractor linked to the supplier register is checked against it at the sale, and its eligibility is kept with the sale. One not linked cannot be checked here: its sale carries that warning on to bid receipt and evaluation. Link a contractor from its supplier&apos;s record under Suppliers.
          </Callout>
          {d.restricted && (
            <Callout tone="info" title={`${d.restricted.label}`}>
              {d.restricted.asks} A sale is refused if the certificate is not shown or has expired.
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
            subtitle="Suppliers that asked for the documents from their portal accounts. A request sells nothing and takes no payment: record the sale above, naming the supplier, and the request reads as sold."
          />
          <RequestsList requests={d.requests} />
        </Card>
      )}
    </div>
  );
}

