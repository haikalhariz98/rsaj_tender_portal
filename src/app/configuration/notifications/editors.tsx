import { PencilIcon } from "@/components/icons";
import { RecordEditor, type Field } from "@/components/record-editor";
import type { NotificationRule } from "@/lib/records/load";

import { eventOptions } from "@/lib/notifications/events";

import { saveNotificationRule } from "./actions";

type Office = { code: string; nameEn: string };

function ruleFields(editing: boolean, offices: Office[], takenEvents: string[] = []): Field[] {
  const officeOptions = offices.map((o) => ({ value: o.code, label: o.nameEn }));
  return [
    ...(editing
      ? []
      : ([
          {
            kind: "select",
            name: "eventKey",
            label: "Event",
            required: true,
            placeholder: "Choose",
            options: eventOptions(takenEvents),
            hint: "One rule for each event.",
          },
        ] as Field[])),
    { kind: "text", name: "nameEn", label: "Name", required: true },
    {
      kind: "tokens",
      name: "recipientRoleCodes",
      label: "Notify these offices",
      placeholder: officeOptions.length > 0 ? "Add an office" : "No office yet. Add one under Users.",
      options: officeOptions,
    },
    {
      kind: "text",
      name: "reminderOffsetDays",
      label: "Remind this many days before",
      hint: "Comma separated, e.g. 30, 7, 1.",
    },
    {
      kind: "select",
      name: "escalatesToRoleCode",
      label: "Escalate to",
      placeholder: "Nobody",
      options: officeOptions,
      orphanLabel: "An office no longer configured",
      hint: "Where an unactioned step goes.",
    },
    {
      kind: "switch",
      name: "isActive",
      label: "This rule sends",
      hint: "Off: this event notifies nobody.",
    },
  {
    kind: "select",
    name: "provenance",
    label: "Basis",
    required: true,
    placeholder: "Choose",
    options: [
      { value: "STATED", label: "Stated — written in a governing document" },
      { value: "OBSERVED", label: "Observed — seen in practice" },
      { value: "ASSUMED", label: "Assumed — a working default, needs sign-off" },
    ],
  },
    { kind: "number", name: "sortOrder", label: "Order", min: 0 },
    { kind: "textarea", name: "notes", label: "Notes" },
  ];
}

export function AddRule({ offices, takenEvents }: { offices: Office[]; takenEvents: string[] }) {
  return (
    <RecordEditor
      title="Add a notification"
      description="What the portal sends, to whom, and when it chases."
      fields={ruleFields(false, offices, takenEvents)}
      action={saveNotificationRule}
      submitLabel="Add notification"
      trigger={{ label: "Add notification", icon: true }}
    />
  );
}

export function EditRule({ row, offices }: { row: NotificationRule; offices: Office[] }) {
  return (
    <RecordEditor
      title={`Edit ${row.nameEn}`}
      fields={[{ kind: "hidden", name: "id" }, ...ruleFields(true, offices)]}
      action={saveNotificationRule}
      trigger={{ label: `Edit ${row.nameEn}`, iconOnly: <PencilIcon size={15} /> }}
      values={{
        id: row.id,
        eventKey: row.eventKey,
        nameEn: row.nameEn,
        recipientRoleCodes: row.recipientRoleCodes.join("\n"),
        reminderOffsetDays: row.reminderOffsetDays.join(", "),
        escalatesToRoleCode: row.escalatesToRoleCode,
        isActive: row.isActive,
        provenance: row.provenance,
        sortOrder: String(row.sortOrder),
        notes: row.notes,
      }}
    />
  );
}
