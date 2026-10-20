/**
 * PDPA (go-live N7, plan `docs/notes/plans/golive-n7.md`): the contractor signatory's personal values are blanked in a return correction's stored payload when the
 * correction is decided. The ruling on open item 2030 (decisions-log line 2047) chose "blank at the decision", and the product owner scoped N7 to it (line 2823). Pure.
 *
 * The withheld marker is JSON `null`. No posted form value is ever `null`, so a withheld value cannot be confused with a field left empty or a value the proposer typed.
 */

/// The editor and kind whose decided payload is blanked (ruling on log line 2030, chosen at 2823 N7).
export const RETURN_CORRECTION_OPERATION = "awards-records.recordReturn";
export const RETURN_CORRECTION_KIND = "AWARD_RETURN_CORRECTION";

/// Personal and SULIT values of the contractor's signatory and witness. The SQL guard holds the same list (N7 step 2).
export const RETURN_WITHHELD_FIELDS = ["signatoryName", "icNumber", "occupation", "address", "witnessName"] as const;

/// Every other field the return form posts, kept as posted. Each stored field of the form is in exactly one of the two lists (`return-withheld.test.ts` scans the form).
export const RETURN_KEPT_FIELDS = [
  "id",
  "signedLetterReceivedOn",
  "declarationReceivedOn",
  "authorisationReceivedOn",
  "whereHeld",
  "capacity",
  "contractorSigned",
  "stampAffixed",
  "witnessSigned",
] as const;

/// What a reader shows in place of a withheld value. Never an empty value.
export const WITHHELD_WORDS = { en: "Withheld", held: "Held", field: "Personal details" } as const;

const NONE: readonly string[] = [];

/// The names withheld once a change of this kind and operation is decided. Empty for anything else.
export function withheldFieldsOf(kind: string, operation: string): readonly string[] {
  return kind === RETURN_CORRECTION_KIND && operation === RETURN_CORRECTION_OPERATION ? RETURN_WITHHELD_FIELDS : NONE;
}

/**
 * The stored payload with each listed string value replaced by JSON null, or null when nothing would change (another kind or operation, no listed field, already blank).
 * Works on the raw JSON, so order, duplicates and unknown keys are kept as stored. An element is replaced only when it is a name and a text value, the one shape the
 * database guard lets become a name and `null`. Every other element (a file, a value already blank, a shape not understood) is left exactly as it is. The input is not changed.
 */
export function blankWithheld(kind: string, rawPayload: unknown): object | null {
  if (typeof rawPayload !== "object" || rawPayload === null || Array.isArray(rawPayload)) return null;
  const o = rawPayload as Record<string, unknown>;
  if (typeof o.operation !== "string" || !Array.isArray(o.fields)) return null;
  const listed = withheldFieldsOf(kind, o.operation);
  if (listed.length === 0) return null;
  let changed = false;
  const fields = (o.fields as unknown[]).map((e) => {
    if (Array.isArray(e) && e.length === 2 && typeof e[0] === "string" && listed.includes(e[0]) && typeof e[1] === "string") {
      changed = true;
      return [e[0], null];
    }
    return e;
  });
  return changed ? { ...o, fields } : null;
}

/**
 * A rehearsal's audit rows with each listed field's value replaced by the withheld word, for the proposal's own audit row: the trail is append-only, so the personal values of a
 * proposal (decided, declined or never decided) must not enter it. Another kind or operation, and a field not listed, are returned as they are. The input is not changed. The
 * queue still reads the stored rehearsal, so the checker sees the values.
 */
export function withholdRehearsal<R extends { rows: { changes: { field: string; before: string | null; after: string | null }[] }[] }>(kind: string, operation: string, rehearsal: R): R {
  const listed = withheldFieldsOf(kind, operation);
  if (listed.length === 0) return rehearsal;
  const word = (v: string | null) => (v === null ? null : WITHHELD_WORDS.en);
  return { ...rehearsal, rows: rehearsal.rows.map((row) => ({ ...row, changes: row.changes.map((c) => (listed.includes(c.field) ? { ...c, before: word(c.before), after: word(c.after) } : c)) })) };
}
