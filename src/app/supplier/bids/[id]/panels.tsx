import Link from "next/link";

import { CalendarIcon, CheckIcon, ClipboardIcon, EyeIcon, FileIcon, InboxIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { KeyValues } from "@/components/ui/stat";
import type { SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import type { BidContext } from "@/lib/portal/bids/context-store";
import { SUPERSEDED_NOTICE_WORDS } from "@/lib/portal/bids/non-award";
import { NOTICE_DELIVERY_STATEMENT } from "@/lib/portal/bids/notices";
import { addendaTab, briefingsTab, documentsTab, outcomeTab, overviewTab } from "@/lib/portal/bids/workspace-store";

import { AcknowledgeControl, RequestControl, SignUpControl } from "./controls";

/**
 * The tabs of one exercise in My Bids (Phase 4d). Each panel reads only its own slice (`workspace-store.ts`), as the session's supplier, for an exercise it may see. What is not set, not open or not
 * allowed is said in words beside the thing it concerns; a button that cannot be used says why.
 */

type Props = { actor: SupplierActor; ctx: BidContext; token: string | null };

const STATE_TONE = { PASS: "ok", BLOCK: "err", BRING: "warn", INFO: "info" } as const;
const STATE_TEXT = { PASS: "Clear", BLOCK: "Stops the request", BRING: "Bring to the counter", INFO: "For your information" } as const;

export async function OverviewPanel({ actor, ctx }: Omit<Props, "token">) {
  const o = await overviewTab(db, actor, ctx);
  return (
    <div className="flex flex-col gap-6">
      <Callout tone={o.standing.tone === "warn" ? "warn" : o.standing.tone === "ok" ? "ok" : o.standing.tone === "neutral" ? "neutral" : "info"} title={o.standing.headline}>
        {o.standing.detail}
      </Callout>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader icon={<ClipboardIcon size={17} />} title="Where you are" subtitle="What you have done on this exercise, and what comes next." />
          <CardBody>
            {o.todo.length === 0 ? (
              <p className="text-[14px] text-ink-2">You have done nothing on this exercise yet, and nothing waits for you.</p>
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
                { label: "Bids are handed in at", value: o.facts.submissionPlace || "Not stated" },
                { label: "You can open it because", value: o.facts.via === "PUBLIC" ? "It is advertised to everyone." : "The procurement office has linked your company to it." },
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
      <CardHeader icon={<CalendarIcon size={17} />} title="Briefings and site visits" subtitle="Sign up so the office expects you. Attendance itself is recorded by an officer on the day." />
      {b.rows.length === 0 ? (
        <EmptyState title="No briefing or site visit is scheduled" size="sm">The notice for this exercise names none. If one is added it appears here.</EmptyState>
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
                    {r.mandatory && <Badge tone="warn">The notice makes attendance a condition of buying the documents</Badge>}
                    {r.cancelled && <Badge tone="err">Cancelled</Badge>}
                    {r.held && !r.cancelled && <Badge>Held</Badge>}
                    {r.signUp === "SIGNED_UP" && <Badge tone="ok" dot>You are signed up{r.representative ? `: ${r.representative}` : ""}</Badge>}
                    {r.signUp === "EVENT_OVER" && <Badge>{r.representative ? `You were signed up: ${r.representative}` : "You were signed up"}</Badge>}
                    {r.signUp === "WITHDRAWN" && <Badge>You withdrew your sign-up</Badge>}
                    {r.signUp === "EVENT_CANCELLED" && <Badge tone="warn">You were signed up, and it was cancelled</Badge>}
                    {r.attended && <Badge tone="ok" dot>The office recorded you as attending</Badge>}
                    {r.held && !r.attended && r.mandatory && <Badge tone="warn">You are not on the attendance register</Badge>}
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
        <CardHeader icon={<FileIcon size={17} />} title="Addenda" subtitle="Changes to the documents, in the order they were issued. Acknowledge the ones sent to you." />
        {a.addenda.length === 0 ? (
          <EmptyState title="No addendum has been issued" size="sm">If the office changes the documents, the change is issued as an addendum and listed here.</EmptyState>
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
                      {x.acknowledgedOn ? <Badge tone="ok" dot>You acknowledged it on {x.acknowledgedOn}</Badge> : x.holdsCopy ? (x.canAcknowledge ? <Badge tone="warn">Waiting for you to acknowledge it</Badge> : <Badge>You did not acknowledge it</Badge>) : <Badge>Sent to the companies that bought the documents</Badge>}
                      {x.withDocuments && <Badge>It came with your documents</Badge>}
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
          <CardHeader icon={<InboxIcon size={17} />} title="Notices of changes" subtitle={NOTICE_DELIVERY_STATEMENT} />
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
          subtitle="Bought from the procurement office. Ask here, and an officer sells them to you and records the payment."
          actions={
            d.bought ? undefined : d.request ? (
              <RequestControl exerciseId={ctx.ex.id} token={token} mode="withdraw" defaultName={actor.displayName} collector={d.request.collector} why={null} />
            ) : (
              <RequestControl exerciseId={ctx.ex.id} token={token} mode="request" defaultName={actor.displayName} collector={null} why={d.canRequest ? null : blocking[0]?.detail ?? "The documents cannot be asked for at the moment."} />
            )
          }
        />
        <CardBody className="flex flex-col gap-4">
          <KeyValues
            columns={2}
            items={[
              { label: "On sale", value: d.sale.from && d.sale.until ? `${d.sale.from} to ${d.sale.until}` : "Dates not set" },
              { label: "Fee", value: d.sale.fee ?? "Not set" },
              { label: "Buy them at", value: d.sale.place || "Not stated" },
              { label: "How to pay", value: d.sale.payment || "Not stated" },
            ]}
          />
          {d.bought && (
            <Callout tone="ok" title="The documents were sold to your company">
              Sold on {d.bought.on}. {d.bought.receiptRecorded ? "The office has recorded your payment." : "The office has not recorded your payment receipt yet."}
            </Callout>
          )}
          {!d.bought && d.request && (
            <Callout tone="info" title="You have asked for the documents">
              Requested on {d.request.requestedOn}; {d.request.collector} will collect them. Nothing is sold until an officer records the sale.
            </Callout>
          )}
          {!d.bought && !d.request && d.refused && (
            <Callout tone="err" title={`Your last request was refused on ${d.refused.on}`}>
              <ul className="list-disc pl-5">{d.refused.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            </Callout>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<ClipboardIcon size={17} />} title="Checks before the documents are sold" subtitle="The office makes the same checks at the counter. Items marked for the counter are checked there by an officer." />
        <CardBody pad="none">
          {d.checks.length === 0 ? (
            <EmptyState title="The checks cannot be made yet" size="sm">The dates of this exercise are not complete. Tell the procurement office.</EmptyState>
          ) : (
            <ul className="divide-y divide-line/70">
              {d.checks.map((c) => (
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
          subtitle="Open to every supplier from publication to the closing. Each time you open it, it is logged against your company."
          actions={d.table.open ? <ButtonLink href={`${base}/table-document`} variant="secondary" size="sm" prefetch={false}>Open it</ButtonLink> : undefined}
        />
        <CardBody>
          {d.table.open ? (
            <p className="text-[13.5px] text-ink-2">This is the part of the documents the notice puts on the tender table. Drawings and other files are bound in separately and are inspected at the counter.</p>
          ) : (
            <Callout tone="neutral" title={d.table.headline}>{d.table.detail}</Callout>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<FileIcon size={17} />}
          title="Your copy of the documents online"
          subtitle="Released only when the organisation has chosen to, after an officer records your payment."
          actions={d.release.state === "READY" ? <ButtonLink href={`${base}/documents`} variant="primary" size="sm" prefetch={false}>Open the documents</ButtonLink> : undefined}
        />
        <CardBody>
          <Callout tone={d.release.state === "READY" ? "ok" : "neutral"} title={d.release.short}>{d.release.detail}</Callout>
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
        <CardHeader icon={<CheckIcon size={17} />} title="Where your bid stands" subtitle="Only your own bid, and only how far the exercise has got." />
        <CardBody className="flex flex-col gap-3">
          <Callout tone={o.standing.tone === "warn" ? "warn" : o.standing.tone === "ok" ? "ok" : o.standing.tone === "neutral" ? "neutral" : "info"} title={o.standing.headline}>
            {o.standing.detail}
          </Callout>
          <p className="text-[12.5px] text-ink-3">This portal does not take bids and shows no price, score or rank. Other companies&apos; bids are never shown.</p>
        </CardBody>
      </Card>
      <Card>
        <CardHeader icon={<InboxIcon size={17} />} title="Notice of the outcome" subtitle={NOTICE_DELIVERY_STATEMENT} />
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
            <p className="text-[14px] text-ink-2">The procurement office has not issued your company a notice of the outcome. The award is published under <Link href="/supplier/results">Results</Link>.</p>
          ) : o.awardIssuedElsewhere ? (
            <p className="text-[14px] text-ink-2">The procurement office has not issued your company a notice of the outcome.</p>
          ) : (
            <p className="text-[14px] text-ink-2">No notice of the outcome has been issued. One is only issued to a company whose bid did not win, after the award.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
