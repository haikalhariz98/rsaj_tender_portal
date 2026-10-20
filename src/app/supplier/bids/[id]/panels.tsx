
import { CalendarIcon, CheckIcon, ClipboardIcon, EyeIcon, FileIcon, InboxIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { InfoChip } from "@/components/ui/info-chip";
import { KeyValues } from "@/components/ui/stat";
import type { SupplierActor } from "@/lib/auth/types";
import { SIMULATED_LABEL } from "@/lib/integration/payment-labels";
import { paymentSay } from "@/lib/portal/bids/payment-say";
import { db } from "@/lib/db";
import type { BidContext } from "@/lib/portal/bids/context-store";
import { SUPERSEDED_NOTICE_WORDS } from "@/lib/portal/bids/non-award";
import { addendaTab, briefingsTab, documentsTab, outcomeTab, overviewTab } from "@/lib/portal/bids/workspace-store";

import { AcknowledgeControl, BuyControl, RequestControl, SignUpControl } from "./controls";

/**
 * The tabs of one exercise in My Bids (Phase 4d). Each panel reads only its own slice (`workspace-store.ts`), as the session's supplier, for an exercise it may see. What is not set, not open or not
 * allowed is said in words beside the thing it concerns; a button that cannot be used says why.
 */

type Props = { actor: SupplierActor; ctx: BidContext; token: string | null };

const STATE_TONE = { PASS: "ok", BLOCK: "err", BRING: "warn", INFO: "info", WARN: "warn" } as const;
const STATE_TEXT = { PASS: "Clear", BLOCK: "Stops the request", BRING: "Bring to the counter", INFO: "For your information", WARN: "Act before the closing" } as const;

/// A state with its short reading: a warning is a callout, anything else is a line of text (note 0005 §3.4).
function StandingLine({ tone, headline, detail }: { tone: string; headline: string; detail?: string }) {
  if (tone === "warn" || tone === "err") return <Callout tone={tone === "err" ? "err" : "warn"} title={headline}>{detail}</Callout>;
  return (
    <p className="text-[14px] text-ink">
      <span className="font-semibold">{headline}.</span>{detail ? ` ${detail}` : ""}
    </p>
  );
}

const NOT_EMAILED = "Shown here, not emailed";

export async function OverviewPanel({ actor, ctx }: Omit<Props, "token">) {
  const o = await overviewTab(db, actor, ctx);
  return (
    <div className="flex flex-col gap-6">
      <StandingLine tone={o.standing.tone} headline={o.standing.headline} detail={o.standing.detail} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader icon={<ClipboardIcon size={17} />} title="Where you are" />
          <CardBody>
            {o.todo.length === 0 ? (
              <p className="text-[14px] text-ink-2">Nothing done yet.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {o.todo.map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-[14px] text-ink">
                    <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-brand-600" />
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="The exercise" />
          <CardBody>
            <KeyValues
              items={[
                { label: "Closes", value: o.facts.closing ?? "Not set" },
                { label: "Documents on sale", value: o.facts.saleFrom && o.facts.saleUntil ? `${o.facts.saleFrom} to ${o.facts.saleUntil}` : "Not set" },
                ...(o.facts.online ? [] : [{ label: "Bids are handed in at", value: o.facts.submissionPlace || "Not stated" }]),
                { label: "Open to you as", value: o.facts.via === "PUBLIC" ? "Advertised to everyone" : "Linked by the procurement office" },
                ...(o.facts.parties.length ? [{ label: "Your company is named as", value: o.facts.parties.join(", ") }] : []),
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export async function BriefingsPanel({ actor, ctx, token }: Props) {
  const b = await briefingsTab(db, actor, ctx);
  return (
    <Card>
      <CardHeader icon={<CalendarIcon size={17} />} title="Briefings and site visits" />
      {b.rows.length === 0 ? (
        <EmptyState title="No briefing or site visit" size="sm" />
      ) : (
        <CardBody pad="none">
          <ul className="divide-y divide-line/70">
            {b.rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <p className="text-[14.5px] font-semibold text-ink">{r.kindLabel}</p>
                  <p className="text-[13.5px] text-ink-2">{r.when}</p>
                  <p className="text-[13.5px] text-ink-2">{r.place}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {r.mandatory && <Badge tone="warn">Attend to buy the documents</Badge>}
                    {r.cancelled && <Badge tone="err">Cancelled</Badge>}
                    {r.held && !r.cancelled && <Badge>Held</Badge>}
                    {r.signUp === "SIGNED_UP" && <Badge tone="ok" dot>You are signed up{r.representative ? `: ${r.representative}` : ""}</Badge>}
                    {r.signUp === "EVENT_OVER" && <Badge>{r.representative ? `You were signed up: ${r.representative}` : "You were signed up"}</Badge>}
                    {r.signUp === "WITHDRAWN" && <Badge>Sign-up withdrawn</Badge>}
                    {r.signUp === "EVENT_CANCELLED" && <Badge tone="warn">Signed up, then cancelled</Badge>}
                    {r.attended && <Badge tone="ok" dot>Attended</Badge>}
                    {r.held && !r.attended && r.mandatory && <Badge tone="warn">Not on the register</Badge>}
                  </div>
                </div>
                <div className="shrink-0">
                  {r.signUp === "SIGNED_UP" && r.canWithdraw ? (
                    <SignUpControl exerciseId={ctx.ex.id} eventId={r.id} token={token} what={r.kindLabel.toLowerCase()} mode="withdraw" defaultName={actor.displayName} representative={r.representative} why={null} />
                  ) : r.signUp === "NONE" || r.signUp === "WITHDRAWN" ? (
                    <SignUpControl exerciseId={ctx.ex.id} eventId={r.id} token={token} what={r.kindLabel.toLowerCase()} mode="signup" defaultName={actor.displayName} representative={null} why={r.canSignUp ? null : r.signUpWhy} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      )}
    </Card>
  );
}

export async function AddendaPanel({ actor, ctx, token }: Props) {
  const a = await addendaTab(db, actor, ctx);
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<FileIcon size={17} />} title="Addenda" />
        {a.addenda.length === 0 ? (
          <EmptyState title="No addenda issued" size="sm" />
        ) : (
          <CardBody pad="none">
            <ul className="divide-y divide-line/70">
              {a.addenda.map((x) => (
                <li key={x.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-semibold text-ink">{x.number != null ? `Addendum ${x.number}: ` : ""}{x.title}</p>
                    <p className="text-[12.5px] text-ink-3">{x.issuedOn ? `Issued ${x.issuedOn}` : "Not dated"}{x.newClosing ? ` · New closing ${x.newClosing}` : ""}</p>
                    <p className="mt-1.5 text-[13.5px] whitespace-pre-line text-ink-2">{x.whatChanged}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {x.acknowledgedOn ? <Badge tone="ok" dot>Acknowledged {x.acknowledgedOn}</Badge> : x.holdsCopy ? (x.canAcknowledge ? <Badge tone="warn">Acknowledge it</Badge> : <Badge>Not acknowledged</Badge>) : <Badge>Sent to buyers</Badge>}
                      {x.withDocuments && <Badge>With your documents</Badge>}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {x.acknowledgedOn ? null : <AcknowledgeControl exerciseId={ctx.ex.id} addendumId={x.id} token={token} label={x.number != null ? `addendum ${x.number}` : "this addendum"} why={x.canAcknowledge ? null : x.whyNot} />}
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        )}
      </Card>
      {a.notices.length > 0 && (
        <Card>
          <CardHeader icon={<InboxIcon size={17} />} title="Notices of changes" subtitle={NOT_EMAILED} />
          <CardBody pad="none">
            <ul className="divide-y divide-line/70">
              {a.notices.map((n) => (
                <li key={n.key} className="px-5 py-4 sm:px-6">
                  <p className="text-[14.5px] font-semibold text-ink">{n.title}</p>
                  <p className="text-[12.5px] text-ink-3">{n.on}</p>
                  <p className="mt-1 text-[13.5px] whitespace-pre-line text-ink-2">{n.body}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export async function DocumentsPanel({ actor, ctx, token }: Props) {
  const d = await documentsTab(db, actor, ctx);
  const blocking = d.checks.filter((c) => c.state === "BLOCK");
  const base = `/supplier/bids/${ctx.ex.id}`;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          icon={<FileIcon size={17} />}
          title="The tender documents"
          actions={
            d.online ? (
              d.online.state === "NOT_BOUGHT" ? (
                <BuyControl exerciseId={ctx.ex.id} token={token} why={d.online.canBuy ? null : d.online.whyNot ?? "Cannot be bought now."} payHref={`${base}/pay`} />
              ) : d.online.state === "AWAITING_PAYMENT" ? (
                <ButtonLink href={`${base}/pay`} variant="primary" size="sm" prefetch={false}>Pay for the documents</ButtonLink>
              ) : (
                <ButtonLink href={`${base}/pay`} variant="secondary" size="sm" prefetch={false}>See your receipt</ButtonLink>
              )
            ) : d.bought ? undefined : d.request ? (
              <RequestControl exerciseId={ctx.ex.id} token={token} mode="withdraw" defaultName={actor.displayName} collector={d.request.collector} why={null} />
            ) : (
              <RequestControl exerciseId={ctx.ex.id} token={token} mode="request" defaultName={actor.displayName} collector={null} why={d.canRequest ? null : blocking[0]?.detail ?? "Cannot be asked for now."} />
            )
          }
        />
        <CardBody className="flex flex-col gap-4">
          <KeyValues
            columns={2}
            items={[
              { label: "On sale", value: d.sale.from && d.sale.until ? `${d.sale.from} to ${d.sale.until}` : "Dates not set" },
              { label: "Fee", value: d.sale.fee ?? "Not set" },
              // SR-10 (ruling 16): an exercise sold online has no counter to buy at or pay at.
              ...(d.online
                ? [
                    { label: "How to buy", value: "Online, through this portal" },
                    { label: "How to pay", value: d.online.payment.available ? `On the payment simulator (${SIMULATED_LABEL}), by ${d.online.payment.methods.join(", ")}` : paymentSay(d.online.payment.reason, d.online.payment.organisation).how },
                  ]
                : [
                    { label: "Buy them at", value: d.sale.place || "Not stated" },
                    { label: "How to pay", value: d.sale.payment || "Not stated" },
                  ]),
            ]}
          />
          {d.online?.state === "AWAITING_PAYMENT" && (
            <Callout tone="warn" title="Payment pending">
              {paymentSay(d.online.payment.reason, d.online.payment.organisation).instruct}
              {d.online.purchase?.lastFailure && ` Last try by ${d.online.purchase.lastFailure.method} failed.`}
            </Callout>
          )}
          {d.online?.state === "PAID" && d.online.purchase?.paid && (
            <p className="flex flex-wrap items-center gap-2 text-[13.5px] text-ink-2">
              <span className="font-semibold text-ink">Paid</span> {d.online.purchase.paid.on}, {d.online.purchase.paid.amount}.
              {d.online.purchase.paid.channel === "SIMULATED" ? <><InfoChip tone="warn" detail={`Simulated payment by ${d.online.purchase.paid.method}, reference ${d.online.purchase.paid.reference}. No money moved. Not a receipt of ${ctx.org.name}.`}>Demo</InfoChip><span>No money moved.</span></> : <span>{d.online.purchase.paid.channelWords}.</span>}
            </p>
          )}
          {d.bought && !d.online && (
            <p className="flex flex-wrap items-center gap-2 text-[13.5px] text-ink-2">
              <span className="font-semibold text-ink">Sold</span> {d.bought.on}.
              <Badge tone={d.bought.receiptRecorded ? "ok" : "warn"}>{d.bought.receiptRecorded ? "Payment recorded" : "Payment not recorded"}</Badge>
            </p>
          )}
          {!d.bought && !d.online && d.request && (
            <p className="text-[13.5px] text-ink-2">
              <span className="font-semibold text-ink">Requested</span> {d.request.requestedOn}. {d.request.collector} will collect them.
            </p>
          )}
          {!d.bought && !d.online && !d.request && d.refused && (
            <Callout tone="err" title={`Your last request was refused on ${d.refused.on}`}>
              <ul className="list-disc pl-5">{d.refused.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            </Callout>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<ClipboardIcon size={17} />} title="Checks before sale" />
        <CardBody pad="none">
          {(d.online?.checks ?? d.checks).length === 0 ? (
            <EmptyState title="Sale dates not set" size="sm" action={<span className="text-[13px] text-ink-2">Tell the procurement office.</span>} />
          ) : (
            <ul className="divide-y divide-line/70">
              {(d.online?.checks ?? d.checks).map((c) => (
                <li key={c.key} className="flex flex-col gap-1.5 px-5 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-6">
                  <p className="min-w-0 text-[13.5px] text-ink-2">{c.detail}</p>
                  <Badge tone={STATE_TONE[c.state]} className="shrink-0 self-start">{STATE_TEXT[c.state]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<EyeIcon size={17} />}
          title="Inspect the Tender Table Document"
          subtitle="Each opening is logged"
          actions={d.table.open ? <ButtonLink href={`${base}/table-document`} variant="secondary" size="sm" prefetch={false}>Open it</ButtonLink> : undefined}
        />
        <CardBody>
          {d.table.open ? (
            <p className="text-[13.5px] text-ink-2">{d.online ? "Drawings and other files come with the documents you buy." : "Drawings and other files are inspected at the counter."}</p>
          ) : (
            <StandingLine tone="neutral" headline={d.table.headline} detail={d.table.detail} />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<FileIcon size={17} />}
          title="Your copy of the documents online"
          actions={d.release.state === "READY" ? <ButtonLink href={`${base}/documents`} variant="primary" size="sm" prefetch={false}>Open the documents</ButtonLink> : undefined}
        />
        <CardBody>
          {d.online && d.release.state === "NO_SALE" ? (
            <StandingLine tone="neutral" headline="Not bought yet" detail="Buy the documents above." />
          ) : (
            <StandingLine tone="neutral" headline={d.release.short} detail={d.release.detail} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export async function OutcomePanel({ actor, ctx }: Omit<Props, "token">) {
  const o = await outcomeTab(db, actor, ctx);
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<CheckIcon size={17} />} title="Where your bid stands" subtitle="Only your own bid" />
        <CardBody className="flex flex-col gap-3">
          <StandingLine tone={o.standing.tone} headline={o.standing.headline} detail={o.standing.detail} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader icon={<InboxIcon size={17} />} title="Notice of the outcome" subtitle={NOT_EMAILED} />
        <CardBody>
          {o.notice ? (
            <div className="flex flex-col gap-2">
              <p className="text-[12.5px] text-ink-3">Issued {o.notice.on}</p>
              <p className="text-[14px] text-ink">{o.notice.outcomeText}</p>
              {o.notice.reasonText && <p className="text-[14px] whitespace-pre-line text-ink-2"><span className="font-semibold">Reason given: </span>{o.notice.reasonText}</p>}
            </div>
          ) : o.supersededNotice ? (
            <p className="text-[14px] text-ink-2">{SUPERSEDED_NOTICE_WORDS} It was issued {o.supersededNotice.on}.</p>
          ) : o.awardIssuedElsewhere && o.inResults ? (
            <p className="text-[14px] text-ink-2">No notice issued to your company.</p>
          ) : o.awardIssuedElsewhere ? (
            <p className="text-[14px] text-ink-2">No notice issued to your company.</p>
          ) : (
            <p className="text-[14px] text-ink-2">No notice issued.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
