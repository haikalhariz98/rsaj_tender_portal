"use client";

import { DataList, type Row } from "@/components/data-list";

import { RemoveOfficerDrawer, SubstituteOfficerDrawer } from "./prep-editors";

type Allowed = { allowed: true } | { allowed: false; reason: string };

/**
 * The officers named on the exercise, as the shared list. The rows are data from the server; the per-row controls are drawn here, because a
 * list's `actions` is a function and cannot cross from a server component. Replace and take off are offered only where the rules allow
 * them (the server asks the same rules again when they are used).
 */
export function OfficersList({
  exerciseId,
  rows,
  names,
  candidates,
  substitute,
  remove,
}: {
  exerciseId: string;
  rows: Row[];
  /// Each row's officer by the row's id, for the drawers' titles.
  names: Record<string, string>;
  candidates: { value: string; label: string }[];
  substitute: Allowed & { controlled?: boolean };
  remove: Allowed;
}) {
  const nameOf = (id: string) => names[id] ?? "";
  return (
    <DataList
      flat
      selectable={false}
      searchable={false}
      toolbar={false}
      exportName="opening-officers"
      emptyTitle="Nobody is named yet"
      columns={[
        { key: "officer", label: "Officer", mobile: "primary" },
        { key: "seat", label: "Seat", width: "160px", mobile: "meta" },
        { key: "named", label: "Named", width: "260px", mobile: "meta" },
      ]}
      rows={rows}
      actionsWidth={300}
      actions={(id) => (
        <>
          {substitute.allowed && <SubstituteOfficerDrawer exerciseId={exerciseId} officerId={id} name={nameOf(id)} candidates={candidates} controlled={!!substitute.controlled} />}
          {remove.allowed && <RemoveOfficerDrawer exerciseId={exerciseId} officerId={id} name={nameOf(id)} />}
        </>
      )}
    />
  );
}
