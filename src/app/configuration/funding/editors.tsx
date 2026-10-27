"use client";

import { DataList, type Row } from "@/components/data-list";
import { HistoryButton } from "@/components/history-drawer";
import { ChartIcon, FileIcon, PencilIcon, ScaleIcon } from "@/components/icons";
import { RecordEditor, type Field } from "@/components/record-editor";
import { Tabs } from "@/components/tabs";
import { buttonClass, iconButtonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ELIGIBILITY_WORDS, eligibilityKey } from "@/lib/funding/labels";

import { saveFundingSource, saveImpactMeasure, saveProjectCategory, setFundingRowRetired } from "./actions";

/**
 * Settings › Funding (ADR 0046): three lists, each a DataList with its drawer. No field carries a default; a code is asked once, when a
 * row is added, and is never shown on a screen.
 */

type Provenance = "STATED" | "OBSERVED" | "ASSUMED";
interface Base {
  id: string;
  nameEn: string;
  provenance: Provenance;
  governingSource: string;
  sortOrder: number;
  /// The day it is retired from, as a day; null while in use.
  retiredOn: string | null;
  /// Retired by the organisation's today.
  retired: boolean;
  retiredText: string | null;
}
export interface SourceItem extends Base {
  /// Sen, as an integer's text; null: none set.
  envelopeSen: string | null;
  envelope: string | null;
  categoriesRestricted: boolean | null;
  eligibleCategoryCodes: string[];
  eligibilityProvenance: Provenance | null;
  notes: string;
}
export type CategoryItem = Base & { code: string };
export interface MeasureItem extends Base {
  unit: string;
}
export interface FundingScreenData {
  view: string | null;
  today: string | null;
  sources: SourceItem[];
  categories: CategoryItem[];
  measures: MeasureItem[];
}

const PROVENANCE_OPTIONS = [
  { value: "STATED", label: "Stated — written in a governing document" },
  { value: "OBSERVED", label: "Observed — seen in practice" },
  { value: "ASSUMED", label: "Assumed — a working default, needs sign-off" },
];
const hidden = (name: string): Field => ({ kind: "hidden", name });
const PROVENANCE: Field = { kind: "select", name: "provenance", label: "Basis", required: true, placeholder: "Choose", options: PROVENANCE_OPTIONS };
const SOURCE: Field = { kind: "text", name: "governingSource", label: "Source", placeholder: "e.g. Requirements, SF-01" };
const ORDER: Field = { kind: "number", name: "sortOrder", label: "Order", min: 0 };
const code = (editing: boolean): Field[] => (editing ? [] : [{ kind: "text", name: "code", label: "Code", required: true, mono: true, hint: "Fixed once saved. Never shown on a screen." }]);
const editTrigger = (label: string) => ({ label: `Edit ${label}`, iconOnly: <PencilIcon size={15} />, className: iconButtonClass("sm") });
const addTrigger = (label: string) => ({ label, icon: true, className: buttonClass("primary", "sm") });
const status = (x: Base): Row["cells"][string] => (x.retiredText ? { kind: "chip", text: x.retiredText, tone: x.retired ? undefined : "warn" } : { kind: "chip", text: "In use", tone: "ok" });

export function FundingScreen(data: FundingScreenData) {
  return (
    <Tabs
      label="Funding"
      initial={data.view ?? undefined}
      tabs={[
        { id: "sources", label: "Funding sources", count: data.sources.length, panel: <SourcesView {...data} /> },
        { id: "categories", label: "Project categories", count: data.categories.length, panel: <CategoriesView {...data} /> },
        { id: "measures", label: "Impact measures", count: data.measures.length, panel: <MeasuresView {...data} /> },
      ]}
    />
  );
}

function RowTools({ entity, item, editor, today }: { entity: "FundingSource" | "ProjectCategory" | "ImpactMeasure"; item: Base; editor: React.ReactNode; today: string | null }) {
  return (
    <>
      {entity === "FundingSource" && <HistoryButton iconOnly entity="FundingSource" entityId={item.id} label={item.nameEn} />}
      {entity === "ProjectCategory" && <HistoryButton iconOnly entity="ProjectCategory" entityId={item.id} label={item.nameEn} />}
      {entity === "ImpactMeasure" && <HistoryButton iconOnly entity="ImpactMeasure" entityId={item.id} label={item.nameEn} />}
      {editor}
      {item.retiredOn ? <RestoreRow entity={entity} id={item.id} label={item.nameEn} /> : <RetireRow entity={entity} id={item.id} label={item.nameEn} today={today} />}
    </>
  );
}

// ----------------------------------------------------------------------- sources

function eligibilityText(s: SourceItem, categories: CategoryItem[]): string {
  if (s.categoriesRestricted !== true) return ELIGIBILITY_WORDS[eligibilityKey(s.categoriesRestricted)];
  return s.eligibleCategoryCodes.map((c) => categories.find((x) => x.code === c)?.nameEn ?? "A category no longer configured").join(", ");
}

function SourcesView({ sources, categories, today }: FundingScreenData) {
  const rows: Row[] = sources.map((s) => ({
    id: s.id,
    views: [s.retired ? "retired" : "inuse"],
    search: [s.nameEn, eligibilityText(s, categories)].join(" "),
    cells: {
      name: { kind: "text", text: s.nameEn },
      envelope: s.envelopeSen == null ? { kind: "text", text: "Not set", dim: true } : { kind: "money", sen: s.envelopeSen },
      eligible: s.categoriesRestricted == null ? { kind: "chip", text: ELIGIBILITY_WORDS.NOT_SET, tone: "warn" } : { kind: "text", text: eligibilityText(s, categories) },
      status: status(s),
    },
  }));
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<ScaleIcon size={17} />} title="Funding sources" actions={<SourceEditor categories={categories} />} divided={false} />
      <DataList
        flat
        selectable={false}
        exportName="funding-sources"
        searchPlaceholder="Search funding sources"
        emptyTitle="No funding source yet"
        views={[
          { id: "inuse", label: "In use" },
          { id: "retired", label: "No longer used" },
        ]}
        columns={[
          { key: "name", label: "Name", sortable: true, mobile: "primary" },
          { key: "envelope", label: "Envelope", width: "160px", sortable: true, mobile: "meta" },
          { key: "eligible", label: "Eligible categories", width: "220px", mobile: "meta" },
          { key: "status", label: "Status", width: "140px", mobile: "meta" },
        ]}
        rows={rows}
        // History, Edit and "Stop using" or "Restore".
        actionsWidth={184}
        actions={(id) => {
          const s = sources.find((x) => x.id === id);
          return s ? <RowTools entity="FundingSource" item={s} today={today} editor={<SourceEditor source={s} categories={categories} />} /> : null;
        }}
      />
    </Card>
  );
}

function SourceEditor({ source, categories }: { source?: SourceItem; categories: CategoryItem[] }) {
  const offered = categories.filter((c) => !c.retired || source?.eligibleCategoryCodes.includes(c.code)).map((c) => ({ value: c.code, label: c.nameEn }));
  const eligibility = source ? (source.categoriesRestricted == null ? null : source.categoriesRestricted ? "ONLY" : "ANY") : null;
  return (
    <RecordEditor
      title={source?.nameEn ?? "Add a funding source"}
      description={source ? "Funding source" : "Where the money comes from."}
      columns={2}
      fields={[
        ...(source ? [hidden("id")] : []),
        { kind: "text", name: "nameEn", label: "Name", required: true, placeholder: "e.g. Sukuk Tranche 1 2026" },
        ...code(!!source),
        { kind: "money", name: "envelope", label: "Envelope", hint: "Empty: no envelope." },
        { kind: "select", name: "eligibility", label: "Eligible categories", placeholder: ELIGIBILITY_WORDS.NOT_SET, options: [{ value: "ANY", label: ELIGIBILITY_WORDS.ANY }, { value: "ONLY", label: ELIGIBILITY_WORDS.ONLY }] },
        { kind: "tokens", name: "eligibleCategoryCodes", label: "Categories", placeholder: offered.length ? "Choose categories" : "No project category yet", options: offered },
        { kind: "select", name: "eligibilityProvenance", label: "Basis of the eligibility", placeholder: "Not recorded", options: PROVENANCE_OPTIONS },
        PROVENANCE,
        SOURCE,
        ORDER,
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      showWhen={{ eligibleCategoryCodes: { name: "eligibility", in: ["ONLY"] }, eligibilityProvenance: { name: "eligibility", in: ["ANY", "ONLY"] } }}
      values={
        source
          ? {
              id: source.id,
              nameEn: source.nameEn,
              envelope: source.envelope,
              eligibility,
              eligibilityProvenance: source.eligibilityProvenance,
              provenance: source.provenance,
              governingSource: source.governingSource,
              sortOrder: String(source.sortOrder),
              notes: source.notes,
              eligibleCategoryCodes: source.eligibleCategoryCodes.join("\n"),
            }
          : undefined
      }
      action={saveFundingSource}
      submitLabel={source ? undefined : "Add funding source"}
      trigger={source ? editTrigger(source.nameEn) : addTrigger("Add funding source")}
      size="lg"
    />
  );
}

// -------------------------------------------------------------------- categories

function CategoriesView({ categories, today }: FundingScreenData) {
  const rows: Row[] = categories.map((c) => ({
    id: c.id,
    views: [c.retired ? "retired" : "inuse"],
    search: c.nameEn,
    cells: { name: { kind: "text", text: c.nameEn }, status: status(c) },
  }));
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<FileIcon size={17} />} title="Project categories" actions={<CategoryEditor />} divided={false} />
      <DataList
        flat
        selectable={false}
        exportName="project-categories"
        searchPlaceholder="Search project categories"
        emptyTitle="No project category yet"
        views={[
          { id: "inuse", label: "In use" },
          { id: "retired", label: "No longer used" },
        ]}
        columns={[
          { key: "name", label: "Name", sortable: true, mobile: "primary" },
          { key: "status", label: "Status", width: "140px", mobile: "meta" },
        ]}
        rows={rows}
        // History, Edit and "Stop using" or "Restore".
        actionsWidth={184}
        actions={(id) => {
          const c = categories.find((x) => x.id === id);
          return c ? <RowTools entity="ProjectCategory" item={c} today={today} editor={<CategoryEditor category={c} />} /> : null;
        }}
      />
    </Card>
  );
}

function CategoryEditor({ category }: { category?: CategoryItem }) {
  return (
    <RecordEditor
      title={category?.nameEn ?? "Add a project category"}
      description={category ? "Project category" : "What a project is for, as funding eligibility reads it."}
      fields={[...(category ? [hidden("id")] : []), { kind: "text", name: "nameEn", label: "Name", required: true, placeholder: "e.g. Water storage" }, ...code(!!category), PROVENANCE, SOURCE, ORDER]}
      values={category ? { id: category.id, nameEn: category.nameEn, provenance: category.provenance, governingSource: category.governingSource, sortOrder: String(category.sortOrder) } : undefined}
      action={saveProjectCategory}
      submitLabel={category ? undefined : "Add category"}
      trigger={category ? editTrigger(category.nameEn) : addTrigger("Add category")}
    />
  );
}

// ---------------------------------------------------------------------- measures

function MeasuresView({ measures, today }: FundingScreenData) {
  const rows: Row[] = measures.map((m) => ({
    id: m.id,
    views: [m.retired ? "retired" : "inuse"],
    search: [m.nameEn, m.unit].join(" "),
    cells: { name: { kind: "text", text: m.nameEn }, unit: { kind: "text", text: m.unit }, status: status(m) },
  }));
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<ChartIcon size={17} />} title="Impact measures" actions={<MeasureEditor />} divided={false} />
      <DataList
        flat
        selectable={false}
        exportName="impact-measures"
        searchPlaceholder="Search impact measures"
        emptyTitle="No impact measure yet"
        views={[
          { id: "inuse", label: "In use" },
          { id: "retired", label: "No longer used" },
        ]}
        columns={[
          { key: "name", label: "Name", sortable: true, mobile: "primary" },
          { key: "unit", label: "Unit", width: "140px", mobile: "meta" },
          { key: "status", label: "Status", width: "140px", mobile: "meta" },
        ]}
        rows={rows}
        // History, Edit and "Stop using" or "Restore".
        actionsWidth={184}
        actions={(id) => {
          const m = measures.find((x) => x.id === id);
          return m ? <RowTools entity="ImpactMeasure" item={m} today={today} editor={<MeasureEditor measure={m} />} /> : null;
        }}
      />
    </Card>
  );
}

function MeasureEditor({ measure }: { measure?: MeasureItem }) {
  return (
    <RecordEditor
      title={measure?.nameEn ?? "Add an impact measure"}
      description={measure ? "Impact measure" : "A figure reported for each project."}
      fields={[
        ...(measure ? [hidden("id")] : []),
        { kind: "text", name: "nameEn", label: "Name", required: true, placeholder: "e.g. Storage added" },
        { kind: "text", name: "unit", label: "Unit", required: true, placeholder: "e.g. ML" },
        ...code(!!measure),
        PROVENANCE,
        SOURCE,
        ORDER,
      ]}
      values={measure ? { id: measure.id, nameEn: measure.nameEn, unit: measure.unit, provenance: measure.provenance, governingSource: measure.governingSource, sortOrder: String(measure.sortOrder) } : undefined}
      action={saveImpactMeasure}
      submitLabel={measure ? undefined : "Add measure"}
      trigger={measure ? editTrigger(measure.nameEn) : addTrigger("Add measure")}
    />
  );
}

// ---------------------------------------------------------------- retire, restore

function RetireRow({ entity, id, label, today }: { entity: string; id: string; label: string; today: string | null }) {
  return (
    <RecordEditor
      title={`Stop using ${label}`}
      description="No longer offered from the day given. Records that name it keep it."
      fields={[hidden("entity"), hidden("id"), { kind: "date", name: "retiredOn", label: "No longer used from", required: true }]}
      values={{ entity, id, retiredOn: today }}
      action={setFundingRowRetired}
      submitLabel="Stop using"
      destructive={{ reasonLabel: "Why is it no longer used?" }}
      trigger={{ label: "Stop using", className: buttonClass("ghost", "sm"), ariaLabel: `Stop using ${label}` }}
      size="sm"
    />
  );
}

function RestoreRow({ entity, id, label }: { entity: string; id: string; label: string }) {
  return (
    <RecordEditor
      title={`Restore ${label}`}
      description="Offered again from today."
      fields={[hidden("entity"), hidden("id"), hidden("restore")]}
      values={{ entity, id, restore: "1" }}
      action={setFundingRowRetired}
      submitLabel="Restore"
      reason={{ label: "Why is it used again?" }}
      trigger={{ label: "Restore", className: buttonClass("ghost", "sm"), ariaLabel: `Restore ${label}` }}
      size="sm"
    />
  );
}
