import { Say } from "@/components/i18n/language-context";
import { CASE_PANEL_TITLE_WORDS as P } from "@/lib/contract/case-page-words";
import Link from "next/link";
import { InboxIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { distributionComplete } from "@/lib/award/distribution";
import { type AwardEvaluation } from "@/lib/award/evaluate";
import { awardFindingText, DELIVERY_LABEL, FIX_AT } from "@/lib/award/labels";
import { type LoadedAward } from "@/lib/award/repo";
import { formatDate } from "@/lib/format";
import { DespatchDrawer } from "@/app/awards/editors";
import { day } from "./shared";


export function DistributionPanel({ l, ev }: { l: LoadedAward; ev: AwardEvaluation }) {
  const { award } = l;
  const rows = award.distributions;
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader icon={<InboxIcon size={17} />} title={<Say words={P.distribution} />} />
        <CardBody>
          {"rows" in ev.distribution ? (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-[13.5px] text-ink-2">
              {ev.distribution.rows.map((r) => (
                <li key={r.recipientName}>{r.isAwardee ? `${r.recipientName} (the awardee)` : r.recipientName}</li>
              ))}
            </ul>
          ) : (
            <Callout tone="warn">
              {awardFindingText({ code: ev.distribution.fault, level: "block" })} {FIX_AT[ev.distribution.fault] && <Link href={FIX_AT[ev.distribution.fault].href}>{FIX_AT[ev.distribution.fault].label}</Link>}
            </Callout>
          )}
        </CardBody>
      </Card>
    );
  }
  const done = distributionComplete(rows);
  const open = award.status === "ISSUED" || award.status === "ACCEPTED";
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<InboxIcon size={17} />} title={<Say words={P.distribution} />} subtitle={done.complete ? "Every mandatory copy has gone." : `${done.sent} of ${done.total} sent`} actions={<Badge tone={done.complete ? "ok" : "warn"}>{done.complete ? "Complete" : "Outstanding"}</Badge>} />
      <ul className="divide-y divide-line/70">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="min-w-0">
              <div className="font-semibold break-words text-ink">
                {r.recipientName} {r.isAwardee && <span className="font-normal text-ink-3">· the awardee</span>} {!r.mandatory && <span className="font-normal text-ink-3">· optional</span>}
              </div>
              <div className="text-[12.5px] break-words text-ink-3">
                {r.despatchedOn
                  ? `${r.method ? DELIVERY_LABEL[r.method] : "Sent"} ${formatDate(r.despatchedOn)}${r.consignmentRef ? ` · ${r.consignmentRef}` : ""} · ${r.acknowledgedOn ? `acknowledged ${formatDate(r.acknowledgedOn)}` : "not acknowledged"}`
                  : "Not sent"}
              </div>
            </div>
            {open && <DespatchDrawer id={award.id} row={{ id: r.id, name: r.recipientName, values: { method: r.method, consignmentRef: r.consignmentRef, despatchedOn: day(r.despatchedOn), acknowledgedOn: day(r.acknowledgedOn), note: r.note } }} />}
          </li>
        ))}
      </ul>
    </Card>
  );
}
