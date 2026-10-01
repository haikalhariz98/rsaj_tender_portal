"use client";

import { BuildingIcon, PencilIcon } from "@/components/icons";
import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass, iconButtonClass } from "@/components/ui/button";
import type { CostCentre, OrgUnit, OrgUnitKind, Site } from "@/lib/organisation/types";
import { timeZoneLabel } from "@/lib/time-zone-label";

import { DETAIL_LABEL, type Details } from "@/lib/organisation/details";

import { saveCostCentre, saveDetails, saveOrgUnit, saveSite, saveTimeZone } from "./actions";

type Person = { id: string; name: string; isActive: boolean };

export const KIND_LABEL: Record<OrgUnitKind, string> = {
  COMPANY: "Company",
  DIVISION: "Division",
  DEPARTMENT: "Department",
  SECTION: "Section",
};

const personOptions = (people: Person[]) =>
  people.filter((p) => p.isActive).map((p) => ({ value: p.id, label: p.name }));

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * The fields a unit carries, by tier.
 *
 * A company holds registration, tax, address and the rest; nothing else does. The
 * form asks only for what the tier carries, and `saveOrgUnit` writes only what the
 * form posted — a department edit must leave a company's details alone.
 */
function unitFields(kind: OrgUnitKind, people: Person[]): Field[] {
  const common: Field[] = [
    { kind: "text", name: "nameEn", label: "Name (EN)", required: true },
    { kind: "text", name: "nameMs", label: "Name (BM)" },
    {
      kind: "select",
      name: "headPersonId",
      label: kind === "COMPANY" ? "Chief executive" : `Head of ${KIND_LABEL[kind].toLowerCase()}`,
      placeholder: "Nobody named",
      options: personOptions(people),
      orphanLabel: "Somebody no longer on record",
      hint: "Endorsements and approvals that go to the head of this unit find them here.",
    },
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

/**
 * Add a unit of a given tier under a given parent.
 *
 * Both are decided by where the button is — "Add department" on a division — so the
 * drawer does not ask again. A company is the one tier added with no parent.
 */
export function AddOrgUnit({
  kind,
  parent,
  people,
  variant = "secondary",
}: {
  kind: OrgUnitKind;
  parent: OrgUnit | null;
  people: Person[];
  variant?: "primary" | "secondary" | "ghost";
}) {
  const label = `Add ${KIND_LABEL[kind].toLowerCase()}`;
  return (
    <RecordEditor
      title={label}
      description={parent ? `Under ${parent.nameEn}.` : "A top-level unit."}
      icon={<BuildingIcon size={18} />}
      columns={2}
      fields={[
        { kind: "hidden", name: "kind" },
        { kind: "hidden", name: "parentCode" },
        {
          kind: "text",
          name: "code",
          label: "Code",
          required: true,
          mono: true,
          hint: "Set once. Records elsewhere refer to it, so it cannot be changed later.",
        },
        ...unitFields(kind, people),
        { kind: "date", name: "effectiveFrom", label: "In force from", required: true },
      ]}
      values={{ kind, parentCode: parent?.code ?? "" }}
      action={saveOrgUnit}
      submitLabel={label}
      trigger={{ label, icon: true, className: buttonClass(variant, "sm") }}
      size="lg"
    />
  );
}

export function EditOrgUnit({ unit, people }: { unit: OrgUnit; people: Person[] }) {
  return (
    <RecordEditor
      title={`Edit ${unit.nameEn}`}
      description={KIND_LABEL[unit.kind]}
      icon={<BuildingIcon size={18} />}
      columns={2}
      fields={[
        { kind: "hidden", name: "id" },
        { kind: "hidden", name: "kind" },
        {
          kind: "readonly",
          name: "code",
          label: "Code",
          text: unit.code,
          hint: "Set when the unit was created.",
        },
        ...unitFields(unit.kind, people),
      ]}
      values={{
        id: unit.code,
        kind: unit.kind,
        headPersonId: unit.headPersonId,
        nameEn: unit.nameEn,
        nameMs: unit.nameMs,
        registrationNumber: unit.registrationNumber,
        taxReference: unit.taxReference,
        telephone: unit.telephone,
        financialYearStart: unit.financialYearStart,
        address: unit.address,
        operatingLicence: unit.operatingLicence,
      }}
      action={saveOrgUnit}
      trigger={{ label: "Edit", className: buttonClass("secondary", "sm") }}
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
      label: "Belongs to",
      placeholder: "Not set",
      options: units.map((u) => ({ value: u.code, label: `${u.nameEn} · ${KIND_LABEL[u.kind]}` })),
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

export function AddCostCentre({
  units,
  sites,
  people,
  unit,
  variant = "secondary",
}: {
  units: OrgUnit[];
  sites: Site[];
  people: Person[];
  /// Preset when added from a unit's own panel.
  unit?: OrgUnit;
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <RecordEditor
      title="Add a cost centre"
      description={unit ? `Belonging to ${unit.nameEn}.` : "What spending is charged to."}
      columns={2}
      fields={costCentreFields(units, sites, people)}
      values={unit ? { orgUnitCode: unit.code } : undefined}
      action={saveCostCentre}
      submitLabel="Add cost centre"
      trigger={{ label: "Add cost centre", icon: true, className: buttonClass(variant, "sm") }}
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
      trigger={{ label: `Edit ${centre.nameEn}`, iconOnly: <PencilIcon size={15} />, className: iconButtonClass("sm") }}
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
    { kind: "text", name: "kind", label: "Kind", hint: "Office, plant, reservoir — your own words." },
    { kind: "text", name: "town", label: "Town" },
    { kind: "text", name: "district", label: "District" },
    {
      kind: "select",
      name: "orgUnitCode",
      label: "Looked after by",
      placeholder: "Not set",
      options: units.map((u) => ({ value: u.code, label: `${u.nameEn} · ${KIND_LABEL[u.kind]}` })),
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

export function AddSite({
  units,
  unit,
  variant = "secondary",
}: {
  units: OrgUnit[];
  unit?: OrgUnit;
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <RecordEditor
      title="Add a site"
      description={unit ? `Looked after by ${unit.nameEn}.` : "Where the work happens."}
      columns={2}
      fields={siteFields(units)}
      values={unit ? { orgUnitCode: unit.code } : undefined}
      action={saveSite}
      submitLabel="Add site"
      trigger={{ label: "Add site", icon: true, className: buttonClass(variant, "sm") }}
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
      trigger={{ label: `Edit ${site.nameEn}`, iconOnly: <PencilIcon size={15} />, className: iconButtonClass("sm") }}
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

/// The organisation's time zone. No value is proposed: which zone is the customer's.
export function EditTimeZone({
  timeZone,
  options,
}: {
  timeZone: string | null;
  /// Every zone, already labelled ("Malaysia (Kuala Lumpur, UTC+8)"); the value is the stored name.
  options: { value: string; label: string }[];
}) {
  return (
    <RecordEditor
      title="Time zone"
      description="The zone dates such as today are judged in: whether a vote sheet is dated in the future, the day a matter is tabled."
      fields={[
        {
          kind: "select",
          name: "timeZone",
          label: "Time zone",
          placeholder: "Not set",
          options,
          orphanLabel: timeZone ? timeZoneLabel(timeZone) : undefined,
          hint: "Search by country or city. Left unset, sittings cannot start, table or vote until it is chosen.",
        },
      ]}
      values={{ timeZone }}
      action={saveTimeZone}
      reason={{ label: "Why is it changing?" }}
      trigger={{ label: timeZone ? "Change time zone" : "Set time zone", className: buttonClass("secondary", "sm") }}
      size="sm"
    />
  );
}

/// The organisation's identity details. The hints are examples, never defaults: nothing
/// is filled in for the customer, and only the legal name is required.
export function EditDetails({ details }: { details: Details }) {
  const text = (name: keyof Details, hint?: string, placeholder?: string): Field => ({
    kind: "text",
    name,
    label: DETAIL_LABEL[name],
    hint,
    placeholder,
    required: name === "name",
  });
  return (
    <RecordEditor
      title="Edit organisation details"
      description="Shown across the portal and carried on reports and letters. Documents already issued keep the details they were issued with."
      fields={[
        text("name", "As registered, e.g. Syarikat Contoh Sdn. Bhd."),
        text("nameMs", "Used on Malay documents."),
        text("shortName", "Shown at the top left and on report headers."),
        text("registrationNo", "SSM: 12 digits, e.g. 201901012345 (old form 1234567-A)."),
        text("taxIdentificationNo", "LHDN TIN, e.g. C1234567890."),
        text("sstRegistrationNo", "If registered, e.g. W10-1808-32000123."),
        text("addressLine1"),
        text("addressLine2"),
        text("postcode", "Postcode: 5 digits, e.g. 50450."),
        text("city"),
        text("state"),
        text("country"),
        text("phone", "e.g. +60 3-1234 5678"),
        text("email", "e.g. procurement@example.com.my"),
        text("website", "e.g. https://www.example.com.my"),
      ]}
      values={{ ...details }}
      action={saveDetails}
      trigger={{ label: "Edit details", className: buttonClass("secondary", "sm") }}
      size="lg"
      columns={2}
    />
  );
}
