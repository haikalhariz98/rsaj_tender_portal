import Link from "next/link";
import type { ReactNode } from "react";

import { CalendarIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Blocked } from "@/components/ui/blocked";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MoreText } from "@/components/ui/more-text";
import { KeyValues } from "@/components/ui/stat";
import type { KickOffCardView } from "@/lib/project-docs/kick-off-read";

import { ChangeKickOffDrawer, RecordKickOffHeldDrawer, ScheduleKickOffDrawer } from "./kick-off-editors";

const NOTE_ID = "kick-off-note";
const MORE = "The kick-off meeting is held once the contract is executed. Record it held with who attended and the minutes, and the minutes are shared with the contractor. The Integrity Pact briefing is a separate record.";

const none = <span className="text-ink-4">None</span>;

/// A list of names, one a line; "None" where nobody.
function Names({ names }: { names: string[] }) {
  if (names.length === 0) return none;
  return (
    <ul className="flex flex-col gap-0.5">
      {names.map((n, i) => (
        <li key={i} className="break-words">
          {n}
        </li>
      ))}
    </ul>
  );
}

/**
 * The kick-off meeting on the Project's Overview (ADR 0042 D10, PW-18, PW-29; plan step 7 §8.2). Everything it says comes from the loader: the state and its tone (a meeting whose
 * day has passed unrecorded reads "Not recorded as held", never upcoming), the gates and their reasons, the lists. An act whose gate is shut is a disabled button and its reasons in
 * words, said once. The online link is text, never a link: nothing a contractor typed is made clickable. No count and no figure.
 */
export function KickOffCard({ card, contractId, briefingHref }: { card: KickOffCardView; contractId: string; briefingHref: string }) {
  const { meeting, held, actions } = card;
  // Which acts the card offers follows from what exists, not from the state's name: a meeting that is not held can be changed and recorded; none exists, it can be scheduled.
  const offered: { label: string; gate: KickOffCardView["actions"]["schedule"]; control: ReactNode }[] = !meeting
    ? [{ label: "Schedule", gate: actions.schedule, control: <ScheduleKickOffDrawer contractId={contractId} /> }]
    : !held
      ? [
          {
            label: "Change",
            gate: actions.change,
            control: <ChangeKickOffDrawer contractId={contractId} current={{ meetsOn: meeting.meetsOn, meetsTime: meeting.meetsTime, place: meeting.place, onlineLink: meeting.onlineLink, agenda: meeting.agenda }} />,
          },
          { label: "Record as held", gate: actions.recordHeld, control: <RecordKickOffHeldDrawer contractId={contractId} today={card.today} choices={card.choices} /> },
        ]
      : [];
  const reasons = [...new Set(offered.flatMap((o) => (o.gate.allowed ? [] : o.gate.reasons)))];
  return (
    <Card>
      <CardHeader
        icon={<CalendarIcon size={17} />}
        title="Kick-off meeting"
        subtitle={<MoreText label="About the kick-off meeting" text={MORE} />}
        divided={!!meeting || card.briefingMissing}
        actions={
          <>
            <Badge tone={card.tone === "neutral" ? undefined : card.tone}>{card.stateLabel}</Badge>
            {offered.map((o) => (o.gate.allowed ? <span key={o.label}>{o.control}</span> : <Blocked key={o.label} label={o.label} reason={o.gate.reasons.join(" ")} noteId={NOTE_ID} />))}
          </>
        }
      />
      {reasons.length > 0 && (
        <p id={NOTE_ID} className="px-5 pb-4 text-[12.5px] text-ink-3 sm:px-6">
          {reasons.join(" ")}
        </p>
      )}
      {(meeting || card.briefingMissing) && (
        <CardBody className="flex flex-col gap-5">
          {meeting && (
            <KeyValues
              columns={2}
              items={[
                { label: "When", value: meeting.meetsAtText },
                ...(meeting.place ? [{ label: "Place", value: meeting.place }] : []),
                ...(meeting.onlineLink ? [{ label: "Online link", value: <span className="break-all">{meeting.onlineLink}</span> }] : []),
                { label: "Agenda", value: <span className="whitespace-pre-line">{meeting.agenda}</span> },
                { label: "Scheduled by", value: `${meeting.scheduledBy}, ${meeting.scheduledOn}` },
              ]}
            />
          )}
          {held && (
            <KeyValues
              columns={2}
              items={[
                { label: "Held on", value: held.heldOnText },
                { label: "Recorded by", value: held.recordedBy },
                { label: "For the organisation", value: <Names names={held.attendance.organisation} /> },
                { label: "For the contractor", value: <Names names={held.attendance.contractor} /> },
                ...(held.attendance.others.length > 0 ? [{ label: "Others", value: <Names names={held.attendance.others} /> }] : []),
                {
                  label: "Minutes",
                  value: held.minutes ? (
                    <span className="flex flex-col items-start gap-1">
                      <Link href={held.minutes.href} className="font-semibold">
                        {held.minutes.title}
                      </Link>
                      {held.minutes.files.map((f) => (
                        // A plain anchor: a download is not prefetched.
                        <a key={f.versionId} href={`/api/documents/versions/${encodeURIComponent(f.versionId)}`} className="break-all text-[13px]">
                          {f.name}
                        </a>
                      ))}
                    </span>
                  ) : (
                    <span className="text-ink-4">Not on record</span>
                  ),
                },
              ]}
            />
          )}
          {card.briefingMissing && (
            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4 text-[13.5px] text-ink-2">
              <span>Integrity Pact briefing not recorded</span>
              <ButtonLink href={briefingHref} size="sm" variant="secondary">
                Record the briefing
              </ButtonLink>
            </div>
          )}
        </CardBody>
      )}
    </Card>
  );
}
