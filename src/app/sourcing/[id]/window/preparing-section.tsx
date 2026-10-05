import { UsersIcon } from "@/components/icons";
import { Badge, Chip } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import type { briefingTab, WindowTab } from "@/lib/window/read";

import { CancelEventDrawer, ScheduleEventDrawer, SetMandatoryDrawer } from "./editors";
import { WindowItemsCard, type WindowContext } from "./window-section";

type Briefing = NonNullable<Awaited<ReturnType<typeof briefingTab>>>;

/**
 * The Invitation tab while the documents are still in preparation or awaiting approval for tendering
 * (founder, 2026-10-05): the window's items and the briefings and site visits can be prepared now (the
 * server allows both from preparation), so they are shown with their acts. Publishing opens once the
 * documents are approved, and the callout says so. The four sections, the closing and the settings
 * the window is judged by appear from approval for tendering.
 */
export function PreparingSection({ w, b, c }: { w: WindowTab; b: Briefing; c: WindowContext }) {
  // An event belongs to the window, which is saved first; the server refuses it otherwise.
  const schedule = b.schedule.allowed && !w.hasWindow ? { allowed: false as const, reason: "Prepare the window's items first: an event is added to the window." } : b.schedule;
  return (
    <div className="flex flex-col gap-6">
      <Callout tone="info" title="Publishing opens once the documents are approved for tendering">
        Until then the window&apos;s items and any briefing or site visit can be prepared here.{" "}
        {c.status === "DOCUMENTS_IN_PREPARATION" ? "The documents are still being prepared." : "The documents are awaiting approval."}
      </Callout>
      <WindowItemsCard d={w} c={c} />
      <Card className="overflow-hidden">
        <CardHeader
          icon={<UsersIcon size={17} />}
          title="Briefing and site visit"
          subtitle="The notice states each one's day, time and place."
          actions={<ScheduleEventDrawer exerciseId={c.exerciseId} allowed={schedule} mandatoryOffered={b.mandatoryOffered} inCard />}
          divided={b.events.length === 0}
        />
        {b.events.length === 0 ? (
          <EmptyState size="sm" title="None scheduled">{schedule.allowed ? "Schedule a tender briefing or a site visit if the notice is to state one." : "Nothing is scheduled yet."}</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {b.events.map((e) => {
              const cancelled = !!e.cancelled;
              return (
                <li key={e.id} className="flex flex-col gap-2 px-5 py-3.5 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 text-[14px] font-semibold break-words text-ink">{`${e.kind}, ${e.starts}`}</span>
                    {cancelled ? <Badge tone="neutral">Cancelled</Badge> : <Badge tone="info">Not held yet</Badge>}
                  </div>
                  <p className="text-[13px] break-words text-ink-2">{e.place}</p>
                  {cancelled ? (
                    <p className="text-[12.5px] break-words text-ink-3">{e.cancelled}</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone={e.attendance.startsWith("Mandatory") ? "brand" : e.attendance === "Not answered" ? "warn" : "neutral"}>{e.attendance}</Chip>
                      {e.attendance === "Not answered" && <span className="text-[12.5px] text-ink-3">Answer it before the window can be published.</span>}
                      <span className="ml-auto flex flex-wrap items-center gap-2">
                        {b.schedule.allowed && b.mandatoryOffered && <SetMandatoryDrawer exerciseId={c.exerciseId} eventId={e.id} label={e.kind} current={e.attendance === "Not answered" ? "unset" : e.attendance.startsWith("Mandatory") ? "yes" : "no"} />}
                        <CancelEventDrawer exerciseId={c.exerciseId} eventId={e.id} label={e.kind} published={false} />
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {c.status === "DOCUMENTS_IN_PREPARATION" && (
        <div>
          <ButtonLink href={`/sourcing/${c.exerciseId}?tab=documents`} variant="secondary" size="sm">Open the tender documents</ButtonLink>
        </div>
      )}
    </div>
  );
}
