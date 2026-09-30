import { loadRoster } from "@/lib/people/load";
import { loadNotificationRules } from "@/lib/records/load";
import { ORGANISATION_CODE } from "@/lib/org";

import { ProvenanceChip, Section, Stat } from "../records-ui";
import { AddRule, EditRule } from "./editors";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const [rules, roster] = await Promise.all([
    loadNotificationRules(ORGANISATION_CODE),
    loadRoster(ORGANISATION_CODE),
  ]);

  const officeCodes = roster.offices.map((o) => o.code);
  const officeName = (code: string) =>
    roster.offices.find((o) => o.code === code)?.nameEn ?? code;

  const active = rules.filter((r) => r.isActive);
  const silent = rules.filter((r) => !r.isActive);

  return (
    <>
      <PageHeader
        title="Notifications"
        badge={
          silent.length > 0 ? (
            <Badge outline>{silent.length === 1 ? "1 switched off" : `${silent.length} switched off`}</Badge>
          ) : undefined
        }
        subtitle="What the portal sends, to whom, and when reminders are issued."
      />

      <div className="grid g3 stack--md" style={{ marginBottom: 24 }}>
        <Stat
          label="Rules"
          value={rules.length === 0 ? null : rules.length}
          hint={rules.length === 0 ? "The portal sends nothing" : "Configured events"}
        />
        <Stat
          label="Sending"
          value={rules.length === 0 ? null : active.length}
          hint="Rules that reach somebody"
        />
        <Stat
          label="Deliberately silent"
          value={rules.length === 0 ? null : silent.length}
          hint="Recorded as notifying nobody, rather than left unset"
        />
      </div>

      <Section
        title="Notifications"
        blurb="A rule that is switched off is a recorded decision. A rule that is absent is an oversight — the two must not look alike."
        empty="No notification has been set. The portal sends nothing, and nothing records whether that was decided or overlooked."
        count={rules.length}
        action={<AddRule officeCodes={officeCodes} />}
      >
        <table className="table">
          <colgroup>
            <col style={{ width: "22%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Event</th>
              <th>Notifies</th>
              <th>Reminds</th>
              <th>Escalates to</th>
              <th>Source</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className="cellstack">
                    <span className="cellstack__t">
                      {r.nameEn}
                      {!r.isActive && (
                        <span className="badge badge--outline" style={{ marginLeft: 8 }}>
                          off
                        </span>
                      )}
                    </span>
                  </div>
                </td>
                <td className="sm dim">
                  {r.recipientRoleCodes.length === 0
                    ? "Nobody"
                    : r.recipientRoleCodes.map(officeName).join(", ")}
                </td>
                <td className="sm dim">
                  {r.reminderOffsetDays.length === 0
                    ? "Does not chase"
                    : r.reminderOffsetDays.map((d) => `${d}d`).join(" · ")}
                </td>
                <td className="sm dim">
                  {r.escalatesToRoleCode ? officeName(r.escalatesToRoleCode) : "—"}
                </td>
                <td>
                  <ProvenanceChip value={r.provenance} />
                </td>
                <td className="right">
                  <EditRule row={r} officeCodes={officeCodes} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}
