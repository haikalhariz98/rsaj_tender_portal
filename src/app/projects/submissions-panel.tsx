import Link from "next/link";

import { AnswerDrawer } from "@/app/documents/review-editors";
import { DataList } from "@/components/data-list";
import { ClockIcon, InboxIcon } from "@/components/icons";
import { Badge, Chip } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { OUTCOME_TONE, OUTCOME_WORDS, ROUTING_STATEMENT, SERVICE_NOT_SET, serviceWords, SUBMISSION_KIND_WORDS } from "@/lib/portal/projects/labels";
import { REVIEW_PAGE, type ReviewQueue } from "@/lib/portal/projects/review-store";

/**
 * Contractors' submissions waiting for an answer, and those answered (FR-SUP-006, 009; AC-16): the body of the Contracts list's "Submissions waiting" view and of each contract's Submissions
 * tab, so the two read and answer alike. `hrefOf` builds the address of a page of either list from the two page numbers (1-based, 0 for the first). Overdue is judged only where the
 * organisation's day is known: with `judged` false the text says it is not judged and a count is never shown as 0.
 */
export function SubmissionsPanel({ review, judged, hrefOf, withContract }: { review: ReviewQueue; judged: boolean; hrefOf: (waiting: number, answered: number) => string; withContract: boolean }) {
  const w = review.waiting;
  const a = review.answered;
  const overdueText = !judged ? ", overdue is not judged because the organisation's time zone is not set" : review.overdue ? `, ${review.overdue} of them past the due day` : "";
  const pager = (page: number, total: number, hrefFor: (p: number) => string, note = "") => {
    const pages = Math.ceil(total / REVIEW_PAGE);
    if (pages <= 1) return null;
    return (
      <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
        <span>{`${page * REVIEW_PAGE + 1}–${Math.min(total, (page + 1) * REVIEW_PAGE)} of ${total}.${note}`}</span>
        <span className="flex gap-2">
          {page > 0 && <ButtonLink href={hrefFor(page)} size="sm" variant="ghost">Previous</ButtonLink>}
          {page + 1 < pages && <ButtonLink href={hrefFor(page + 2)} size="sm" variant="ghost">Next</ButtonLink>}
        </span>
      </CardFooter>
    );
  };
  const askedA = a.page ? a.page + 1 : 0;
  const askedW = w.page ? w.page + 1 : 0;
  return (
    <div className="flex flex-col gap-6">
      {review.unsetKinds.length > 0 && (
        <Callout tone="warn" title={`${SERVICE_NOT_SET.en} for ${review.unsetKinds.length === 6 ? "every kind" : review.unsetKinds.map((k) => SUBMISSION_KIND_WORDS[k].en.toLowerCase()).join(", ")}`}>
          {"A submission of a kind with no service level shows no due day and is never judged overdue. Set each under "}
          <Link href="/configuration/post-award" className="font-semibold">Configuration › Post-award controls</Link>.
        </Callout>
      )}
      <Card className="overflow-hidden">
        <CardHeader icon={<ClockIcon size={17} />} title="Submissions waiting" subtitle={`Submissions contractors sent from their portal accounts, waiting for an answer, the longest waiting first${overdueText}. ${ROUTING_STATEMENT} The S.O. office's holders, or a representative whose letter lists contractor communication, answer each.`} divided={w.total > 0} />
        {w.total === 0 ? (
          <EmptyState size="sm" title="Nothing waits for an answer">A contractor&apos;s programme, claim, materials list, delay notice, defects report or notice that the statutory declaration is lodged appears here when it is sent.</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {w.rows.map((r) => {
              const sv = serviceWords(r.service);
              return (
                <li key={r.id} className="flex flex-col gap-2 px-5 py-4 sm:px-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold text-ink">
                        {withContract ? <Link href={`/projects/${r.contractId}?tab=submissions`} className="hover:underline">{`Contract ${r.contractNumber}`}</Link> : null}
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
        {pager(w.page, w.total, (p) => hrefOf(p, askedA))}
      </Card>
      <Card className="overflow-hidden">
        <CardHeader icon={<InboxIcon size={17} />} title="Answered" subtitle="Every submission answered, the latest sent first, with who answered it and whether it was answered by its due day." divided={false} />
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
            { key: "submission", label: "Submission", mobile: "primary" },
            ...(withContract ? [{ key: "contract", label: "Contract", width: "200px", mobile: "meta" as const }] : []),
            { key: "answer", label: "Answer", width: "150px", mobile: "meta" },
            { key: "service", label: "Against the service level", width: "210px", mobile: "meta" },
            { key: "by", label: "Answered by", width: "160px", mobile: "meta", hideBelow: "2xl" },
          ]}
          rows={a.rows.map((r) => ({
            id: r.id,
            search: `${r.contractNumber} ${r.contractor} ${r.title} ${SUBMISSION_KIND_WORDS[r.kind].en}`,
            sortKeys: { submission: r.sentDay },
            cells: {
              submission: { kind: "stack", title: r.title, sub: `${SUBMISSION_KIND_WORDS[r.kind].en} · sent ${r.sentOn}` },
              contract: { kind: "link", text: `Contract ${r.contractNumber}`, href: `/projects/${r.contractId}?tab=submissions`, sub: r.contractor },
              answer: { kind: "badge", text: `${OUTCOME_WORDS[r.outcome!].en}${r.decidedOn ? ` ${r.decidedOn}` : ""}`, tone: OUTCOME_TONE[r.outcome!] },
              service: { kind: "text", text: serviceWords(r.service).text },
              by: { kind: "text", text: r.decidedBy ?? "" },
            },
          }))}
        />
        {pager(a.page, a.total, (p) => hrefOf(askedW, p), " Search and sort look within this page.")}
      </Card>
    </div>
  );
}
