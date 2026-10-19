import { PencilIcon } from "@/components/icons";
import { RecordEditor, type Field } from "@/components/record-editor";
import type { NotificationRule } from "@/lib/records/load";

import { saveNotificationRule } from "./actions";

function ruleFields(editing: boolean, officeCodes: string[]): Field[] {
  return [
    ...(editing
      ? []
      : ([
          {
            kind: "text",
            name: "eventKey",
            label: "Event",
            required: true,
            mono: true,
            hint: "What fires the rule. A key, never shown.",
          },
        ] as Field[])),
    { kind: "text", name: "nameEn", label: "Name", required: true },
    {
      kind: "text",
      name: "recipientRoleCodes",
      label: "Notify these offices",
      mono: true,
      hint:
        officeCodes.length > 0
          ? `Comma separated. Available: ${officeCodes.join(", ")}`
          : "No office yet. Add one under Users.",
    },
    {
      kind: "text",
      name: "reminderOffsetDays",
      label: "Remind this many days before",
      hint: "Comma separated, e.g. 30, 7, 1.",
    },
    {
      kind: "text",
      name: "escalatesToRoleCode",
      label: "Escalate to",
      mono: true,
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
    label: "Where this came from",
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

export function AddRule({ officeCodes }: { officeCodes: string[] }) {
  return (
    <RecordEditor
      title="Add a notification"
      description="What the portal sends, to whom, and when it chases."
      fields={ruleFields(false, officeCodes)}
      action={saveNotificationRule}
      submitLabel="Add notification"
      trigger={{ label: "Add notification", icon: true }}
    />
  );
}

export function EditRule({ row, officeCodes }: { row: NotificationRule; officeCodes: string[] }) {
  return (
    <RecordEditor
      title={`Edit ${row.nameEn}`}
      fields={[{ kind: "hidden", name: "id" }, ...ruleFields(true, officeCodes)]}
      action={saveNotificationRule}
      trigger={{ label: `Edit ${row.nameEn}`, iconOnly: <PencilIcon size={15} /> }}
      values={{
        id: row.id,
        eventKey: row.eventKey,
        nameEn: row.nameEn,
        recipientRoleCodes: row.recipientRoleCodes.join(", "),
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
