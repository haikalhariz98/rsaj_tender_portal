import { Say } from "@/components/i18n/language-context";
import { CASE_PANEL_TITLE_WORDS as P } from "@/lib/contract/case-page-words";
import { RoutingSheetView } from "@/components/certificate/routing-sheet";
import { RouteIcon } from "@/components/icons";
import { RecordEditor, type Field } from "@/components/record-editor";
import { Blocked } from "@/components/ui/blocked";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import type { LoadedAward } from "@/lib/award/repo";
import { awardSheetClosed, awardSheetOf, loadAwardSheetRows } from "@/lib/certificate/award-sheet";
import { refusalText } from "@/lib/certificate/fault-text";
import { db } from "@/lib/db";
import { actorField } from "@/lib/auth/actor-field";
import { storedDay } from "@/lib/dates";

import { recordAwardRoutingCheck, recordAwardRoutingReceived, startAwardRoutingSheet } from "@/app/awards/[id]/routing-actions";

/**
 * The award's pre-award routing sheet (6.14 increment 1, rulings condition; flagged against accepted 6.11): a
 * routing sheet type drawn over the appointment route, with its own checks and received day. The committee and
 * approver blocks the award already shows (FR-CTE-014) are unchanged; this tab adds the sheet around them.
 */

type Option = { value: string; label: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const secondary = buttonClass("secondary", "sm");
const ghost = buttonClass("ghost", "sm");
const primary = buttonClass("primary", "sm");

export async function AwardRoutingSheetPanel({ l, people, today }: { l: LoadedAward; people: Option[]; today: string | null }) {
  const award = l.award;
  const rows = await loadAwardSheetRows(award.id, db);
  const sheet = today ? awardSheetOf(l, rows, today) : null;
  // Closed on a cancelled award, and once the appointment route is decided (the act refuses then too).
  const closed = awardSheetClosed(l);
  const open = closed.length === 0;
  if (!rows.sheet) {
    const types = await db.routingSheetType.findMany({ where: { organisationId: l.org.id, subject: "AWARD", OR: [{ retiredOn: null }, ...(today ? [{ retiredOn: { gt: new Date(`${today}T00:00:00.000Z`) } }] : [])] }, orderBy: [{ sortOrder: "asc" }, { labelEn: "asc" }], select: { id: true, labelEn: true } });
    const blocker = !today ? "Set the organisation's time zone first." : !open ? refusalText("Not started:", closed) : types.length === 0 ? "No routing sheet type is drawn over an award's route: add one under Configuration › Routing sheets." : null;
    return (
      <Card>
        <CardHeader
          icon={<RouteIcon size={17} />}
          title={<Say words={P.routingSheet} />}
          subtitle="The pre-award routing sheet around the appointment route: the day received, its internal checks, the route's own steps and the day approved, and the elapsed time against the sheet's target."
          actions={
            <RecordEditor
              title="Start the routing sheet"
              description="Freezes the chosen type, its checks and its targets on this award, as they stand today."
              fields={[hidden("id"), { kind: "select", name: "typeId", label: "Routing sheet", required: true, placeholder: "Choose", options: types.map((t) => ({ value: t.id, label: t.labelEn })) }]}
              values={{ id: award.id }}
              action={startAwardRoutingSheet}
              submitLabel="Start"
              submitBlock={blocker}
              trigger={{ label: "Start the routing sheet", className: primary }}
            />
          }
        />
        <EmptyState size="sm" title="Not started">No routing sheet is kept for this award yet.</EmptyState>
      </Card>
    );
  }
  if (!sheet) {
    return (
      <Card>
        <CardHeader icon={<RouteIcon size={17} />} title={<Say words={P.routingSheet} />} />
        <EmptyState size="sm" title="Not judged">Set the organisation&apos;s time zone first.</EmptyState>
      </Card>
    );
  }
  const received = rows.sheet.receivedOn ? storedDay(rows.sheet.receivedOn) : null;
  return (
    <RoutingSheetView
      sheet={sheet}
      open={open}
      headerAction={
        open ? (
          <RecordEditor
            title="The day received"
            description="The day the document reached the routing sheet. It starts the internal clock. Not in the future, not after the first check is recorded, and not after the appointment route opened or anyone on it decided."
            fields={[hidden("id"), { kind: "date", name: "receivedOn", label: "Received on", required: true }]}
            values={{ id: award.id, receivedOn: received ?? today }}
            action={recordAwardRoutingReceived}
            trigger={received ? { label: "Correct the received day", className: ghost } : { label: "Record the received day", className: secondary }}
          />
        ) : (
          <Blocked label={received ? "Correct the received day" : "Record the received day"} reason={refusalText("Closed:", closed)} />
        )
      }
      checkAction={(def) => (
        <RecordEditor
          title={def.labelEn}
          description={def.officeLabel ? `Recorded for a holder of ${def.officeLabel} on the day (or a delegate of the whole office).` : "No office is set for this check on its type: any officer may be named, and the sheet says so."}
          fields={[hidden("id"), hidden("defOrder"), actorField("RoutingCheck.person", { name: "personId", people }), { kind: "date", name: "on", label: "On", required: true }, { kind: "textarea", name: "note", label: "Note" }]}
          values={{ id: award.id, defOrder: String(def.order), on: today }}
          action={recordAwardRoutingCheck}
          submitBlock={sheet.date1 ? null : "Record the day it was received first."}
          trigger={{ label: "Record", className: secondary, ariaLabel: `Record ${def.labelEn}` }}
        />
      )}
      routeNote="The appointment route is not open yet: it opens when the award is sent for approval."
    />
  );
}
