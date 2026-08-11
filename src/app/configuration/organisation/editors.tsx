import { RecordEditor, type Field } from "@/components/record-editor";
import type { AccountCode, CodeFormat, CostCentre, OrgUnit, Site } from "@/lib/organisation/types";

import { closeRecord, saveCodedRecord, saveCodeFormat, saveOrgUnit } from "./actions";

/**
 * Field declarations for the Organisation records.
 *
 * Everything here is effective-dated, so every form asks when the entry starts. That
 * date is required and never defaulted to today: a unit backdated to a reorganisation
 * and one created this morning are different facts.
 */

const PROVENANCE_FIELD: Field = {
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
};

const PERIOD_FIELDS: Field[] = [
  { kind: "date", name: "effectiveFrom", label: "In force from", required: true },
  {
    kind: "date",
    name: "effectiveTo",
    label: "In force to",
    hint: "Leave empty while it is still in force.",
  },
];

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const num = (n: number) => String(n);

function unitFields(editing: boolean, options: { units: OrgUnit[]; centres: CostCentre[] }): Field[] {
  return [
    ...(editing
      ? []
      : ([{ kind: "text", name: "code", label: "Code", required: true, mono: true }] as Field[])),
    { kind: "text", name: "nameEn", label: "Name", required: true },
    { kind: "text", name: "nameMs", label: "Name (Malay)" },
    {
      kind: "select",
      name: "kind",
      label: "Tier",
      required: true,
      placeholder: "Choose",
      options: [
        { value: "COMPANY", label: "Company" },
        { value: "DIVISION", label: "Division" },
        { value: "DEPARTMENT", label: "Department" },
        { value: "SECTION", label: "Section" },
      ],
    },
    {
      kind: "select",
      name: "parentCode",
      label: "Reports to",
      placeholder: "Nothing — this is the top",
      options: options.units.map((u) => ({ value: u.code, label: u.nameEn })),
    },
    {
      kind: "select",
      name: "costCentreCode",
      label: "Cost centre",
      placeholder: "Holds no budget of its own",
      options: options.centres.map((c) => ({ value: c.code, label: `${c.code} — ${c.nameEn}` })),
    },
    ...PERIOD_FIELDS,
    { kind: "text", name: "governingSource", label: "Source document" },
    PROVENANCE_FIELD,
    { kind: "number", name: "sortOrder", label: "Order", min: 0 },
    { kind: "textarea", name: "notes", label: "Notes" },
  ];
}

export function AddOrgUnit({ units, centres }: { units: OrgUnit[]; centres: CostCentre[] }) {
  return (
    <RecordEditor
      title="Add a unit"
      description="A company, division, department or section."
      fields={unitFields(false, { units, centres })}
      action={saveOrgUnit}
      submitLabel="Add unit"
      trigger={{ label: "Add unit", icon: true }}
      size=" modal--lg"
    />
  );
}

export function EditOrgUnit({
  unit,
  id,
  units,
  centres,
}: {
  unit: OrgUnit;
  id: string;
  units: OrgUnit[];
  centres: CostCentre[];
}) {
  return (
    <RecordEditor
      title={`Edit ${unit.nameEn}`}
      fields={[{ kind: "hidden", name: "id" }, ...unitFields(true, { units, centres })]}
      action={saveOrgUnit}
      trigger={{ label: "Edit", className: "btn btn--sm btn--ghost" }}
      size=" modal--lg"
      values={{
        id,
        code: unit.code,
        nameEn: unit.nameEn,
        nameMs: unit.nameMs,
        kind: unit.kind,
        parentCode: unit.parentCode,
        costCentreCode: unit.costCentreCode,
        effectiveFrom: day(unit.effectiveFrom),
        effectiveTo: day(unit.effectiveTo),
        governingSource: unit.governingSource,
        provenance: unit.provenance,
        sortOrder: num(unit.sortOrder),
        notes: unit.notes,
      }}
    />
  );
}

function codedFields(entity: "CostCentre" | "AccountCode" | "Site", editing: boolean, units: OrgUnit[]): Field[] {
  const codeHint =
    entity === "CostCentre"
      ? "Checked against the cost centre format, where one is configured."
      : entity === "AccountCode"
        ? "Checked against the account code format, where one is configured."
        : "The portal's own reference for this site.";
  return [
    { kind: "hidden", name: "entity" },
    ...(editing
      ? []
      : ([
          { kind: "text", name: "code", label: "Code", required: true, mono: true, hint: codeHint },
        ] as Field[])),
    { kind: "text", name: "nameEn", label: "Name", required: true },
    { kind: "text", name: "nameMs", label: "Name (Malay)" },
    ...(entity === "Site"
      ? ([
          { kind: "textarea", name: "address", label: "Address" },
          {
            kind: "select",
            name: "orgUnitCode",
            label: "Responsible unit",
            placeholder: "Not set",
            options: units.map((u) => ({ value: u.code, label: u.nameEn })),
          },
        ] as Field[])
      : []),
    ...PERIOD_FIELDS,
    PROVENANCE_FIELD,
    { kind: "number", name: "sortOrder", label: "Order", min: 0 },
    { kind: "textarea", name: "notes", label: "Notes" },
  ];
}

const TITLES = {
  CostCentre: { one: "cost centre", add: "Add cost centre" },
  AccountCode: { one: "account code", add: "Add account code" },
  Site: { one: "site", add: "Add site" },
} as const;

export function AddCoded({
  entity,
  units = [],
}: {
  entity: "CostCentre" | "AccountCode" | "Site";
  units?: OrgUnit[];
}) {
  return (
    <RecordEditor
      title={`Add a ${TITLES[entity].one}`}
      fields={codedFields(entity, false, units)}
      values={{ entity }}
      action={saveCodedRecord}
      submitLabel={TITLES[entity].add}
      trigger={{ label: TITLES[entity].add, icon: true }}
    />
  );
}

export function EditCoded({
  entity,
  id,
  row,
  units = [],
}: {
  entity: "CostCentre" | "AccountCode" | "Site";
  id: string;
  row: (CostCentre | AccountCode | Site) & { address?: string; orgUnitCode?: string | null };
  units?: OrgUnit[];
}) {
  return (
    <RecordEditor
      title={`Edit ${row.nameEn}`}
      fields={[{ kind: "hidden", name: "id" }, ...codedFields(entity, true, units)]}
      action={saveCodedRecord}
      trigger={{ label: "Edit", className: "btn btn--sm btn--ghost" }}
      values={{
        entity,
        id,
        code: row.code,
        nameEn: row.nameEn,
        nameMs: row.nameMs,
        address: row.address ?? null,
        orgUnitCode: row.orgUnitCode ?? null,
        effectiveFrom: day(row.effectiveFrom),
        effectiveTo: day(row.effectiveTo),
        provenance: row.provenance,
        sortOrder: num(row.sortOrder),
        notes: row.notes,
      }}
    />
  );
}

export function EditCodeFormat({ format, formatKey }: { format?: CodeFormat; formatKey: string }) {
  return (
    <RecordEditor
      title={formatKey === "cost_centre" ? "Cost centre format" : "Account code format"}
      description="One customer's cost centre is not another's, so the shape is configured rather than built in."
      fields={[
        { kind: "hidden", name: "key" },
        {
          kind: "text",
          name: "pattern",
          label: "Pattern",
          required: true,
          mono: true,
          hint: "A regular expression. It is anchored for you, so it must match the whole code.",
        },
        {
          kind: "text",
          name: "example",
          label: "Example",
          hint: "Shown to officers entering a code. Must satisfy the pattern.",
        },
        {
          kind: "text",
          name: "description",
          label: "Requirement in words",
          hint: "A pattern nobody can read is not a requirement anybody can meet.",
        },
        PROVENANCE_FIELD,
      ]}
      action={saveCodeFormat}
      submitLabel={format ? "Save format" : "Set format"}
      trigger={{
        label: format ? "Edit" : "Set format",
        className: format ? "btn btn--sm btn--ghost" : "btn btn--sm",
      }}
      values={{
        key: formatKey,
        pattern: format?.pattern ?? null,
        example: format?.example ?? null,
        description: format?.description ?? null,
        provenance: format?.provenance ?? null,
      }}
    />
  );
}

/// Closing ends the period. Nothing configured here is deleted — a past matter must
/// still resolve the unit or cost centre it named.
export function CloseRecord({
  entity,
  id,
  label,
}: {
  entity: "OrgUnit" | "CostCentre" | "AccountCode" | "Site";
  id: string;
  label: string;
}) {
  return (
    <RecordEditor
      title={`Close ${label}`}
      description="Its period ends today. Records that already name it keep resolving to it."
      fields={[
        { kind: "hidden", name: "entity" },
        { kind: "hidden", name: "id" },
      ]}
      values={{ entity, id }}
      action={closeRecord}
      submitLabel="Close"
      destructive={{ reasonLabel: "Why is it being closed?" }}
      trigger={{ label: "Close", className: "btn btn--sm btn--ghost" }}
      size=" modal--sm"
    />
  );
}
