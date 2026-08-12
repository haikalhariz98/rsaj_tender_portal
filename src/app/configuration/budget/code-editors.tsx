"use client";

import { ChartIcon, PencilIcon } from "@/components/icons";
import { RecordEditor, type Field } from "@/components/record-editor";
import type { BudgetCode, Figures } from "@/lib/budget/codes";
import { formatSen } from "@/lib/money";

import { saveBudgetCode } from "./actions";

type Person = { id: string; name: string; isActive: boolean };
type Unit = { code: string; nameEn: string };
type Account = { code: string; nameEn: string };

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * The budget code form, in the sample's order.
 *
 * Type and owning department come first because they decide where the code is
 * looked for; the money never appears here. What a code is worth is the movement
 * ledger, and a form that let somebody type an allocation would be a second place
 * for the same number to live.
 */
function budgetCodeFields(units: Unit[], people: Person[], accounts: Account[]): Field[] {
  return [
    {
      kind: "select",
      name: "type",
      label: "Type",
      placeholder: "Not set",
      // The sample offers Capital and Operating. Which kinds a customer runs is
      // theirs to say, so the options come from what has already been used plus
      // whatever they type — never a list fixed here.
      options: [
        { value: "Capital", label: "Capital" },
        { value: "Operating", label: "Operating" },
      ],
    },
    {
      kind: "select",
      name: "owningUnitCode",
      label: "Owning department",
      placeholder: "Not set",
      options: units.map((u) => ({ value: u.code, label: u.nameEn })),
      orphanLabel: "A department no longer configured",
    },
    { kind: "text", name: "descriptionEn", label: "Description (EN)", required: true },
    { kind: "text", name: "descriptionMs", label: "Description (BM)" },
    {
      kind: "text",
      name: "accountCode",
      label: "Account code",
      required: true,
      mono: true,
      hint: accounts.length
        ? "As it is in the finance system. Checked against the chart of accounts on save."
        : "As it is in the finance system.",
    },
    {
      kind: "select",
      name: "holderPersonId",
      label: "Budget holder",
      placeholder: "Nobody named",
      options: people.filter((p) => p.isActive).map((p) => ({ value: p.id, label: p.name })),
      orphanLabel: "Somebody no longer on record",
    },
    { kind: "date", name: "effectiveFrom", label: "Active period", required: true },
    { kind: "date", name: "effectiveTo", label: "—" },
    {
      kind: "switch",
      name: "isActive",
      label: "Active",
      hint: "Switch off to stop offering this anywhere in the portal.",
    },
  ];
}

export function AddBudgetCode({
  units,
  people,
  accountCodes,
}: {
  units: Unit[];
  people: Person[];
  accountCodes: Account[];
}) {
  return (
    <RecordEditor
      title="New budget code"
      description="Budget code"
      icon={<ChartIcon size={20} className="icon dim" style={{ marginTop: 2 }} />}
      columns={2}
      fields={[
        { kind: "text", name: "code", label: "Code", required: true, mono: true },
        ...budgetCodeFields(units, people, accountCodes),
      ]}
      action={saveBudgetCode}
      submitLabel="Save"
      trigger={{ label: "New budget code", icon: true }}
      size="lg"
    />
  );
}

export function EditBudgetCode({
  budgetCode,
  figures,
  threshold,
  units,
  people,
  accountCodes,
}: {
  budgetCode: BudgetCode;
  /// Read from the ledger, shown at the top of the drawer, and not editable here.
  figures: Figures;
  threshold: number | null;
  units: Unit[];
  people: Person[];
  accountCodes: Account[];
}) {
  const over = threshold != null && figures.utilisation != null && figures.utilisation >= threshold;

  return (
    <RecordEditor
      title={budgetCode.descriptionEn}
      description={budgetCode.code}
      icon={<ChartIcon size={20} className="icon dim" style={{ marginTop: 2 }} />}
      columns={2}
      fields={[
        { kind: "hidden", name: "id" },
        ...budgetCodeFields(units, people, accountCodes),
      ]}
      action={saveBudgetCode}
      trigger={{ label: "Edit", iconOnly: <PencilIcon size={14} /> }}
      size="lg"
      identity={
        <>
          <div className="row wrap" style={{ gap: 24 }}>
            <Figure label="Allocated" value={formatSen(figures.allocated)} />
            <Figure label="Committed" value={formatSen(figures.committed)} />
            <Figure label="Actual spend" value={formatSen(figures.actualSpend)} />
            <Figure label="Available" value={formatSen(figures.available)} strong />
          </div>
          {figures.utilisation == null ? (
            <span className="xs dim">Nothing allocated yet, so there is no utilisation to show.</span>
          ) : (
            <div className="cfg-meter">
              <span className="cfg-meter__t">
                <span
                  className="cfg-meter__f"
                  data-tone={over ? "warn" : ""}
                  style={{ width: `${Math.min(figures.utilisation, 100)}%` }}
                />
                {threshold != null && (
                  <span className="cfg-meter__m" style={{ left: `${threshold}%` }} />
                )}
              </span>
              <span className="cfg-meter__v">{Math.round(figures.utilisation)}%</span>
            </div>
          )}
        </>
      }
      values={{
        id: budgetCode.id,
        code: budgetCode.code,
        type: budgetCode.type,
        owningUnitCode: budgetCode.owningUnitCode,
        descriptionEn: budgetCode.descriptionEn,
        descriptionMs: budgetCode.descriptionMs,
        accountCode: budgetCode.accountCode,
        holderPersonId: budgetCode.holderPersonId,
        effectiveFrom: day(budgetCode.effectiveFrom),
        effectiveTo: day(budgetCode.effectiveTo),
        isActive: budgetCode.isActive,
      }}
    />
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="lbl">{label}</div>
      <div className="sm strong">
        <span className={strong ? "num strong" : "num"}>{value}</span>
      </div>
    </div>
  );
}
