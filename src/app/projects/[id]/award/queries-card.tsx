import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToneNote } from "@/components/ui/feedback";
import { canAnswer } from "@/lib/award/online-return-view";
import type { LoadedAward } from "@/lib/award/repo";
import { formatOrgDay } from "@/lib/format";
import { AnswerQueryDrawer } from "@/app/awards/editors";

/// The contractor's questions on the award (ADR 0045 D3), oldest first. Each is answered once, in any status of the award. Nothing is drawn when none was asked.
export function QueriesCard({ l, nobodyTold }: { l: LoadedAward; nobodyTold: string | null }) {
  const rows = l.award.queries;
  if (rows.length === 0) return null;
  const tz = l.org.timeZone;
  return (
    <Card>
      <CardHeader title="Questions" subtitle={`${rows.filter((q) => !q.answeredAt).length} unanswered`} />
      <CardBody className="flex flex-col gap-4">
        {nobodyTold && <ToneNote tone="warn">{nobodyTold}</ToneNote>}
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((q) => (
            <li key={q.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="max-w-prose whitespace-pre-line text-[13.5px] text-ink">{q.body}</p>
                {canAnswer(q) ? <AnswerQueryDrawer id={q.id} question={q.body} /> : <Badge tone="ok">Answered</Badge>}
              </div>
              <p className="text-[12.5px] text-ink-3">{`${q.askedBySupplierAccount.contact.name}, ${formatOrgDay(q.askedAt, tz)}`}</p>
              {q.answer && (
                <p className="max-w-prose whitespace-pre-line border-l-2 border-line pl-3 text-[13.5px] text-ink-2">
                  {q.answer}
                  <span className="mt-1 block text-[12.5px] text-ink-3">{`${q.answeredBy?.name ?? "An officer"}, ${formatOrgDay(q.answeredAt, tz)}`}</span>
                </p>
              )}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
