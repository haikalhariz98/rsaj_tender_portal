/**
 * Turns the internal clause slugs used as configuration keys into the citation an
 * officer would actually write.
 *
 *   DAL_3144_16  ->  DAL §3.1.4.4 item 16
 *   DAL_31422    ->  DAL §3.1.4.2 item 2
 *   DAL_P17_CAPEX ->  DAL p.17
 *
 * The slug is a database key and stays in the data for traceability; it should never
 * reach a screen. Where a row has no clause because the manual has no rule for the
 * matter, this returns null — a gap must not be dressed up as a citation.
 */
export function formatClause(clause: string | null | undefined): string | null {
  if (!clause) return null;

  // Rows the manual does not cover at all.
  if (clause.startsWith("GAP_") || clause.endsWith("_GAP")) return null;

  if (clause === "DAL_ABSENCE") return "DAL §1.6";
  if (clause === "DAL_GOV") return "Government funding directive";

  // DAL_3143_9 -> §3.1.4.3 item 9
  const numbered = clause.match(/^DAL_(\d{4})_(\d+)$/);
  if (numbered) return `DAL ${section(numbered[1])} item ${Number(numbered[2])}`;

  // DAL_31422 -> §3.1.4.2 item 2 (the item is run onto the section, unseparated)
  const runOn = clause.match(/^DAL_(\d{4})(\d)$/);
  if (runOn) return `DAL ${section(runOn[1])} item ${Number(runOn[2])}`;

  // DAL_3141 -> §3.1.4.1
  const plain = clause.match(/^DAL_(\d{4})$/);
  if (plain) return `DAL ${section(plain[1])}`;

  // DAL_16 -> §1.6
  const short = clause.match(/^DAL_(\d{2})$/);
  if (short) return `DAL §${short[1][0]}.${short[1][1]}`;

  // DAL_P17_CAPEX -> DAL p.17
  const page = clause.match(/^DAL_P(\d+)/);
  if (page) return `DAL p.${page[1]}`;

  // SK011_ADVANCE -> SK011. Operation Manual references keep their manual code.
  const manual = clause.match(/^(SK\d{3}|KP\d{3})/);
  if (manual) return manual[1];

  return null;
}

function section(digits: string): string {
  return "§" + digits.split("").join(".");
}

/// A citation, or an honest statement that there is none.
export function clauseOrGap(clause: string | null | undefined, isGap: boolean): string {
  const formatted = formatClause(clause);
  if (formatted) return formatted;
  return isGap ? "No governing clause" : "Not cited";
}
