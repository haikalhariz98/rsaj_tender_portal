"use client";

import { useTransition, useState } from "react";

import { AlertTriangle, BuildingIcon, PencilIcon, SaveIcon } from "@/components/icons";
import { EMPTY_FORM_STATE, RecordEditor, type Field, type FormState } from "@/components/record-editor";
import type { CostCentre, OrgUnit, OrgUnitKind, Site } from "@/lib/organisation/types";

import { saveCostCentre, saveOrgUnit, saveSite } from "./actions";

type Person = { id: string; name: string; isActive: boolean };

const KIND_OPTIONS: { value: OrgUnitKind; label: string }[] = [
  { value: "COMPANY", label: "Company" },
  { value: "DIVISION", label: "Division" },
  { value: "DEPARTMENT", label: "Department" },
  { value: "SECTION", label: "Section" },
];

const personOptions = (people: Person[]) =>
  people.filter((p) => p.isActive).map((p) => ({ value: p.id, label: p.name }));

/**
 * The fields a unit carries.
 *
 * A company holds registration, tax, address and the rest; nothing else does. The
 * form asks only for what the kind carries, and `saveOrgUnit` writes only what the
 * form posted — a department edit must leave a company's details alone, and on a
 * shared nullable table nothing would complain if it did not.
 */
export function unitFields(kind: OrgUnitKind, units: OrgUnit[], people: Person[]): Field[] {
  const common: Field[] = [
    { kind: "text", name: "code", label: "Code", required: true, mono: true },
    {
      kind: "select",
      name: "headPersonId",
      label: "Head",
      placeholder: "—",
      options: personOptions(people),
      orphanLabel: "Somebody no longer on record",
    },
    { kind: "text", name: "nameEn", label: "Name (EN)", required: true },
    { kind: "text", name: "nameMs", label: "Name (BM)" },
  ];

  if (kind !== "COMPANY") return common;

  return [
    ...common,
    { kind: "text", name: "registrationNumber", label: "Registration number", mono: true },
    { kind: "text", name: "taxReference", label: "Tax reference", mono: true },
    { kind: "text", name: "telephone", label: "Telephone" },
    {
      kind: "text",
      name: "financialYearStart",
      label: "Financial year starts",
      placeholder: "MM-DD",
      hint: "The day it turns, every year. 01-01 for a calendar year.",
    },
    { kind: "textarea", name: "address", label: "Address" },
    { kind: "text", name: "operatingLicence", label: "Operating licence" },
  ];
}

function unitValues(unit: OrgUnit): Record<string, string | null> {
  return {
    id: unit.code,
    code: unit.code,
    headPersonId: unit.headPersonId,
    nameEn: unit.nameEn,
    nameMs: unit.nameMs,
    registrationNumber: unit.registrationNumber,
    taxReference: unit.taxReference,
    telephone: unit.telephone,
    financialYearStart: unit.financialYearStart,
    address: unit.address,
    operatingLicence: unit.operatingLicence,
  };
}

/**
 * The selected unit's details, edited in place.
 *
 * Not a drawer: the sample puts this form in the card itself, and the tree beside it
 * is how you move between records. A drawer would put a lid over the thing the tree
 * exists to show.
 */
export function UnitForm({
  unit,
  units,
  people,
}: {
  unit: OrgUnit;
  units: OrgUnit[];
  people: Person[];
}) {
  const [state, setState] = useState<FormState>(EMPTY_FORM_STATE);
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);

  const fields = unitFields(unit.kind, units, people);
  const values = unitValues(unit);

  const submit = (data: FormData) => {
    startTransition(async () => {
      const result = await saveOrgUnit(EMPTY_FORM_STATE, data);
      setState(result);
      if (result.ok) setDirty(false);
    });
  };

  return (
    <form action={submit} onChange={() => setDirty(true)}>
      <div className="stack stack--lg">
        {state.message && (
          <div className="callout callout--err">
            <span className="callout__ico">
              <AlertTriangle size={17} />
            </span>
            <div className="grow">
              <span className="sm">{state.message}</span>
            </div>
          </div>
        )}

        <input type="hidden" name="id" value={unit.code} />
        <input type="hidden" name="kind" value={unit.kind} />

        <div className="grid g2" style={{ gap: 16 }}>
          {fields.map((field) => (
            <UnitField
              key={"name" in field ? field.name : field.kind}
              field={field}
              value={"name" in field ? (values[field.name] ?? "") : ""}
              error={"name" in field ? state.errors?.[field.name] : undefined}
            />
          ))}
        </div>

        {dirty && (
          <div className="row">
            <div className="spacer" />
            <button type="submit" className="btn btn--primary btn--sm" disabled={pending}>
              <SaveIcon size={15} />
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}

/// One field of the in-card form. The drawer's `FieldInput` is not reusable here —
/// it is private to the record editor and this form has no drawer around it.
function UnitField({
  field,
  value,
  error,
}: {
  field: Field;
  value: string;
  error?: string;
}) {
  if (field.kind === "hidden" || field.kind === "note") return null;

  const required = "required" in field && field.required;
  const hint = "hint" in field ? field.hint : undefined;

  const label = (
    <span className="field__lbl">
      {field.label}
      {required && (
        <span className="field__req" aria-hidden="true">
          *
        </span>
      )}
    </span>
  );

  const foot = error ? (
    <span className="field__err">
      <AlertTriangle size={13} />
      {error}
    </span>
  ) : hint ? (
    <span className="field__hint">{hint}</span>
  ) : null;

  if (field.kind === "select") {
    const orphaned = value !== "" && !field.options.some((o) => o.value === value);
    return (
      <label className="field">
        {label}
        <select className="select" name={field.name} defaultValue={value}>
          <option value="">{field.placeholder ?? "Not set"}</option>
          {orphaned && <option value={value}>{field.orphanLabel ?? value}</option>}
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {foot}
      </label>
    );
  }

  if (field.kind === "textarea") {
    return (
      <label className="field">
        {label}
        <textarea className="textarea" name={field.name} rows={3} defaultValue={value} />
        {foot}
      </label>
    );
  }

  return (
    <label className="field">
      {label}
      <input
        className={"mono" in field && field.mono ? "input input--mono" : "input"}
        name={field.name}
        placeholder={"placeholder" in field ? field.placeholder : undefined}
        defaultValue={value}
      />
      {foot}
    </label>
  );
}

export function AddOrgUnit({ units, people }: { units: OrgUnit[]; people: Person[] }) {
  return (
    <RecordEditor
      title="Add a unit"
      description="A company, division, department or section."
      icon={<BuildingIcon size={20} className="icon dim" style={{ marginTop: 2 }} />}
      columns={2}
      fields={[
        {
          kind: "select",
          name: "kind",
          label: "Tier",
          required: true,
          placeholder: "Choose",
          options: KIND_OPTIONS,
        },
        {
          kind: "select",
          name: "parentCode",
          label: "Sits under",
          placeholder: "Nothing — it is a top-level unit",
          options: units.map((u) => ({ value: u.code, label: u.nameEn })),
        },
        ...unitFields("COMPANY", units, people),
        { kind: "date", name: "effectiveFrom", label: "In force from", required: true },
      ]}
      action={saveOrgUnit}
      submitLabel="Add unit"
      trigger={{ label: "Add unit", icon: true }}
      size="lg"
    />
  );
}

// ------------------------------------------------------------------ cost centres

function costCentreFields(units: OrgUnit[], sites: Site[], people: Person[]): Field[] {
  return [
    {
      kind: "text",
      name: "code",
      label: "Code",
      required: true,
      mono: true,
      hint: "What finance posts against. The customer's own shape, not one this system composes.",
    },
    { kind: "text", name: "nameEn", label: "Name", required: true },
    {
      kind: "select",
      name: "orgUnitCode",
      label: "Department",
      placeholder: "Not set",
      options: units.map((u) => ({ value: u.code, label: u.nameEn })),
    },
    {
      kind: "select",
      name: "siteCode",
      label: "Site",
      placeholder: "Not set",
      options: sites.map((s) => ({ value: s.code, label: s.nameEn })),
    },
    { kind: "text", name: "activity", label: "Activity" },
    {
      kind: "select",
      name: "ownerPersonId",
      label: "Cost centre owner",
      placeholder: "Nobody named",
      options: personOptions(people),
      orphanLabel: "Somebody no longer on record",
    },
    { kind: "date", name: "effectiveFrom", label: "In force from", required: true },
    {
      kind: "date",
      name: "effectiveTo",
      label: "Closed from",
      hint: "Leave empty while it is still in use.",
    },
  ];
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export function AddCostCentre({
  units,
  sites,
  people,
}: {
  units: OrgUnit[];
  sites: Site[];
  people: Person[];
}) {
  return (
    <RecordEditor
      title="Add a cost centre"
      description="What spending is charged to."
      columns={2}
      fields={costCentreFields(units, sites, people)}
      action={saveCostCentre}
      submitLabel="Add cost centre"
      trigger={{ label: "Add cost centre", icon: true }}
      size="lg"
    />
  );
}

export function EditCostCentre({
  centre,
  units,
  sites,
  people,
}: {
  centre: CostCentre;
  units: OrgUnit[];
  sites: Site[];
  people: Person[];
}) {
  return (
    <RecordEditor
      title={centre.nameEn}
      description="Cost centre"
      columns={2}
      fields={[{ kind: "hidden", name: "id" }, ...costCentreFields(units, sites, people)]}
      action={saveCostCentre}
      trigger={{ label: "Edit", iconOnly: <PencilIcon size={14} /> }}
      size="lg"
      values={{
        id: centre.code,
        code: centre.code,
        nameEn: centre.nameEn,
        orgUnitCode: centre.orgUnitCode,
        siteCode: centre.siteCode,
        activity: centre.activity,
        ownerPersonId: centre.ownerPersonId,
        effectiveFrom: day(centre.effectiveFrom),
        effectiveTo: day(centre.effectiveTo),
      }}
    />
  );
}

// -------------------------------------------------------------------------- sites

function siteFields(units: OrgUnit[]): Field[] {
  return [
    { kind: "text", name: "code", label: "Code", required: true, mono: true },
    { kind: "text", name: "nameEn", label: "Site", required: true },
    { kind: "text", name: "kind", label: "Kind" },
    { kind: "text", name: "town", label: "Town" },
    { kind: "text", name: "district", label: "District" },
    {
      kind: "select",
      name: "orgUnitCode",
      label: "Looked after by",
      placeholder: "Not set",
      options: units.map((u) => ({ value: u.code, label: u.nameEn })),
    },
    { kind: "textarea", name: "address", label: "Address" },
    { kind: "date", name: "effectiveFrom", label: "In force from", required: true },
    {
      kind: "date",
      name: "effectiveTo",
      label: "Closed from",
      hint: "Leave empty while it is still in use.",
    },
  ];
}

export function AddSite({ units }: { units: OrgUnit[] }) {
  return (
    <RecordEditor
      title="Add a site"
      description="Where the work happens."
      columns={2}
      fields={siteFields(units)}
      action={saveSite}
      submitLabel="Add site"
      trigger={{ label: "Add site", icon: true }}
      size="lg"
    />
  );
}

export function EditSite({ site, units }: { site: Site; units: OrgUnit[] }) {
  return (
    <RecordEditor
      title={site.nameEn}
      description="Site"
      columns={2}
      fields={[{ kind: "hidden", name: "id" }, ...siteFields(units)]}
      action={saveSite}
      trigger={{ label: "Edit", iconOnly: <PencilIcon size={14} /> }}
      size="lg"
      values={{
        id: site.code,
        code: site.code,
        nameEn: site.nameEn,
        kind: site.kind,
        town: site.town,
        district: site.district,
        orgUnitCode: site.orgUnitCode,
        address: site.address,
        effectiveFrom: day(site.effectiveFrom),
        effectiveTo: day(site.effectiveTo),
      }}
    />
  );
}
