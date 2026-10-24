import { PencilIcon } from "@/components/icons";
import { RecordEditor, type Field } from "@/components/record-editor";
import type { StoredSeries } from "@/lib/numbering/load";
import { serialFor } from "@/lib/numbering/series";
import { seriesKeyOptions } from "@/lib/numbering/keys";

import { saveSeries } from "./actions";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((label, i) => ({ value: String(i + 1), label }));

function seriesFields(editing: boolean, taken: string[] = []): Field[] {
  return [
    ...(editing
      ? []
      : ([
          {
            kind: "select",
            name: "key",
            label: "Applies to",
            required: true,
            placeholder: "Choose",
            options: seriesKeyOptions(taken),
          },
        ] as Field[])),
    { kind: "text", name: "nameEn", label: "Name", required: true },
    {
      kind: "text",
      name: "pattern",
      label: "Pattern",
      required: true,
      mono: true,
      hint: "Tokens: {SERIAL}, {YEAR}, {SHORTYEAR}, {MONTH}. Rest is literal.",
    },
    {
      kind: "number",
      name: "padding",
      label: "Serial width",
      min: 1,
      hint: "3 gives 001. Wider serials widen.",
    },
    {
      kind: "select",
      name: "resetOn",
      label: "Starts again",
      required: true,
      placeholder: "Choose",
      options: [
        { value: "NEVER", label: "Never — one run forever" },
        { value: "CALENDAR_YEAR", label: "Each calendar year" },
        { value: "FINANCIAL_YEAR", label: "Each financial year" },
      ],
    },
    {
      kind: "select",
      name: "financialYearStartMonth",
      label: "Financial year starts in",
      placeholder: "Choose",
      options: MONTHS,
      hint: "For financial-year resets.",
    },
    {
      kind: "number",
      name: "nextSerial",
      label: "Next serial",
      min: 1,
      hint: "Never goes backwards.",
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
    { kind: "textarea", name: "notes", label: "Notes" },
  ];
}

export function AddSeries({ taken = [] }: { taken?: string[] }) {
  return (
    <RecordEditor
      title="Add a series"
      description="How a reference is formed for one kind of record."
      fields={seriesFields(false, taken)}
      action={saveSeries}
      submitLabel="Add series"
      trigger={{ label: "Add series", icon: true }}
    />
  );
}

export function EditSeries({ series }: { series: StoredSeries }) {
  return (
    <RecordEditor
      title={`Edit ${series.nameEn}`}
      fields={[{ kind: "hidden", name: "id" }, ...seriesFields(true)]}
      action={saveSeries}
      trigger={{ label: `Edit ${series.nameEn}`, iconOnly: <PencilIcon size={15} /> }}
      values={{
        id: series.id,
        key: series.key,
        nameEn: series.nameEn,
        pattern: series.pattern,
        padding: String(series.padding),
        resetOn: series.resetOn,
        financialYearStartMonth: String(series.financialYearStartMonth),
        // The serial the next reference would take today, not the stored one: after a
        // yearly reset is due, the stored figure belongs to last year.
        nextSerial: String(serialFor(series, new Date())),
        provenance: series.provenance,
        notes: series.notes,
      }}
    />
  );
}
