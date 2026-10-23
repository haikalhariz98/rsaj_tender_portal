import { CalendarIcon, UsersIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { MoreText } from "@/components/ui/more-text";
import { KeyValues } from "@/components/ui/stat";
import type { PortalKickOffView } from "@/lib/project-docs/kick-off-read";
import type { PortalTeam } from "@/lib/project-docs/team-read";

const none = <span className="text-ink-4">None</span>;

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

/// The organisation's people on this contract today: names and offices, nothing else (PW-16). Where the organisation's day is not known, who is in force is not said.
export function PortalTeamCard({ team }: { team: PortalTeam }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<UsersIcon size={17} />} title="Who you deal with" divided={team.members.length > 0} />
      {team.dayUnknown ? (
        <EmptyState size="sm" title="Not known yet" action={<MoreText label="Why" text="The organisation has not set its time zone, so who is in force today is not known." />} />
      ) : team.members.length === 0 ? (
        <EmptyState size="sm" title="Nobody named yet" />
      ) : (
        <ul className="divide-y divide-line/70">
          {team.members.map((m, i) => (
            <li key={i} className="flex flex-col gap-0.5 px-5 py-3 sm:px-6">
              <span className="text-[13.5px] font-semibold break-words text-ink">{m.name}</span>
              <span className="text-[12.5px] break-words text-ink-3">{m.office}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * The kick-off meeting as the contractor reads it: read only. When and where, the agenda, and once held who attended and the minutes. The online link is text, never a link. Who
 * scheduled it or recorded it is never said. The minutes' title is the link to its page (which carries its own form key); the files are named plain, so no download is started from here.
 */
export function PortalKickOffCard({ card }: { card: PortalKickOffView }) {
  const { meeting, held } = card;
  return (
    <Card>
      <CardHeader icon={<CalendarIcon size={17} />} title="Kick-off meeting" divided={!!meeting} actions={<Badge tone={card.tone === "neutral" ? undefined : card.tone}>{card.stateLabel}</Badge>} />
      {meeting && (
        <CardBody className="flex flex-col gap-5">
          <KeyValues
            columns={2}
            items={[
              { label: "When", value: meeting.meetsAtText },
              ...(meeting.place ? [{ label: "Place", value: meeting.place }] : []),
              ...(meeting.onlineLink ? [{ label: "Online link", value: <span className="break-all">{meeting.onlineLink}</span> }] : []),
              { label: "Agenda", value: <span className="whitespace-pre-line">{meeting.agenda}</span> },
            ]}
          />
          {held && (
            <KeyValues
              columns={2}
              items={[
                { label: "Held on", value: held.heldOnText },
                { label: "For the organisation", value: <Names names={held.attendance.organisation} /> },
                { label: "For you", value: <Names names={held.attendance.contractor} /> },
                ...(held.attendance.others.length > 0 ? [{ label: "Others", value: <Names names={held.attendance.others} /> }] : []),
                {
                  label: "Minutes",
                  value: held.minutes ? (
                    <span className="flex flex-col items-start gap-1">
                      {/* A plain anchor: the page is not prefetched. */}
                      <a href={held.minutes.href} className="font-semibold">
                        {held.minutes.title}
                      </a>
                      {held.minutes.files.map((f, i) => (
                        <span key={i} className="break-all text-[13px] text-ink-2">
                          {f.name}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-ink-4">Not shared</span>
                  ),
                },
              ]}
            />
          )}
        </CardBody>
      )}
    </Card>
  );
}
