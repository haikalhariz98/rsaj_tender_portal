import Link from "next/link";

import { ClipboardIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { CUTOFF_NOT_SET, DATES_LOCKED_TEXT, NO_EVENTS_TEXT, proposedDatesOf, type KeyDatesView } from "@/lib/method/key-dates";
import type { LoadedExercise } from "@/lib/method/repo";

import { EditDetailsDrawer } from "../../editors";
import { Row } from "../documents/conditions";
import { KeyDatesDrawer } from "./prep-editors";

type Option = { value: string; label: string };

/**
 * Key dates & person in charge, the second section of Scope and estimate (Sourcing Requirements v2, SR-05, ruling 8). The start and closing
 * are proposed here, before the documents are submitted, and read "Proposed" until the approving step records them. The person in charge
 * and the exercise's requester are shown beside them. Words only, from `keyDatesView`; every act is the shared drawer.
 */
export function KeyDatesSection({ l, keyDates: k, people, detailsBlocker, timeZone, usualClosingTime }: { l: LoadedExercise; keyDates: KeyDatesView; people: Option[]; detailsBlocker: string | null; timeZone: string | null; usualClosingTime: string | null }) {
  const ex = l.ex;
  const dateValue = (d: { state: string; label: string | null; text: string }) =>
    d.label ? (
      <span>
        <span className="font-semibold">{d.label}</span> {d.text}
      </span>
    ) : (
      <span className="text-ink-3">{d.text}</span>
    );
  const pic = ex.personInCharge;
  const open = ex.status === "DRAFT" || ex.status === "DOCUMENTS_IN_PREPARATION";
  const stored = proposedDatesOf(ex, timeZone);
  const edit = open ? ({ allowed: true } as const) : ({ allowed: false, reason: DATES_LOCKED_TEXT } as const);
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<ClipboardIcon size={17} />} title="Key dates & person in charge" subtitle="Start, closing and officer." />
      <CardBody>
        <ul className="divide-y divide-line/70 rounded-2xl border border-line">
          {k.start.state === "NOT_APPLICABLE" ? (
            <Row title="Tendering window" value={<span className="text-ink-3">{k.start.text}</span>}>
              <span className="text-[12.5px] text-ink-3">No tender documents, so no dates to set.</span>
            </Row>
          ) : (
            <>
              <Row title="Tendering starts" value={dateValue(k.start)} action={k.start.state === "APPROVED" ? undefined : <KeyDatesDrawer exerciseId={ex.id} allowed={edit} values={{ startOn: stored.startOn ?? "", closingDay: stored.closingDay ?? "", closingTime: stored.closingTime ?? "" }} usualClosingTime={usualClosingTime} />} />
              <Row title="Closing" value={dateValue(k.closing)}>
                <span className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
                  Organisation&apos;s usual closing time:{" "}
                  {k.cutoff.text ? (
                    <>
                      <span className="text-ink-2">{k.cutoff.text}</span>
                      <ProvenanceBadge value={k.cutoff.provenance} />
                    </>
                  ) : (
                    <>
                      <Badge tone="warn">{CUTOFF_NOT_SET}</Badge>
                      <Link href="/configuration/invitation">Set it under Invitation controls</Link>
                    </>
                  )}
                </span>
                {!open && k.closing.state === "PROPOSED" && <span className="text-[12.5px] text-ink-3">{DATES_LOCKED_TEXT}</span>}
              </Row>
              <Row title="Briefing and site visits">
                {k.events.length === 0 ? (
                  <span className="text-[13px] text-ink-2">
                    {NO_EVENTS_TEXT}
                    {k.canSchedule && (
                      <>
                        . <Link href={`/sourcing/${ex.id}?tab=scope&section=briefing`}>Schedule one under Briefing and site visit</Link>
                      </>
                    )}
                  </span>
                ) : (
                  <ul className="flex flex-col gap-1 text-[13.5px] text-ink">
                    {k.events.map((e) => (
                      <li key={e.id} className="break-words">
                        {e.text}
                      </li>
                    ))}
                  </ul>
                )}
              </Row>
            </>
          )}
          <Row
            title="Person in charge"
            value={pic ? <span className="break-words">{pic.isActive ? pic.name : `${pic.name} (no longer active)`}</span> : <Badge tone="warn">Not recorded</Badge>}
            action={<EditDetailsDrawer id={ex.id} people={people} personInChargeId={ex.personInChargeId} workCode={ex.workCode} blocker={detailsBlocker} what="person in charge" />}
          />
          <Row title="Requested by" value={<span className="break-words">{l.req.requestingPerson?.name ?? "Not recorded"}</span>}>
            <span className="text-[12.5px] text-ink-3">Requester, not necessarily the officer in charge.</span>
          </Row>
        </ul>
      </CardBody>
    </Card>
  );
}
