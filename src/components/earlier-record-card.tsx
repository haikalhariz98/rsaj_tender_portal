import type { ReactNode } from "react";

import { FileIcon } from "@/components/icons";
import { Badge, Chip } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { KeyValues } from "@/components/ui/stat";
import type { EarlierFields } from "@/lib/project-docs/earlier-read";
import { outcomeWords } from "@/lib/project-docs/labels";

/**
 * One earlier record of a contract, read only (the simple Project workspace, PW-11): what the contractor sent through the earlier form and how it was answered, as it was
 * stored. The staff's view and the contractor's are this one card; only the staff's carries `answeredBy`, so a contractor's view never names an officer. The body is the same
 * words in both. `action` is the staff's answer, put in by the screen that gates it; none where the record is answered or the reader may not.
 */
export function EarlierRecordCard({ record, label, backHref, action, answeredBy }: { record: EarlierFields; label: string; backHref: string; action?: ReactNode; answeredBy?: string | null }) {
  const returned = record.answerLabel === outcomeWords("RETURNED", null);
  const facts = [
    { label: "Sent", value: record.sentOn },
    ...(record.aboutDay ? [{ label: "About the day", value: record.aboutDay }] : []),
    ...(record.amount ? [{ label: "Amount", value: record.amount }] : []),
    { label: "Sent to", value: record.routedTo ?? "Nobody was assigned" },
    { label: "Due", value: record.dueText },
  ];
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<FileIcon size={17} />}
        title={record.title}
        subtitle={<span className="inline-flex flex-wrap items-center gap-1.5"><Chip>{label}</Chip><Chip>{record.kindLabel}</Chip>{record.signed && <Chip tone="ok">Signed with a password</Chip>}</span>}
        actions={<span className="flex flex-wrap items-center gap-2">{action}<ButtonLink href={backHref} size="sm" variant="ghost">Back to the list</ButtonLink></span>}
      />
      <CardBody className="flex flex-col gap-4">
        <KeyValues columns={3} items={facts} />
        {record.body && <p className="text-[13.5px] break-words whitespace-pre-line text-ink-2">{record.body}</p>}
        {record.lines.length > 0 && (
          <ul className="list-disc pl-5 text-[13px] text-ink-2">
            {record.lines.map((l, n) => (
              <li key={n}>{`${l.description} · ${l.quantity} · ${l.location} · ${l.value}`}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-1 border-t border-line/70 pt-3">
          {record.answerLabel ? (
            <>
              <span className="flex flex-wrap items-center gap-2 text-[13.5px]">
                <Badge tone={returned ? "warn" : "ok"}>{record.answerLabel}</Badge>
                {answeredBy && <span className="font-semibold text-ink">{answeredBy}</span>}
                {record.answeredOn && <span className="text-[12.5px] text-ink-3">{record.answeredOn}</span>}
              </span>
              {record.answerNote && <p className="text-[13.5px] break-words text-ink-2">{record.answerNote}</p>}
            </>
          ) : (
            <span className="text-[13.5px] text-ink-3">Not answered yet</span>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
