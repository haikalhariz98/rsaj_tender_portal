import { RecordEditor, type Field } from "@/components/record-editor";
import type { ContractType, FundingRoute, SourcingMethod } from "@/lib/reference/types";

import { retireEntry, saveContractType, saveFundingRoute, saveSourcingMethod } from "./actions";

/**
 * The field declarations behind each Reference data record.
 *
 * Held here rather than in the page so the shape of a record is stated once and the
 * add and edit forms cannot drift apart. Nothing carries a default: a pre-ticked band
 * or a pre-chosen provenance would be this product deciding a customer's policy.
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

const codeField = (hint: string): Field => ({
  kind: "text",
  name: "code",
  label: "Code",
  required: true,
  mono: true,
  hint,
});

function fundingFields(editing: boolean): Field[] {
  return [
    ...(editing ? [] : [codeField("Used internally to join this route to a matter. Never shown on a screen.")]),
    { kind: "text", name: "nameEn", label: "Name", required: true },
    { kind: "text", name: "nameMs", label: "Name (Malay)" },
    {
      kind: "switch",
      name: "organisationProcures",
      label: "The organisation runs the procurement",
      hint: "Leave off where it appoints nobody and only records eligibility, inspection and acceptance.",
    },
    {
      kind: "switch",
      name: "routeDecidedExternally",
      label: "An external body decides the sourcing route",
    },
    {
      kind: "switch",
      name: "supersedesAuthority",
      label: "The funder's rules override the approval matrix",
      hint: "The portal warns on a matter under this route rather than re-routing it.",
    },
    { kind: "text", name: "trigger", label: "Triggered by" },
    { kind: "text", name: "governingSource", label: "Source document" },
    PROVENANCE_FIELD,
    { kind: "number", name: "sortOrder", label: "Order", min: 0 },
    { kind: "textarea", name: "notes", label: "Notes" },
  ];
}

function methodFields(editing: boolean): Field[] {
  return [
    ...(editing ? [] : [codeField("Used internally. Never shown on a screen.")]),
    { kind: "text", name: "nameEn", label: "Name", required: true },
    { kind: "text", name: "nameMs", label: "Name (Malay)" },
    {
      kind: "note",
      text: "Which value bands this method may be used in. The thresholds themselves are set on the approval matrix, not here.",
    },
    { kind: "switch", name: "availableInTender", label: "Available in the tender band" },
    { kind: "switch", name: "availableInQuotation", label: "Available in the quotation band" },
    { kind: "switch", name: "availableBelow", label: "Available below the quotation floor" },
    { kind: "switch", name: "requiresAdvertisement", label: "The exercise is advertised" },
    { kind: "switch", name: "invitesNamedSuppliers", label: "Named suppliers are invited" },
    {
      kind: "switch",
      name: "requiresFreshSourcing",
      label: "Sources afresh",
      hint: "Leave off where the method calls off an existing contract and has no bids.",
    },
    { kind: "text", name: "awardInstrument", label: "Awarded by" },
    { kind: "text", name: "committeeCode", label: "Committee code", mono: true },
    {
      kind: "text",
      name: "authorityMethodKey",
      label: "Approval matrix method key",
      mono: true,
      hint: "Binds this method to the approval rows banded under that key.",
    },
    { kind: "text", name: "governingSource", label: "Source document" },
    PROVENANCE_FIELD,
    { kind: "number", name: "sortOrder", label: "Order", min: 0 },
    { kind: "textarea", name: "notes", label: "Notes" },
  ];
}

function contractFields(editing: boolean): Field[] {
  return [
    ...(editing ? [] : [codeField("Used internally. Never shown on a screen.")]),
    { kind: "text", name: "nameEn", label: "Name", required: true },
    { kind: "text", name: "nameMs", label: "Name (Malay)" },
    { kind: "text", name: "governingSource", label: "Source document" },
    PROVENANCE_FIELD,
    { kind: "number", name: "sortOrder", label: "Order", min: 0 },
    { kind: "textarea", name: "notes", label: "Notes" },
  ];
}

const num = (n: number) => String(n);

export function AddFundingRoute() {
  return (
    <RecordEditor
      title="Add a funding route"
      description="How a matter is funded, and what that decides."
      fields={fundingFields(false)}
      action={saveFundingRoute}
      submitLabel="Add route"
      trigger={{ label: "Add route", icon: true }}
    />
  );
}

export function EditFundingRoute({ route, id }: { route: FundingRoute; id: string }) {
  return (
    <RecordEditor
      title={`Edit ${route.nameEn}`}
      fields={[{ kind: "hidden", name: "id" }, ...fundingFields(true)]}
      action={saveFundingRoute}
      trigger={{ label: "Edit", className: "btn btn--sm btn--ghost" }}
      values={{
        id,
        code: route.code,
        nameEn: route.nameEn,
        nameMs: route.nameMs,
        organisationProcures: route.organisationProcures,
        routeDecidedExternally: route.routeDecidedExternally,
        supersedesAuthority: route.supersedesAuthority,
        trigger: route.trigger,
        governingSource: route.governingSource,
        provenance: route.provenance,
        sortOrder: num(route.sortOrder),
        notes: route.notes,
      }}
    />
  );
}

export function AddSourcingMethod() {
  return (
    <RecordEditor
      title="Add a sourcing method"
      description="How suppliers are approached, and what that decides downstream."
      fields={methodFields(false)}
      action={saveSourcingMethod}
      submitLabel="Add method"
      trigger={{ label: "Add method", icon: true }}
      size="lg"
    />
  );
}

export function EditSourcingMethod({ method, id }: { method: SourcingMethod; id: string }) {
  return (
    <RecordEditor
      title={`Edit ${method.nameEn}`}
      fields={[{ kind: "hidden", name: "id" }, ...methodFields(true)]}
      action={saveSourcingMethod}
      trigger={{ label: "Edit", className: "btn btn--sm btn--ghost" }}
      size="lg"
      values={{
        id,
        code: method.code,
        nameEn: method.nameEn,
        nameMs: method.nameMs,
        availableInTender: method.availableInTender,
        availableInQuotation: method.availableInQuotation,
        availableBelow: method.availableBelow,
        requiresAdvertisement: method.requiresAdvertisement,
        invitesNamedSuppliers: method.invitesNamedSuppliers,
        requiresFreshSourcing: method.requiresFreshSourcing,
        awardInstrument: method.awardInstrument,
        committeeCode: method.committeeCode,
        authorityMethodKey: method.authorityMethodKey,
        governingSource: method.governingSource,
        provenance: method.provenance,
        sortOrder: num(method.sortOrder),
        notes: method.notes,
      }}
    />
  );
}

export function AddContractType() {
  return (
    <RecordEditor
      title="Add a contract type"
      description="What is being bought."
      fields={contractFields(false)}
      action={saveContractType}
      submitLabel="Add type"
      trigger={{ label: "Add type", icon: true }}
      size="sm"
    />
  );
}

export function EditContractType({ type, id }: { type: ContractType; id: string }) {
  return (
    <RecordEditor
      title={`Edit ${type.nameEn}`}
      fields={[{ kind: "hidden", name: "id" }, ...contractFields(true)]}
      action={saveContractType}
      trigger={{ label: "Edit", className: "btn btn--sm btn--ghost" }}
      size="sm"
      values={{
        id,
        code: type.code,
        nameEn: type.nameEn,
        nameMs: type.nameMs,
        governingSource: type.governingSource,
        provenance: type.provenance,
        sortOrder: num(type.sortOrder),
        notes: type.notes,
      }}
    />
  );
}

/// Retiring, not deleting. A matter already run under an entry must still render it.
export function RetireEntry({
  entity,
  id,
  label,
}: {
  entity: "FundingRoute" | "SourcingMethod" | "ContractType";
  id: string;
  label: string;
}) {
  return (
    <RecordEditor
      title={`Retire ${label}`}
      description="It stops being offered from today. Matters already run under it keep showing it."
      fields={[
        { kind: "hidden", name: "entity" },
        { kind: "hidden", name: "id" },
      ]}
      values={{ entity, id }}
      action={retireEntry}
      submitLabel="Retire"
      destructive={{ reasonLabel: "Why is it being retired?" }}
      trigger={{ label: "Retire", className: "btn btn--sm btn--ghost" }}
      size="sm"
    />
  );
}
