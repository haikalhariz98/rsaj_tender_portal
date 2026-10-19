import { PencilIcon } from "@/components/icons";
import { END_DAY_LABEL } from "@/lib/effective-text";
import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import type { Allocation } from "@/lib/budget/availability";

import { endAllocation, releaseCommitment, saveAllocation, saveCommitment } from "./actions";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

interface CodeOption {
  code: string;
  nameEn: string;
}

function allocationFields(centres: CodeOption[], accounts: CodeOption[]): Field[] {
  return [
    {
      kind: "select",
      name: "costCentreCode",
      label: "Cost centre",
      required: true,
      placeholder: "Choose",
      options: centres.map((c) => ({ value: c.code, label: `${c.code} — ${c.nameEn}` })),
    },
    {
      kind: "select",
      name: "accountCodeCode",
      label: "Account code",
      required: true,
      placeholder: "Choose",
      options: accounts.map((a) => ({ value: a.code, label: `${a.code} — ${a.nameEn}` })),
    },
    {
      kind: "text",
      name: "periodLabel",
      label: "Period",
      required: true,
      hint: "What this period is called here.",
    },
    { kind: "money", name: "amount", label: "Amount allocated", required: true },
    { kind: "date", name: "effectiveFrom", label: "In force from", required: true },
    {
      kind: "date",
      name: "effectiveTo",
      label: END_DAY_LABEL,
      hint: "First day not in force. Empty if current.",
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

export function AddAllocation({
  centres,
  accounts,
}: {
  centres: CodeOption[];
  accounts: CodeOption[];
}) {
  const blocked = centres.length === 0 || accounts.length === 0;
  return (
    <RecordEditor
      title="Add an allocation"
      description="Money set aside against a cost centre and an account code."
      fields={
        blocked
          ? [
              {
                kind: "note",
                text: "A cost centre and an account code must exist before money can be allocated against them. Add them under Organisation first.",
              },
            ]
          : allocationFields(centres, accounts)
      }
      action={saveAllocation}
      submitLabel={blocked ? "Nothing to allocate against" : "Add allocation"}
      trigger={{ label: "Add allocation", icon: true }}
    />
  );
}

export function EditAllocation({
  allocation,
  centres,
  accounts,
}: {
  allocation: Allocation;
  centres: CodeOption[];
  accounts: CodeOption[];
}) {
  return (
    <RecordEditor
      title="Edit allocation"
      fields={[{ kind: "hidden", name: "id" }, ...allocationFields(centres, accounts)]}
      action={saveAllocation}
      trigger={{ label: "Edit allocation", iconOnly: <PencilIcon size={15} /> }}
      values={{
        id: allocation.id,
        costCentreCode: allocation.costCentreCode,
        accountCodeCode: allocation.accountCodeCode,
        periodLabel: allocation.periodLabel,
        amount: allocation.amount,
        effectiveFrom: day(allocation.effectiveFrom),
        effectiveTo: day(allocation.effectiveTo),
        sortOrder: String(allocation.sortOrder),
      }}
    />
  );
}

export function AddCommitment({ allocations }: { allocations: Allocation[] }) {
  return (
    <RecordEditor
      title="Record a commitment"
      description="Money already spoken for against an allocation."
      fields={[
        {
          kind: "select",
          name: "allocationId",
          label: "Against",
          required: true,
          placeholder: "Choose",
          options: allocations.map((a) => ({
            value: a.id,
            label: `${a.costCentreCode} / ${a.accountCodeCode} — ${a.periodLabel}`,
          })),
        },
        {
          kind: "text",
          name: "reference",
          label: "Reference",
          required: true,
          hint: "Your own reference for the matter.",
        },
        { kind: "text", name: "description", label: "Description" },
        { kind: "money", name: "amount", label: "Amount", required: true },
        { kind: "date", name: "committedOn", label: "Committed on", required: true },
      ]}
      action={saveCommitment}
      submitLabel="Record it"
      trigger={{ label: "Record commitment", icon: true }}
      size="sm"
    />
  );
}

export function ReleaseCommitment({ id, reference }: { id: string; reference: string }) {
  return (
    <RecordEditor
      title={`Release ${reference}`}
      description="The money returns to the balance. The commitment stays on record."
      fields={[{ kind: "hidden", name: "id" }]}
      values={{ id }}
      action={releaseCommitment}
      submitLabel="Release"
      destructive={{ reasonLabel: "Why is it being released?" }}
      trigger={{ label: "Release", className: buttonClass("destructive", "sm") }}
      size="sm"
    />
  );
}

export function EndAllocation({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`End ${label}`}
      description="Closes today in the organisation's time zone. Checked requisitions keep their balance."
      fields={[{ kind: "hidden", name: "id" }]}
      values={{ id }}
      action={endAllocation}
      submitLabel="End it"
      destructive={{ reasonLabel: "Why is it ending?" }}
      trigger={{ label: "End", className: buttonClass("destructive", "sm") }}
      size="sm"
    />
  );
}
