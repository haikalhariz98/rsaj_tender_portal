import { loadRoster } from "@/lib/people/load";
import { loadNotificationRules } from "@/lib/records/load";

import { Section } from "../records-ui";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { AddRule, EditRule } from "./editors";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { HistoryButton } from "@/components/history-drawer";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const actor = await requireStaff();
  const [rules, roster] = await Promise.all([
    loadNotificationRules(actor.organisationCode),
    loadRoster(actor.organisationCode),
  ]);

  const officeCodes = roster.offices.map((o) => o.code);
  const officeName = (code: string) =>
    roster.offices.find((o) => o.code === code)?.nameEn ?? code;

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
        info={{ title: "Notifications", text: "What the portal sends, to whom, and when reminders go out. A rule switched off is a recorded decision; a rule that is missing is an oversight, and the two must not look alike." }}
      />

      <Section
        title="Notifications"
        blurb="Who is told about each event, and who is reminded."
        empty="No notification rule yet. The portal sends nothing."
        count={rules.length}
        action={<AddRule officeCodes={officeCodes} />}
      >
        <Table>
          <colgroup>
            <col />
            <col style={{ width: "24%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "14%" }} />
            <ActionsCol icons={2} />
          </colgroup>
          <THead>
            <Th>Event</Th>
            <Th>Notifies</Th>
            <Th>Reminds</Th>
            <Th>Escalates to</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {rules.map((r) => (
              <Tr key={r.id}>
                <Td label="Event" title={r.nameEn}>
                  <CellStack
                    title={r.nameEn}
                    aside={!r.isActive ? <Badge outline>off</Badge> : undefined}
                  />
                </Td>
                <Td label="Notifies" className="text-ink-2">
                  {r.recipientRoleCodes.length === 0
                    ? "Nobody"
                    : r.recipientRoleCodes.map(officeName).join(", ")}
                </Td>
                <Td label="Reminds" className="text-ink-2 tabular-nums">
                  {r.reminderOffsetDays.length === 0
                    ? "No reminders"
                    : r.reminderOffsetDays.map((d) => `${d}d`).join(" · ")}
                </Td>
                <Td label="Escalates to" className="text-ink-2">
                  {r.escalatesToRoleCode ? officeName(r.escalatesToRoleCode) : "—"}
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
