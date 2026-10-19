import type { ReactNode } from "react";

import { OwnerAttachments } from "@/components/attachments/owner-attachments";
import { UsersIcon } from "@/components/icons";
import { Badge, Chip } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { CellStack, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import type { briefingTab } from "@/lib/window/read";
import { isPublished } from "@/lib/window/phase";
import type { ExerciseStatus } from "@/lib/method/types";

import { CancelEventDrawer, MarkHeldDrawer, RecordAttendanceDrawer, ScheduleEventDrawer, SetMandatoryDrawer } from "./editors";
import type { WindowContext } from "./window-section";

type Briefing = NonNullable<Awaited<ReturnType<typeof briefingTab>>>;

export function briefingHeader(d: Briefing, c: WindowContext): { actions: ReactNode; notes: [string, string][] } {
  return {
    actions: <ScheduleEventDrawer exerciseId={c.exerciseId} allowed={d.schedule} mandatoryOffered={d.mandatoryOffered} />,
    notes: d.schedule.allowed ? [] : [["Schedule an event", d.schedule.reason]],
  };
}

/**
 * The Briefing section (FR-ADV-013): each tender briefing or site visit, whether attendance is
 * mandatory (said as the organisation's setting allows: where mandatory attendance is not set,
 * no event is mandatory and no sale is refused for it), whether it was held, and who attended.
 * The register exports as CSV, and the signed sheet is kept with the exercise's documents.
 */
export function BriefingSection({ d, c }: { d: Briefing; c: WindowContext }) {
  const published = isPublished(c.status as ExerciseStatus);
  const invited = d.pathKey === "INVITED";
  const people = c.people;
  const sheet = d.events.length > 0 && (
    <OwnerAttachments owner={{ kind: "exercise", id: c.exerciseId }} only={["ATTENDANCE_SHEET"]} title="Attendance sheets" subtitle="Signed sheet per briefing or visit" />
  );
  if (d.events.length === 0) {
    return (
      <Card>
        <EmptyState size="sm" title="No briefing or site visit">
          {d.schedule.allowed ? "None scheduled" : "None scheduled. Add on Scope and estimate."}
        </EmptyState>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {!d.mandatoryOffered && (
        <Callout tone="warn" title="Attendance not mandatory">
          Not permitted or not set under Invitation controls. No sale is refused for missing one.
        </Callout>
      )}
      {d.events.map((e) => {
        const cancelled = !!e.cancelled;
        const label = e.kind;
        const options = d.parties.filter((p) => !invited || p.invited).filter((p) => !e.register.some((r) => r.registrationNo === p.registrationNo)).map((p) => ({ value: p.id, label: `${p.name} (${p.registrationNo})` }));
        return (
          <Card key={e.id} className="overflow-hidden">
            <CardHeader
              icon={<UsersIcon size={17} />}
              title={`${label}, ${e.starts}`}
              subtitle={e.place}
              actions={
                <span className="flex flex-wrap items-center gap-2">
                  {cancelled ? <Badge tone="neutral">Cancelled</Badge> : e.held ? <Badge tone="ok">{`Held ${e.held}`}</Badge> : <Badge tone="info">Not held yet</Badge>}
                  {!cancelled && <ButtonLink href={`/sourcing/${c.exerciseId}/briefing/${e.id}/attendance`} variant="ghost" size="sm" prefetch={false}>Attendance register (CSV)</ButtonLink>}
                </span>
              }
            />
            <div className="flex flex-col gap-3 border-b border-line px-5 py-3 sm:px-6">
              <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
                <Chip tone={e.attendance.startsWith("Mandatory") ? "brand" : e.attendance === "Not answered" ? "warn" : "neutral"}>{e.attendance}</Chip>
                {e.attendance === "Not answered" && <span className="text-[12.5px] text-ink-3">Answer it before the window can be published.</span>}
              </div>
              {cancelled && <Callout tone="neutral">{e.cancelled}. {published ? "Tell purchasers by addendum." : ""}</Callout>}
              {!cancelled && (
                <div className="flex flex-wrap items-center gap-2">
                  {d.schedule.allowed && d.mandatoryOffered && <SetMandatoryDrawer exerciseId={c.exerciseId} eventId={e.id} label={label} current={e.attendance === "Not answered" ? "unset" : e.attendance.startsWith("Mandatory") ? "yes" : "no"} />}
                  {!e.held && published && <MarkHeldDrawer exerciseId={c.exerciseId} eventId={e.id} label={label} today={c.today} />}
                  {!e.held && !published && <span className="text-[12.5px] text-ink-3">Held is recorded after publishing.</span>}
                  {e.held && <RecordAttendanceDrawer exerciseId={c.exerciseId} eventId={e.id} label={label} parties={options} invited={invited} people={people} />}
                  {!e.held && <CancelEventDrawer exerciseId={c.exerciseId} eventId={e.id} label={label} published={published} />}
                </div>
              )}
            </div>
            {e.signUps.length > 0 && (
              <div className="border-b border-line px-5 py-3 sm:px-6">
                <p className="text-[13px] font-semibold text-ink">Signed up online</p>
                <p className="text-[12.5px] text-ink-3">Planned attendees. Not attendance.</p>
                <ul className="mt-2 flex flex-col gap-1 text-[13px] text-ink-2">
                  {e.signUps.map((s) => (
                    <li key={`${s.supplier}-${s.at}`} className={s.withdrawn ? "text-ink-3 line-through" : undefined}>
                      {s.supplier}: {s.representative} <span className="text-ink-3">· signed up {s.at}{s.withdrawn ? `, withdrawn ${s.withdrawn}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {e.register.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-ink-3 sm:px-6">{e.held ? "Nobody is recorded as attending." : cancelled ? "No attendance is kept for a cancelled event." : "Attendance is recorded once the event is held."}</p>
            ) : (
              <Table minWidth={640}>
                <colgroup>
                  <col />
                  <col style={{ width: "26%" }} />
                  <col style={{ width: "30%" }} />
                </colgroup>
                <THead>
                  <Th>Contractor</Th>
                  <Th>Representative</Th>
                  <Th>Recorded</Th>
                </THead>
                <tbody>
                  {e.register.map((r) => (
                    <Tr key={r.registrationNo}>
                      <Td label="Contractor"><CellStack title={r.contractor} sub={r.registrationNo} /></Td>
                      <Td label="Representative">{r.representative}</Td>
                      <Td label="Recorded"><CellStack title={r.recordedOn} sub={r.recordedBy} /></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        );
      })}
      {sheet}
    </div>
  );
}
