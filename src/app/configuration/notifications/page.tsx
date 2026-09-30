import { loadRoster } from "@/lib/people/load";
import { loadNotificationRules } from "@/lib/records/load";
import { ORGANISATION_CODE } from "@/lib/org";

import { ProvenanceChip, Section, Stat, Stats } from "../records-ui";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { AddRule, EditRule } from "./editors";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { HistoryButton } from "@/components/history-drawer";

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

      <Stats>
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
      </Stats>

      <Section
        title="Notifications"
        blurb="A rule that is switched off is a recorded decision. A rule that is absent is an oversight — the two must not look alike."
        empty="No notification has been set. The portal sends nothing, and nothing records whether that was decided or overlooked."
        count={rules.length}
        action={<AddRule officeCodes={officeCodes} />}
      >
        <Table>
          <colgroup>
            <col />
            <col style={{ width: "24%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "12%" }} />
            <ActionsCol icons={2} />
          </colgroup>
          <THead>
            <Th>Event</Th>
            <Th>Notifies</Th>
            <Th>Reminds</Th>
            <Th>Escalates to</Th>
            <Th>Source</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {rules.map((r) => (
              <Tr key={r.id}>
                <Td title={r.nameEn}>
                  <CellStack
                    title={r.nameEn}
                    aside={!r.isActive ? <Badge outline>off</Badge> : undefined}
                  />
                </Td>
                <Td className="text-ink-2">
                  {r.recipientRoleCodes.length === 0
                    ? "Nobody"
                    : r.recipientRoleCodes.map(officeName).join(", ")}
                </Td>
                <Td className="text-ink-2 tabular-nums">
                  {r.reminderOffsetDays.length === 0
                    ? "Does not chase"
                    : r.reminderOffsetDays.map((d) => `${d}d`).join(" · ")}
                </Td>
                <Td className="text-ink-2">
                  {r.escalatesToRoleCode ? officeName(r.escalatesToRoleCode) : "—"}
                </Td>
                <Td>
                  <ProvenanceChip value={r.provenance} />
                </Td>
                <Td>
                  <RowActions>
                    <HistoryButton iconOnly entity="NotificationRule" entityId={r.id} label={r.nameEn} />
                    <EditRule row={r} officeCodes={officeCodes} />
                  </RowActions>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>
    </>
  );
}
