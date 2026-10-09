import Link from "next/link";

import { DataList } from "@/components/data-list";
import { Badge, Chip } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
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
import { distributionCounts, distributionPage, libraryCount, libraryPage, openSheetsJudged, routingSheetsPage, sheetsCounted } from "@/lib/certificate/register";
import { COPY_STATE_WORDS, REGISTER_WORDS as W, SOURCE_WORDS } from "@/lib/certificate/register-words";
import { verdictText } from "@/lib/certificate/sheet-words";
import { dayOf } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { OUTCOME_TONE, OUTCOME_WORDS, ROUTING_STATEMENT, SERVICE_NOT_SET, serviceWords, SUBMISSION_KIND_WORDS } from "@/lib/portal/projects/labels";
import { loadReviewQueue } from "@/lib/portal/projects/review-store";

import { AnswerDrawer } from "./review-editors";
import { requireStaff } from "@/app/_auth/actor";
import { hiddenExercises } from "@/app/_auth/sulit";

export const dynamic = "force-dynamic";

const TAB_IDS = ["library", "distribution", "routing", "review"] as const;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const lang = (ls: readonly ("EN" | "MS")[]) => [...new Set(ls)].sort((a, b) => (a === "MS" ? -1 : b === "MS" ? 1 : 0)).map((l) => (l === "MS" ? "Malay" : "English")).join(" and ");

/**
 * The documents register (6.14 increment 2, plan §5, OD-6 A): the Library of generated documents, the copies still
 * outstanding, and the routing sheets still open. Every count above a list is the whole register's, and every list
 * pages in the database. The review queue (Phase 4e, 6.14 OD-6, BD-614-31): the submissions contractors send from their
 * portal accounts, each routed to the contract's S.O. office against the service level set for its kind, answered here.
 */
export default async function DocumentsPage(props: PageProps<"/documents">) {
  const actor = await requireStaff();
  const sp = (await props.searchParams) as { tab?: string; q?: string; page?: string };
  const tab = TAB_IDS.find((t) => t === sp.tab) ?? "library";
  const query = (sp.q ?? "").slice(0, 200);
  const org = await db.organisation.findUnique({ where: { code: actor.organisationCode }, select: { id: true, timeZone: true } });
  if (!org) {
    return (
      <>
        <PageHeader title={W.title.en} subtitle={W.subtitle.en} />
        <Callout tone="warn" title="No organisation is configured">Run npm run setup first.</Callout>
      </>
    );
  }
  const today = dayOf(new Date(), org.timeZone);
  // Code review M-3: only the tab asked for reads its list; the strip's and the header's counts are count queries.
  // Residual S-1: the open sheets are judged whole on every tab (a slim select), for the header and the warning;
  // the Routing sheets tab pages that same set. Residual consider: with no search the Library's page reuses its count.
  // FR-MTD-007: the award documents of a restricted exercise's awards are not in a Library, a count or a search of someone not named on it.
  const hidden = await hiddenExercises(actor);
  const whole = libraryCount(org.id, [], hidden);
  const [libraryTotal, dist, sheetCount, judged, library, distribution] = await Promise.all([
    whole,
    distributionCounts(org.id),
    sheetsCounted(org.id),
    today ? openSheetsJudged(org.id, today) : Promise.resolve(null),
    tab === "library" ? whole.then((t) => libraryPage(org.id, query, sp.page, org.timeZone, hidden, t)) : Promise.resolve(null),
    tab === "distribution" ? distributionPage(org.id, sp.page) : Promise.resolve(null),
  ]);
  // Phase 4e: the review queue reads only when it is the tab asked for.
  const review = tab === "review" ? await loadReviewQueue(db, org.id, today) : null;
  const sheets = tab === "routing" && judged ? routingSheetsPage(judged, sp.page) : null;
  const searching = tab === "library" && !!library && query.trim() !== "";
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

  const libraryPanel = library && (
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
          { key: "document", label: "Document", mobile: "primary", minWidth: "260px" },
          { key: "of", label: "Of", width: "200px", mobile: "meta" },
          { key: "form", label: "Form", width: "200px", mobile: "meta" },
          { key: "issued", label: "Issued", width: "120px", mobile: "meta" },
          { key: "copies", label: "Copies", width: "170px", mobile: "meta", hideBelow: "2xl" },
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

  const distributionPanel = distribution && (
    <Card className="overflow-hidden">
      <CardHeader icon={<InboxIcon size={17} />} title={W.distribution.en} subtitle={`${W.distributionBlurb.en}${distribution.counts.onCancelled ? ` ${plural(distribution.counts.onCancelled, "copy", "copies")} on cancelled contracts ${distribution.counts.onCancelled === 1 ? "is" : "are"} ${W.onCancelled.en}` : ""}`} divided={distribution.total === 0} />
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
          { key: "state", label: "Status", width: "230px", mobile: "meta" },
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

  const routingPanel = tab !== "routing" ? null : !sheets ? (
    <Callout tone="warn" title="The organisation's time zone is not set">{W.sheetsNoZone.en}</Callout>
  ) : (
    <Card className="overflow-hidden">
      <CardHeader icon={<RouteIcon size={17} />} title={W.sheets.en} subtitle={`${W.sheetsBlurb.en}${sheetCount.onCancelled ? ` ${plural(sheetCount.onCancelled, "sheet", "sheets")} on cancelled contracts ${sheetCount.onCancelled === 1 ? "is" : "are"} ${W.onCancelled.en}` : ""} ${sheets.counts.overTarget} past the target, ${sheets.counts.notJudged} not judged.`} divided={sheets.total === 0} />
      <DataList
        flat
        selectable={false}
        searchable={false}
        exportName="documents-routing-sheets"
        emptyTitle={W.sheetsEmpty.en}
        emptyBody={W.sheetsEmptyBody.en}
        stackBelow="xl"
        columns={[
          { key: "certificate", label: "Certificate", mobile: "primary", minWidth: "240px" },
          { key: "sheet", label: "Sheet", width: "200px", mobile: "meta" },
          { key: "received", label: "Received", width: "130px", mobile: "meta" },
          { key: "verdict", label: "Elapsed against the target", width: "300px", mobile: "meta" },
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

  const reviewPanel = review && (
    <div className="flex flex-col gap-6">
      {review.unsetKinds.length > 0 && (
        <Callout tone="warn" title={`${SERVICE_NOT_SET.en} for ${review.unsetKinds.length === 6 ? "every kind" : review.unsetKinds.map((k) => SUBMISSION_KIND_WORDS[k].en.toLowerCase()).join(", ")}`}>
          {"A submission of a kind with no service level shows no due day and is never judged overdue. Set each under "}
          <Link href="/configuration/post-award" className="font-semibold">Configuration › Post-award controls</Link>.
        </Callout>
      )}
      <Card className="overflow-hidden">
        <CardHeader icon={<ClockIcon size={17} />} title={W.review.en} subtitle={`Submissions contractors sent from their portal accounts, waiting for an answer, the longest waiting first. ${ROUTING_STATEMENT} The S.O. office's holders, or a representative whose letter lists contractor communication, answer each.`} divided={review.waiting > 0} />
        {review.waiting === 0 ? (
          <EmptyState size="sm" title="Nothing waits for an answer">A contractor&apos;s programme, claim, materials list, delay notice, defects report or statutory declaration appears here when it is sent.</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {review.rows.filter((r) => r.outcome == null).map((r) => {
              const sv = serviceWords(r.service);
              return (
                <li key={r.id} className="flex flex-col gap-2 px-5 py-4 sm:px-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold text-ink">
                        <Link href={`/projects/${r.contractId}`} className="hover:underline">{`Contract ${r.contractNumber}`}</Link>
                        <Chip tone="brand">{SUBMISSION_KIND_WORDS[r.kind].en}</Chip>
                        {r.signed && <Chip tone="ok">Signed with the contractor&apos;s password</Chip>}
                      </span>
                      <span className="block text-[13.5px] text-ink">{r.title}</span>
                      <span className="block text-[12.5px] text-ink-3">{[r.contractor, `sent ${r.sentOn}`, r.amount ? `claimed ${r.amount}` : null, r.aboutDay ? `day ${r.aboutDay}` : null, r.routedTo ? `routed to ${r.routedTo}` : "routed to nobody: no Superintending Officer was assigned"].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center gap-2">
                      <Badge tone={sv.tone === "neutral" ? undefined : sv.tone}>{sv.text}</Badge>
                      <AnswerDrawer id={r.id} label={`${SUBMISSION_KIND_WORDS[r.kind].en}: ${r.title}`} contractor={r.contractor} />
                    </span>
                  </div>
                  <p className="text-[13.5px] break-words whitespace-pre-line text-ink-2">{r.body}</p>
                  {r.lines.length > 0 && (
                    <ul className="list-disc pl-5 text-[13px] text-ink-2">
                      {r.lines.map((l, n) => (
                        <li key={n}>{`${l.description} · ${l.quantity} · ${l.location} · ${l.value}`}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card className="overflow-hidden">
        <CardHeader icon={<InboxIcon size={17} />} title="Answered" subtitle="Every submission answered, with who answered it and whether it was answered by its due day." divided={false} />
        <DataList
          flat
          selectable={false}
          searchable
          exportName="contractor-submissions-answered"
          searchPlaceholder="Search by contract, contractor or title"
          emptyTitle="Nothing answered yet"
          emptyBody="An answered submission is listed here."
          stackBelow="xl"
          columns={[
            { key: "submission", label: "Submission", mobile: "primary", minWidth: "260px" },
            { key: "contract", label: "Contract", width: "220px", mobile: "meta" },
            { key: "answer", label: "Answer", width: "170px", mobile: "meta" },
            { key: "service", label: "Against the service level", width: "260px", mobile: "meta" },
            { key: "by", label: "Answered by", width: "200px", mobile: "meta" },
          ]}
          rows={review.rows.filter((r) => r.outcome != null).map((r) => ({
            id: r.id,
            search: `${r.contractNumber} ${r.contractor} ${r.title} ${SUBMISSION_KIND_WORDS[r.kind].en}`,
            sortKeys: { submission: r.sentDay },
            cells: {
              submission: { kind: "stack", title: r.title, sub: `${SUBMISSION_KIND_WORDS[r.kind].en} · sent ${r.sentOn}` },
              contract: { kind: "link", text: `Contract ${r.contractNumber}`, href: `/projects/${r.contractId}`, sub: r.contractor },
              answer: { kind: "badge", text: `${OUTCOME_WORDS[r.outcome!].en}${r.decidedOn ? ` ${r.decidedOn}` : ""}`, tone: OUTCOME_TONE[r.outcome!] },
              service: { kind: "text", text: serviceWords(r.service).text },
              by: { kind: "text", text: r.decidedBy ?? "" },
            },
          }))}
        />
      </Card>
    </div>
  );

  return (
    <>
      <PageHeader
        title={W.title.en}
        subtitle={W.subtitle.en}
        meta={[
          plural(libraryTotal, "document in the library", "documents in the library"),
          `${plural(dist.notSent, "copy not sent", "copies not sent")} (${dist.notSentMandatory} mandatory)`,
          plural(dist.ackAwaited, "acknowledgement awaited", "acknowledgements awaited"),
          judged ? `${plural(judged.counts.open, "routing sheet open", "routing sheets open")} (${judged.counts.overTarget} past the target, ${judged.counts.notJudged} not judged)` : `${plural(sheetCount.open, "routing sheet open", "routing sheets open")} (not judged: the time zone is not set)`,
        ]}
      />
      {judged && judged.counts.overTarget > 0 && (
        <div className="mb-6">
          <Callout tone="warn" title={plural(judged.counts.overTarget, "routing sheet is past its target", "routing sheets are past their target")}>
            Received and not yet approved, they have run longer than the target their type sets. They are on Routing sheets, longest open first.
          </Callout>
        </div>
      )}
      <Tabs
        initial={tab}
        label={W.title.en}
        tabs={[
          { id: "library", label: W.library.en, icon: <FilesIcon size={15} />, count: searching ? library!.total : libraryTotal, panel: libraryPanel, lazy: true },
          { id: "distribution", label: W.distribution.en, icon: <InboxIcon size={15} />, count: dist.total, panel: distributionPanel, lazy: true },
          { id: "routing", label: W.sheets.en, icon: <RouteIcon size={15} />, count: judged?.counts.open ?? sheetCount.open, panel: routingPanel, lazy: true },
          { id: "review", label: W.review.en, icon: <ClockIcon size={15} />, count: review?.waiting, panel: tab === "review" ? reviewPanel : null, lazy: true },
        ]}
      />
    </>
  );
}
