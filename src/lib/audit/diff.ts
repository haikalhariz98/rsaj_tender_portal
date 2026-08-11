/**
 * What changed between two versions of a row.
 *
 * Pure. The audit trail is only worth keeping if it records the change rather than
 * the whole row: a diff of forty unchanged fields buries the one that moved.
 */

export interface FieldChange {
  field: string;
  /// Rendered as text, because the trail must stay legible after the column's type
  /// changes and after the row it describes is gone.
  before: string | null;
  after: string | null;
}

/// How a value reads in the trail. Null and empty are distinguished: clearing a field
/// and never setting it are different acts.
export function renderValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return String(value);
  return String(value);
}

/**
 * Compare two records field by field.
 *
 * Only fields present in `after` are considered, so a partial update does not read as
 * having cleared everything it did not mention.
 */
export function diffFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const field of Object.keys(after)) {
    const b = renderValue(before ? before[field] : null);
    const a = renderValue(after[field]);
    if (b === a) continue;
    changes.push({ field, before: b, after: a });
  }

  return changes;
}

/// The whole row, for a deletion — there is no "after" to diff against.
export function snapshotFields(row: Record<string, unknown>): FieldChange[] {
  return Object.keys(row).map((field) => ({
    field,
    before: renderValue(row[field]),
    after: null,
  }));
}

/// Field names are configuration-ish keys; screens render labels.
export function fieldLabel(field: string): string {
  const spaced = field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
