import Link from "next/link";
import { notFound } from "next/navigation";

import { CalendarIcon, ClipboardIcon, FileIcon, ShieldIcon, WalletIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { KeyValues } from "@/components/ui/stat";
import {
  DETAIL,
  METHOD_NOT_STATED,
  OPPORTUNITY_STATE,
  PORTAL_PATH,
  SALE_STATE,
  SITE_EVENT_KIND_WORDS,
  RESULTS,
  STATE_BANNER,
} from "@/lib/portal/labels";
import type { PublicDetail } from "@/lib/portal/public";
import { loadOpportunity } from "@/lib/portal/repo";

import { NoticeDrawer } from "./notice-drawer";
import { YourEligibility } from "./your-eligibility";
import { YourPart } from "./your-part";

export const dynamic = "force-dynamic";

const NOT_STATED = DETAIL.notStated.en;
const or = (text: string) => (text.trim() ? text : NOT_STATED);

/**
 * One advertised opportunity, in the public's words. The page can only render what
 * `toPublicOpportunity` returned: a missing, invited, unpublished or confidential exercise is
 * not found, and the answer is the same for all of them.
 */
export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await loadOpportunity(id);
  if (!o) notFound();

  const state = OPPORTUNITY_STATE[o.state];
  const banner = o.state === "OPEN" ? null : STATE_BANNER[o.state];
  const d = o.detail;

  return (
    <>
      <RecordCrumb label={o.reference} />
      <PageHeader
        eyebrow={<Link href={PORTAL_PATH.opportunities}>{DETAIL.back.en}</Link>}
        title={o.title}
        badge={<Badge tone={state.tone ?? "neutral"}>{state.label.en}</Badge>}
        subtitle={`${o.reference} · ${o.method || METHOD_NOT_STATED.en}`}
        meta={o.closing && o.state === "OPEN" ? [DETAIL.closingFact(o.closing).en] : undefined}
        actions={
          d ? (
            <NoticeDrawer
              title={DETAIL.notice.en}
              subtitle={`${o.reference} · ${o.title}`}
              buttonLabel={DETAIL.readNotice.en}
              text={d.notice}
              empty={DETAIL.noNotice.en}
            />
          ) : undefined
        }
      />

      {banner && (
        <Callout
          tone={o.state === "CANCELLED" ? "warn" : "info"}
          title={banner.title.en}
          className="mb-6"
          action={o.state === "AWARDED" ? <ButtonLink href={PORTAL_PATH.results} variant="secondary" size="sm">{RESULTS.viewResults.en}</ButtonLink> : undefined}
        >
          {banner.text(o.cancelledOn).en}
        </Callout>
      )}

      {o.state === "OPEN" && d && <YourEligibility exerciseId={o.id} />}
      {d && <YourPart exerciseId={o.id} />}

      {d ? <Body o={o} d={d} /> : <Glance o={o} />}
    </>
  );
}

function Glance({ o }: { o: NonNullable<Awaited<ReturnType<typeof loadOpportunity>>> }) {
  return (
    <Card>
      <CardHeader icon={<ClipboardIcon size={17} />} title={DETAIL.atAGlance.en} />
      <CardBody>
        <KeyValues
          columns={2}
          items={[
            { label: DETAIL.reference.en, value: o.reference },
            { label: DETAIL.method.en, value: o.method || METHOD_NOT_STATED.en },
          ]}
        />
      </CardBody>
    </Card>
  );
}

function Body({ o, d }: { o: NonNullable<Awaited<ReturnType<typeof loadOpportunity>>>; d: PublicDetail }) {
  const sale = d.sale.state === "UNKNOWN" ? null : SALE_STATE[d.sale.state];
  const days = d.sale.from && d.sale.until ? DETAIL.saleDays(d.sale.from, d.sale.until).en : null;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader icon={<ClipboardIcon size={17} />} title={DETAIL.atAGlance.en} subtitle={DETAIL.paperOnly.en} />
        <CardBody>
          <KeyValues
            columns={1}
            items={[
              { label: DETAIL.reference.en, value: o.reference },
              { label: DETAIL.method.en, value: o.method || METHOD_NOT_STATED.en },
              { label: DETAIL.closing.en, value: <span className="font-semibold">{o.closing}</span> },
              { label: DETAIL.submissionPlace.en, value: or(d.sale.submissionPlace) },
            ]}
          />
          {o.state === "OPEN" && <p className="mt-4 text-[13px] text-ink-3">{DETAIL.closingNote.en}</p>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<WalletIcon size={17} />} title={DETAIL.documents.en} subtitle={DETAIL.documentsSubtitle.en} actions={sale ? <Badge tone={d.sale.state === "OPEN" ? "brand" : "neutral"}>{sale.en}</Badge> : undefined} />
        <CardBody>
          <KeyValues
            columns={1}
            items={[
              { label: DETAIL.fee.en, value: d.sale.fee ?? DETAIL.feeNotStated.en },
              { label: DETAIL.onSale.en, value: days ?? NOT_STATED },
              { label: DETAIL.buyAt.en, value: or(d.sale.place) },
              { label: DETAIL.payBy.en, value: or(d.sale.payment) },
              { label: DETAIL.inspect.en, value: or(d.sale.inspectionPlace) },
              { label: DETAIL.hours.en, value: or(d.sale.inspectionHours) },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<CalendarIcon size={17} />} title={DETAIL.briefings.en} subtitle={DETAIL.briefingsSubtitle.en} />
        <CardBody>
          {d.events.length === 0 ? (
            <p className="text-[13.5px] text-ink-3">{DETAIL.noBriefings.en}</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {d.events.map((e, i) => (
                <li key={i} className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-ink">{SITE_EVENT_KIND_WORDS[e.kind].en}</span>
                    {e.cancelled ? <Badge tone="warn">{DETAIL.cancelledEvent.en}</Badge> : e.mandatory ? <Badge tone="err">{DETAIL.mandatory.en}</Badge> : null}
                  </div>
                  <span className={e.cancelled ? "text-[13.5px] text-ink-3 line-through" : "text-[13.5px] text-ink-2"}>
                    {e.when} · {e.place}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<ShieldIcon size={17} />} title={DETAIL.whoMayBid.en} subtitle={DETAIL.whoMayBidSubtitle.en} />
        <CardBody className="flex flex-col gap-4">
          {d.restriction && (
            <Callout tone="warn" title={DETAIL.restrictionTitle.en}>
              {d.restriction.label ?? DETAIL.restrictionFallback.en}
            </Callout>
          )}
          {d.registrations.length === 0 ? (
            <p className="text-[13.5px] text-ink-3">{DETAIL.noRegistrations.en}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[12px] font-semibold text-ink-3">{DETAIL.holdIntro.en}</p>
              <ul className="flex flex-col gap-3">
                {d.registrations.map((group, i) => (
                  <li key={i} className="rounded-xl bg-sunken px-4 py-3 text-[14px] text-ink">
                    {group.length > 1 && <span className="mb-1 block text-[12px] font-semibold text-ink-3">{DETAIL.holdOneOf.en}</span>}
                    <ul className="flex flex-col gap-1">
                      {group.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader icon={<FileIcon size={17} />} title={DETAIL.addenda.en} subtitle={DETAIL.addendaSubtitle.en} />
        <CardBody>
          {d.addenda.length === 0 ? (
            <p className="text-[13.5px] text-ink-3">{DETAIL.noAddenda.en}</p>
          ) : (
            <ol className="flex flex-col gap-5">
              {d.addenda.map((a, i) => (
                <li key={i} className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-ink">
                      {DETAIL.addendumNumber(a.number).en}: {a.title}
                    </span>
                    {a.issuedOn && <span className="text-[12.5px] text-ink-3">{DETAIL.issuedOn(a.issuedOn).en}</span>}
                  </div>
                  <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink-2">{a.whatChanged}</p>
                  {a.newClosing && <p className="text-[13.5px] font-semibold text-ink">{DETAIL.newClosing(a.newClosing).en}</p>}
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
