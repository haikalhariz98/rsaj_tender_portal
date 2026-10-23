import Link from "next/link";

import { AnswerDrawer } from "@/app/documents/review-editors";
import { DataList } from "@/components/data-list";
import { ClockIcon, InboxIcon } from "@/components/icons";
import { Badge, Chip } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { InfoChip } from "@/components/ui/info-chip";
import type { Language } from "@/lib/i18n/language";
import { say, sayWith } from "@/lib/i18n/say";
import { SUBMISSIONS_WORDS as S } from "@/lib/contract/case-page-words";
import type { Words } from "@/lib/contract/labels";
import { OUTCOME_TONE, OUTCOME_WORDS, serviceWords, SUBMISSION_KIND_WORDS } from "@/lib/portal/projects/labels";
import { REVIEW_PAGE, type ReviewQueue } from "@/lib/portal/projects/review-store";

/**
 * Contractors' submissions waiting for an answer, and those answered (FR-SUP-006, 009; AC-16): the body of the Contracts list's "Submissions waiting" view and of each contract's Submissions
 * tab, so the two read and answer alike. `hrefOf` builds the address of a page of either list from the two page numbers (1-based, 0 for the first). Overdue is judged only where the
 * organisation's day is known: with `judged` false the text says it is not judged and a count is never shown as 0.
 */
export function SubmissionsPanel({ review, judged, hrefOf, withContract, lang = "en" }: { review: ReviewQueue; judged: boolean; hrefOf: (waiting: number, answered: number) => string; withContract: boolean; lang?: Language }) {
  const t = (words: Words) => say(words, lang);
  const w = review.waiting;
  const a = review.answered;
  const overdueText = !judged ? t(S.overdueUnjudged) : review.overdue ? sayWith(S.overduePast, lang, { count: String(review.overdue) }) : "";
  const pager = (page: number, total: number, hrefFor: (p: number) => string, note = "") => {
    const pages = Math.ceil(total / REVIEW_PAGE);
    if (pages <= 1) return null;
    return (
      <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
        <span>{sayWith(S.rangeOf, lang, { from: String(page * REVIEW_PAGE + 1), to: String(Math.min(total, (page + 1) * REVIEW_PAGE)), total: String(total), note })}</span>
        <span className="flex gap-2">
          {page > 0 && <ButtonLink href={hrefFor(page)} size="sm" variant="ghost">{t(S.previous)}</ButtonLink>}
          {page + 1 < pages && <ButtonLink href={hrefFor(page + 2)} size="sm" variant="ghost">{t(S.next)}</ButtonLink>}
        </span>
      </CardFooter>
    );
  };
  const askedA = a.page ? a.page + 1 : 0;
  const askedW = w.page ? w.page + 1 : 0;
  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <CardHeader icon={<ClockIcon size={17} />} title={t(S.waitingTitle)} subtitle={<span className="inline-flex flex-wrap items-center gap-1.5">{sayWith(S.waitingSubtitle, lang, { overdue: overdueText })}<InfoChip outline detail={t(S.routingStatement)}>{t(S.notEmailed)}</InfoChip></span>} divided={w.total > 0} />
        {w.total === 0 ? (
          <EmptyState size="sm" title={t(S.nothingWaits)} />
        ) : (
          <ul className="divide-y divide-line/70">
            {w.rows.map((r) => {
              const sv = serviceWords(r.service, lang);
              return (
                <li key={r.id} className="flex flex-col gap-2 px-5 py-4 sm:px-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold text-ink">
                        {withContract ? <Link href={`/projects/${r.contractId}?tab=submissions`} className="hover:underline">{sayWith(S.contractNumber, lang, { number: r.contractNumber })}</Link> : null}
                        <Chip tone="brand">{t(SUBMISSION_KIND_WORDS[r.kind])}</Chip>
                        {r.signed && <Chip tone="ok">{t(S.signedWithPassword)}</Chip>}
                      </span>
                      <span className="block text-[13.5px] text-ink">{r.title}</span>
                      <span className="block text-[12.5px] text-ink-3">{[r.contractor, sayWith(S.sentOn, lang, { date: r.sentOn }), r.amount ? sayWith(S.claimed, lang, { amount: r.amount }) : null, r.aboutDay ? sayWith(S.aboutDay, lang, { day: r.aboutDay }) : null, r.routedTo ? sayWith(S.routedTo, lang, { office: r.routedTo }) : t(S.routedToNobody)].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center gap-2">
                      <Badge tone={sv.tone === "neutral" ? undefined : sv.tone}>{sv.text}</Badge>
                      <AnswerDrawer id={r.id} label={`${t(SUBMISSION_KIND_WORDS[r.kind])}: ${r.title}`} contractor={r.contractor} lang={lang} />
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
        {pager(w.page, w.total, (p) => hrefOf(p, askedA))}
      </Card>
      <Card className="overflow-hidden">
        <CardHeader icon={<InboxIcon size={17} />} title={t(S.answered)} subtitle={t(S.answeredSubtitle)} divided={false} />
        <DataList
          flat
          selectable={false}
          searchable
          exportName="contractor-submissions-answered"
          searchPlaceholder={t(S.searchAnswered)}
          emptyTitle={t(S.nothingAnswered)}
          stackBelow="xl"
          columns={[
            { key: "submission", label: t(S.colSubmission), mobile: "primary" },
            ...(withContract ? [{ key: "contract", label: t(S.colContract), width: "200px", mobile: "meta" as const }] : []),
            { key: "answer", label: t(S.colAnswer), width: "150px", mobile: "meta" },
            { key: "service", label: t(S.colService), width: "210px", mobile: "meta" },
            { key: "by", label: t(S.colBy), width: "160px", mobile: "meta", hideBelow: "2xl" },
          ]}
          rows={a.rows.map((r) => ({
            id: r.id,
            search: `${r.contractNumber} ${r.contractor} ${r.title} ${t(SUBMISSION_KIND_WORDS[r.kind])}`,
            sortKeys: { submission: r.sentDay },
            cells: {
              submission: { kind: "stack", title: r.title, sub: sayWith(S.kindSent, lang, { kind: t(SUBMISSION_KIND_WORDS[r.kind]), date: r.sentOn }) },
              contract: { kind: "link", text: sayWith(S.contractNumber, lang, { number: r.contractNumber }), href: `/projects/${r.contractId}?tab=submissions`, sub: r.contractor },
              answer: { kind: "badge", text: `${t(OUTCOME_WORDS[r.outcome!])}${r.decidedOn ? ` ${r.decidedOn}` : ""}`, tone: OUTCOME_TONE[r.outcome!] },
              service: { kind: "text", text: serviceWords(r.service, lang).text },
              by: { kind: "text", text: r.decidedBy ?? "" },
            },
          }))}
        />
        {pager(a.page, a.total, (p) => hrefOf(askedW, p), t(S.searchLooksInPage))}
      </Card>
    </div>
  );
}
