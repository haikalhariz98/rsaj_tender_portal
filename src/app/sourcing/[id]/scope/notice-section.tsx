import { hiddenExercises } from "@/app/_auth/sulit";
import type { Reader } from "@/lib/auth/sulit-store";
import { ClockIcon, UsersIcon } from "@/components/icons";
import { Badge, Chip } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { KeyValues } from "@/components/ui/stat";
import { bidAnswers } from "@/lib/bids/read";
import { briefingTab, windowTab } from "@/lib/window/read";
import { isPublished } from "@/lib/window/phase";
import type { ExerciseStatus } from "@/lib/method/types";

import { BidAnswersDrawer } from "../bids/editors";
import { FromBadge, GONE } from "../window/common";
import { CancelEventDrawer, ScheduleEventDrawer, SetMandatoryDrawer } from "../window/editors";
import { WindowItemsCard, type WindowContext } from "../window/window-section";

/**
 * Notice and fee, and Briefing and site visit: the fourth and fifth sections of Scope and estimate (Sourcing Requirements v2: SR-06, ruling 9).
 * What the Invitation tab's preparation held, before approval: the notice's items, the document fee and what it is judged against, the bid
 * validity (answer 4), and each briefing or site visit. Their findings are on the submit gate; the publish gate keeps them as a backstop.
 * Only the section named is read, so a sibling's data is never loaded.
 */

function NoWindow({ c, kind }: { c: WindowContext; kind: "notice" | "briefing" }) {
  if (c.noPack) {
    return (
      <Card>
        <EmptyState title="This exercise has no invitation window">This exercise assembles no tender or quotation documents, so there is no notice to state and nothing to advertise, invite or schedule.</EmptyState>
      </Card>
    );
  }
  return (
    <Card>
      <EmptyState title={kind === "notice" ? "The notice and fee are filled in once the exercise is in preparation" : "A briefing or site visit is scheduled once the exercise is in preparation"} action={<ButtonLink href={`/sourcing/${c.exerciseId}?tab=overview`} variant="secondary" size="sm">Open the Overview</ButtonLink>}>
        Move the exercise into preparation first. Then the notice&apos;s items, the fee, the bids&apos; validity and any briefing or site visit are prepared here, before the documents go for approval.
      </EmptyState>
    </Card>
  );
}

export async function NoticeSection({ scope, c }: { scope: Reader; c: WindowContext }) {
  if (c.noPack || c.status === "DRAFT") return <NoWindow c={c} kind="notice" />;
  const [w, v] = await Promise.all([windowTab(scope.organisationId, c.exerciseId, await hiddenExercises(scope)), bidAnswers(scope.organisationId, c.exerciseId)]);
  if (!w || !v) return GONE;
  return (
    <div className="flex flex-col gap-6">
      {!w.hasWindow && (
        <Callout tone="info" title="Not filled in yet">
          The notice&apos;s items, the fee and the bids&apos; validity are filled in before the documents go for approval, and they are checked again when the exercise is published.
        </Callout>
      )}
      <WindowItemsCard d={w} c={c} />
      <Card className="overflow-hidden">
        <CardHeader
          icon={<ClockIcon size={17} />}
          title="Bid validity"
          subtitle="How long a bid stays valid, as the tender documents state it. There is no default."
          actions={<BidAnswersDrawer exerciseId={c.exerciseId} allowed={v.allowed} values={v.values} needsReason={v.needsReason} />}
        />
        <CardBody className="flex flex-col gap-3 border-t border-line">
          <KeyValues
            columns={2}
            items={[
              { label: "Valid for", value: v.days == null ? <Badge tone="warn">Not set</Badge> : <span className="flex flex-wrap items-center gap-2">{`${v.days} days from the closing day`}{v.provenance && <FromBadge text={v.provenance} />}</span> },
              { label: "Alternative bids", value: v.alternatives },
            ]}
          />
          {!v.allowed.allowed && <p className="text-[12.5px] text-ink-3">{v.allowed.reason}</p>}
        </CardBody>
      </Card>
    </div>
  );
}

export async function BriefingPrepSection({ scope, c }: { scope: Reader; c: WindowContext }) {
  if (c.noPack || c.status === "DRAFT") return <NoWindow c={c} kind="briefing" />;
  const [w, b] = await Promise.all([windowTab(scope.organisationId, c.exerciseId, await hiddenExercises(scope)), briefingTab(scope.organisationId, c.exerciseId)]);
  if (!w || !b) return GONE;
  const published = isPublished(c.status as ExerciseStatus);
  // An event belongs to the window, which is saved first; the server refuses it otherwise.
  const schedule = b.schedule.allowed && !w.hasWindow ? { allowed: false as const, reason: "Fill in the notice and fee first: an event is added to the window." } : b.schedule;
  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <CardHeader
          icon={<UsersIcon size={17} />}
          title="Briefing and site visit"
          subtitle="The notice states each one's day, time and place."
          actions={<ScheduleEventDrawer exerciseId={c.exerciseId} allowed={schedule} mandatoryOffered={b.mandatoryOffered} inCard />}
          divided={b.events.length === 0}
        />
        {b.events.length === 0 ? (
          <EmptyState size="sm" title="None scheduled">{schedule.allowed ? "Schedule a tender briefing or a site visit if the notice is to state one." : schedule.reason}</EmptyState>
        ) : (
          <ul className="divide-y divide-line/70">
            {b.events.map((e) => {
              const cancelled = !!e.cancelled;
              return (
                <li key={e.id} className="flex flex-col gap-2 px-5 py-3.5 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 text-[14px] font-semibold break-words text-ink">{`${e.kind}, ${e.starts}`}</span>
                    {cancelled ? <Badge tone="neutral">Cancelled</Badge> : e.held ? <Badge tone="ok">{`Held ${e.held}`}</Badge> : <Badge tone="info">Not held yet</Badge>}
                  </div>
                  <p className="text-[13px] break-words text-ink-2">{e.place}</p>
                  {cancelled ? (
                    <p className="text-[12.5px] break-words text-ink-3">{e.cancelled}</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone={e.attendance.startsWith("Mandatory") ? "brand" : e.attendance === "Not answered" ? "warn" : "neutral"}>{e.attendance}</Chip>
                      {e.attendance === "Not answered" && <span className="text-[12.5px] text-ink-3">Answer it before the documents go for approval.</span>}
                      <span className="ml-auto flex flex-wrap items-center gap-2">
                        {b.schedule.allowed && b.mandatoryOffered && <SetMandatoryDrawer exerciseId={c.exerciseId} eventId={e.id} label={e.kind} current={e.attendance === "Not answered" ? "unset" : e.attendance.startsWith("Mandatory") ? "yes" : "no"} />}
                        {!e.held && <CancelEventDrawer exerciseId={c.exerciseId} eventId={e.id} label={e.kind} published={published} />}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {published && (
          <div className="border-t border-line px-5 py-3 sm:px-6">
            <p className="text-[12.5px] text-ink-3">Marking an event held, and who attended, are recorded under Bids and opening, Sales and briefing.</p>
            <ButtonLink href={`/sourcing/${c.exerciseId}?tab=bids&section=sales`} variant="secondary" size="sm" className="mt-2">Open Sales and briefing</ButtonLink>
          </div>
        )}
      </Card>
    </div>
  );
}
