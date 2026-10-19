import Link from "next/link";
import { notFound } from "next/navigation";

import { RecordCrumb } from "@/components/shell/record-crumb";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { KeyValues } from "@/components/ui/stat";
import { WalletIcon } from "@/components/icons";
import { issueFormToken } from "@/lib/auth/form-secret";
import { db } from "@/lib/db";
import { SIMULATED_LABEL, simulatedReceiptLines } from "@/lib/integration/payment-gateway";
import { loadBidContext } from "@/lib/portal/bids/context-store";
import { loadReleaseFacts } from "@/lib/portal/bids/inspection-store";
import { paymentSay } from "@/lib/portal/bids/payment-say";
import { loadOnlineView } from "@/lib/portal/bids/purchase-read";

import { requireSupplier } from "../../../../_auth/supplier";
import { PayControls } from "./pay-controls";

export const dynamic = "force-dynamic";

/**
 * Paying for the documents bought online (SR-10, ruling 17 as amended). Where the organisation has switched the payment simulator on, the buyer chooses one of the methods it offers and is taken to a
 * simulated provider's page, which says in its first line that it is simulated, and chooses "Pay successfully" or "Payment fails". Where the simulator is not switched on it says so, in the organisation's own
 * name, and the payment is made as the organisation instructs and recorded by an officer. Once paid, this page is the receipt, and it says "Simulated payment" for as long as it is one. The supplier is the
 * SESSION's; the id in the address is an exercise's.
 */
export default async function PayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const actor = await requireSupplier();
  const { id } = await params;
  const { m } = await searchParams;
  const back = `/supplier/bids/${id}?tab=documents`;
  const ctx = await loadBidContext(db, actor, id);
  if (!ctx) notFound();
  const view = await loadOnlineView(db, actor, ctx);
  const head = (title: string, badge?: { text: string; tone: "ok" | "warn" | "neutral" }) => (
    <>
      <RecordCrumb label={ctx.ex.reference} />
      <PageHeader eyebrow={<Link href={back}>Back to the documents</Link>} title={title} badge={badge ? <Badge tone={badge.tone}>{badge.text}</Badge> : undefined} subtitle={`${ctx.ex.reference} · ${ctx.ex.title}`} />
    </>
  );

  if (!view || !view.purchase) {
    return (
      <>
        {head("Pay for the documents")}
        <Card>
          <EmptyState title={view ? "No purchase started" : "Not sold online"} action={<ButtonLink href={back} variant="secondary" size="sm">Back to the documents</ButtonLink>} />
        </Card>
      </>
    );
  }

  // Paid: this page is the receipt.
  if (view.purchase.paid) {
    const p = view.purchase.paid;
    const release = await loadReleaseFacts(db, actor, ctx);
    const lines =
      p.channel === "SIMULATED"
        ? simulatedReceiptLines({ reference: p.reference ?? "", method: p.method ?? "", amount: p.amount, paidOnText: p.on, organisation: ctx.org.name })
        : [`Paid on ${p.on}: the office recorded your payment (${p.channelWords}).`, `Amount: ${p.amount}`];
    return (
      <>
        {head(p.channel === "SIMULATED" ? "Your receipt (simulated payment)" : "Your receipt", { text: p.channel === "SIMULATED" ? SIMULATED_LABEL : "Paid", tone: p.channel === "SIMULATED" ? "warn" : "ok" })}
        <Card>
          <CardHeader icon={<WalletIcon size={17} />} title={release.state === "READY" || release.state === "NOT_OPEN" ? "The documents are paid for" : "Payment made on the simulator"} subtitle={`Started ${view.purchase.startedOn}.`} actions={release.state === "READY" ? <ButtonLink href={`/supplier/bids/${id}/documents`} variant="primary" size="sm" prefetch={false}>Open the documents</ButtonLink> : undefined} />
          <CardBody className="flex flex-col gap-4">
            <ul className="flex flex-col gap-1.5 text-[14px] text-ink">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
            <p className="text-[14px] text-ink"><span className="font-semibold">{release.words.short}.</span> {release.words.detail}</p>
          </CardBody>
        </Card>
      </>
    );
  }

  // Awaiting payment, and online payment is not switched on: say so in the organisation's name.
  if (!view.payment.available) {
    const org = view.payment.organisation;
    const say = paymentSay(view.payment.reason, org);
    return (
      <>
        {head("Pay for the documents", { text: "Awaiting payment", tone: "warn" })}
        <Card>
          <CardHeader icon={<WalletIcon size={17} />} title={say.title} subtitle={`Started ${view.purchase.startedOn}. Fee ${view.purchase.amount}.`} />
          <CardBody className="flex flex-col gap-3">
            <p className="text-[15px] font-semibold text-ink">{say.instruct}</p>
            <div>
              <ButtonLink href={back} variant="secondary" size="sm">Back to the documents</ButtonLink>
            </div>
          </CardBody>
        </Card>
      </>
    );
  }

  const index = m != null && /^\d{1,2}$/.test(m) ? Number(m) : null;
  const method = index != null ? view.payment.methods[index] ?? null : null;

  // Step 1: choose a method.
  if (!method) {
    return (
      <>
        {head("Pay for the documents", { text: "Awaiting payment", tone: "warn" })}
        <Card>
          <CardHeader icon={<WalletIcon size={17} />} title="Choose how to pay" subtitle={`Fee ${view.purchase.amount}`} />
          <CardBody className="flex flex-col gap-4">
            <Callout tone="warn" title={SIMULATED_LABEL}>
              No money moves. You choose whether it succeeds or fails.
            </Callout>
            {view.purchase.lastFailure && (
              <Callout tone="err" title={`Your last try failed (${view.purchase.lastFailure.method})`}>
                {view.purchase.lastFailure.text}
              </Callout>
            )}
            <ul className="flex flex-col gap-2" aria-label="Payment methods">
              {view.payment.methods.map((name, i) => (
                <li key={name}>
                  <Link href={`/supplier/bids/${id}/pay?m=${i}`} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-[14.5px] font-semibold text-ink hover:border-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
                    <span>{name}</span>
                    <span aria-hidden="true" className="text-brand-700">Choose</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </>
    );
  }

  // Step 2: the simulated provider's page.
  const token = issueFormToken("bids");
  return (
    <>
      {head("Simulated payment page", { text: SIMULATED_LABEL, tone: "warn" })}
      <Card>
        <CardHeader icon={<WalletIcon size={17} />} title={`${method} (simulated)`} />
        <CardBody className="flex flex-col gap-4">
          <Callout tone="warn" title="Simulated payment: no money moves">
            Not a payment to {ctx.org.name}.
          </Callout>
          <KeyValues
            columns={2}
            items={[
              { label: "Paying for", value: ctx.ex.title },
              { label: "Method", value: method },
              { label: "Amount", value: <span className="font-semibold tabular-nums">{view.purchase.amount}</span> },
              { label: "Payer", value: actor.supplierName },
            ]}
          />
          <PayControls exerciseId={id} token={token} method={method} againHref={`/supplier/bids/${id}/pay`} />
          <div>
            <Link href={`/supplier/bids/${id}/pay`}>Choose another method</Link>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
