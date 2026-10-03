import Link from "next/link";

import { DataList } from "@/components/data-list";
import { ClockIcon, FilesIcon, InboxIcon, RouteIcon } from "@/components/icons";
import { Tabs } from "@/components/tabs";
import { ButtonLink, Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { KIND_WORDS } from "@/lib/certificate/labels";
import { copyState, DISTRIBUTION_PAGE, LIBRARY_PAGE, SHEETS_PAGE } from "@/lib/certificate/library";
import { fidelityLine } from "@/lib/certificate/printed";
import { distributionPage, libraryPage, routingSheetsPage } from "@/lib/certificate/register";
import { COPY_STATE_WORDS, REGISTER_WORDS as W, SOURCE_WORDS } from "@/lib/certificate/register-words";
import { verdictText } from "@/lib/certificate/sheet-words";
import { dayOf } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { ORGANISATION_CODE } from "@/lib/org";

export const dynamic = "force-dynamic";

const TAB_IDS = ["library", "distribution", "routing", "review"] as const;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const lang = (ls: readonly ("EN" | "MS")[]) => [...new Set(ls)].sort((a, b) => (a === "MS" ? -1 : b === "MS" ? 1 : 0)).map((l) => (l === "MS" ? "Malay" : "English")).join(" and ");

/**
 * The documents register (6.14 increment 2, plan §5, OD-6 A): the Library of generated documents, the copies still
 * outstanding, and the routing sheets still open. Every count above a list is the whole register's, and every list
 * pages in the database. The review queue of contractors' submissions needs the contractor to sign in: it arrives
 * with the vendor portal, and the tab says so (the rulings' condition) rather than promising it here.
 */
export default async function DocumentsPage(props: PageProps<"/documents">) {
  const sp = (await props.searchParams) as { tab?: string; q?: string; page?: string };
  const tab = TAB_IDS.find((t) => t === sp.tab) ?? "library";
  const query = (sp.q ?? "").slice(0, 200);
  const org = await db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true, timeZone: true } });
  if (!org) {
    return (
      <>
        <PageHeader title={W.title.en} subtitle={W.subtitle.en} />
        <Callout tone="warn" title="No organisation is configured">Run npm run setup first.</Callout>
      </>
    );
  }
  const today = dayOf(new Date(), org.timeZone);
  // Each tab's list is read only when it is the one asked for; its count is read for the strip.
  const [library, distribution, sheets] = await Promise.all([
    libraryPage(org.id, tab === "library" ? query : "", tab === "library" ? sp.page : undefined, org.timeZone),
    distributionPage(org.id, tab === "distribution" ? sp.page : undefined),
    today ? routingSheetsPage(org.id, tab === "routing" ? sp.page : undefined, today) : Promise.resolve(null),
  ]);
  const pager = (t: string, page: number, total: number, size: number, extra = "") => {
    const pages = Math.ceil(total / size);
    if (pages <= 1) return null;
    return (
      <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
        <span>{`${page * size + 1}–${Math.min(total, (page + 1) * size)} of ${total}.`}</span>
        <span className="flex gap-2">
          {page > 0 && <ButtonLink href={`/documents?tab=${t}${extra}&page=${page}`} size="sm" variant="ghost">Previous</ButtonLink>}
          {page + 1 < pages && <ButtonLink href={`/documents?tab=${t}${extra}&page=${page + 2}`} size="sm" variant="ghost">Next</ButtonLink>}
        </span>
      </CardFooter>
    );
  };
  const q = query.trim() ? `&q=${encodeURIComponent(query.trim())}` : "";

  const libraryPanel = (
    <Card className="overflow-hidden">
      <CardHeader icon={<FilesIcon size={17} />} title={W.library.en} subtitle={W.libraryBlurb.en} divided />
      <CardBody>
        <form action="/documents" method="get" className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input type="hidden" name="tab" value="library" />
          <label htmlFor="register-search" className="sr-only">{W.searchLabel.en}</label>
          <div className="min-w-0 flex-1">
            <Input id="register-search" name="q" defaultValue={query} placeholder={W.searchPlaceholder.en} />
          </div>
          <span className="flex gap-2">
            <Button type="submit" size="sm" variant="primary">{W.searchButton.en}</Button>
            {query.trim() && <ButtonLink href="/documents?tab=library" size="sm" variant="ghost">{W.clearSearch.en}</ButtonLink>}
          </span>
        </form>
        {query.trim() && (
          <p className="mt-2 text-[12.5px] break-words text-ink-3">
            {`${plural(library.total, "document matches", "documents match")}${library.variants.length > 1 ? `, searching also for ${library.variants.slice(1).map((v) => `"${v}"`).join(", ")} (the same term's other wordings)` : ""}.`}
          </p>
        )}
      </CardBody>
      <DataList
        flat
        selectable={false}
        searchable={false}
        exportName="documents-library"
        emptyTitle={query.trim() ? W.libraryNoMatch.en : W.libraryEmpty.en}
        emptyBody={query.trim() ? `Nothing in the register matches "${query.trim()}".` : W.libraryEmptyBody.en}
        stackBelow="xl"
        columns={[
          { key: "document", label: "Document", mobile: "primary" },
          { key: "of", label: "Of", width: "230px", mobile: "meta" },
          { key: "form", label: "Form", width: "260px", mobile: "meta" },
          { key: "issued", label: "Issued", width: "130px", mobile: "meta" },
          { key: "copies", label: "Copies", width: "190px", mobile: "meta" },
        ]}
        rows={library.rows.map((r) => ({
          id: r.id,
          search: "",
          cells: {
            document: { kind: "link", text: r.number ? `${r.kindEn} ${r.number}` : r.kindEn, href: r.href, sub: `${SOURCE_WORDS[r.source].en} · ${lang(r.languages)}` },
            of: { kind: "text", text: r.ofEn },
            form: { kind: "text", text: fidelityLine({ name: r.form.name, formCode: r.form.formCode, revisionDate: r.form.revisionDate, pageCount: null, bodyVersion: r.form.version }, 0).en.replace(/ · page count not recorded/, "") },
            issued: { kind: "text", text: r.issuedOn ? formatDate(r.issuedOn) : "Day not judged: the time zone is not set", dim: !r.issuedOn },
            copies: { kind: "text", text: !r.copies ? "On the award's Distribution tab" : r.copies.total === 0 ? "No copies" : r.copies.notSent ? `${r.copies.notSent} of ${r.copies.total} not sent` : r.copies.ackAwaited ? `Sent · ${plural(r.copies.ackAwaited, "acknowledgement", "acknowledgements")} awaited` : `All ${r.copies.total} sent`, dim: !r.copies },
          },
        }))}
      />
      {pager("library", library.page, library.total, LIBRARY_PAGE, q)}
    </Card>
  );

  const distributionPanel = (
    <Card className="overflow-hidden">
      <CardHeader icon={<InboxIcon size={17} />} title={W.distribution.en} subtitle={W.distributionBlurb.en} divided={distribution.total === 0} />
      <DataList
        flat
        selectable={false}
        searchable={false}
        exportName="documents-distribution"
        emptyTitle={W.distributionEmpty.en}
        emptyBody={W.distributionEmptyBody.en}
        stackBelow="xl"
        columns={[
          { key: "copy", label: "Copy", mobile: "primary" },
          { key: "certificate", label: "Certificate", width: "280px", mobile: "meta" },
          { key: "state", label: "Where it stands", width: "230px", mobile: "meta" },
        ]}
        rows={distribution.rows.map((c) => {
          const state = copyState(c);
          return {
            id: c.id,
            search: "",
            cells: {
              copy: { kind: "stack", title: `${c.copyNo}. ${c.recipientName}`, sub: [`Addressed to ${c.addressedTo}`, c.isOriginal ? "the original" : null, c.mandatory ? "mandatory" : "optional"].filter(Boolean).join(" · ") },
              certificate: { kind: "link", text: `${KIND_WORDS[c.kind].en}${c.sequence ? ` ${c.sequence}` : ""} ${c.number ?? ""}`.trim(), href: `/projects/${c.contractId}/certificates/${c.certId}?tab=distribution`, sub: `Contract ${c.contractNumber}${c.issuedOn ? ` · issued ${formatDate(c.issuedOn)}` : ""}` },
              state: { kind: "badge", text: state === "ACK_AWAITED" && c.despatchedOn ? `${COPY_STATE_WORDS[state].en} (sent ${formatDate(c.despatchedOn)})` : COPY_STATE_WORDS[state].en, tone: state === "NOT_SENT" && c.mandatory ? "warn" : "info" },
            },
          };
        })}
      />
      {pager("distribution", distribution.page, distribution.total, DISTRIBUTION_PAGE)}
    </Card>
  );

  const routingPanel = !sheets ? (
    <Callout tone="warn" title="The organisation's time zone is not set">{W.sheetsNoZone.en}</Callout>
  ) : (
    <Card className="overflow-hidden">
      <CardHeader icon={<RouteIcon size={17} />} title={W.sheets.en} subtitle={W.sheetsBlurb.en} divided={sheets.total === 0} />
      <DataList
        flat
        selectable={false}
        searchable={false}
        exportName="documents-routing-sheets"
        emptyTitle={W.sheetsEmpty.en}
        emptyBody={W.sheetsEmptyBody.en}
        stackBelow="xl"
        columns={[
          { key: "certificate", label: "Certificate", mobile: "primary" },
          { key: "sheet", label: "Sheet", width: "220px", mobile: "meta" },
          { key: "received", label: "Received", width: "130px", mobile: "meta" },
          { key: "verdict", label: "Elapsed against the target", width: "320px", mobile: "meta" },
        ]}
        rows={sheets.rows.map(({ c, sheet }) => ({
          id: c.id,
          search: "",
          cells: {
            certificate: { kind: "link", text: KIND_WORDS[c.kind].en, href: `/projects/${c.contract.id}/certificates/${c.id}?tab=routing`, sub: `Contract ${c.contract.number}${sheet.iterations.length > 1 ? ` · resubmission ${sheet.iterations.length - 1}` : ""}` },
            sheet: { kind: "text", text: sheet.type.labelEn },
            received: { kind: "text", text: sheet.date1 ? formatDate(sheet.date1) : "Not recorded", dim: !sheet.date1 },
            verdict: { kind: "text", text: verdictText(sheet) },
          },
        }))}
      />
      {pager("routing", sheets.page, sheets.total, SHEETS_PAGE)}
    </Card>
  );

  const reviewPanel = (
    <Callout tone="info" title={W.reviewTitle.en}>
      {`${W.reviewBody.en} `}
      <Link href="/configuration/documents" className="font-semibold">Configuration › Documents</Link>.
    </Callout>
  );

  return (
    <>
      <PageHeader
        title={W.title.en}
        subtitle={W.subtitle.en}
        meta={[
          query.trim() && tab === "library" ? plural(library.total, "document matches the search", "documents match the search") : plural(library.total, "document in the library", "documents in the library"),
          `${plural(distribution.counts.notSent, "copy not sent", "copies not sent")} (${distribution.counts.notSentMandatory} mandatory)`,
          plural(distribution.counts.ackAwaited, "acknowledgement awaited", "acknowledgements awaited"),
          sheets ? `${plural(sheets.counts.open, "routing sheet open", "routing sheets open")} (${sheets.counts.overTarget} past the target, ${sheets.counts.notJudged} not judged)` : "Routing sheets not judged: the time zone is not set",
        ]}
      />
      {sheets && sheets.counts.overTarget > 0 && (
        <div className="mb-6">
          <Callout tone="warn" title={plural(sheets.counts.overTarget, "routing sheet is past its target", "routing sheets are past their target")}>
            Received and not yet approved, they have run longer than the target their type sets. They are listed first on Routing sheets.
          </Callout>
        </div>
      )}
      <Tabs
        initial={tab}
        label={W.title.en}
        tabs={[
          { id: "library", label: W.library.en, icon: <FilesIcon size={15} />, count: library.total, panel: libraryPanel },
          { id: "distribution", label: W.distribution.en, icon: <InboxIcon size={15} />, count: distribution.total, panel: distributionPanel },
          { id: "routing", label: W.sheets.en, icon: <RouteIcon size={15} />, count: sheets?.total, panel: routingPanel },
          { id: "review", label: W.review.en, icon: <ClockIcon size={15} />, panel: reviewPanel },
        ]}
      />
    </>
  );
}
