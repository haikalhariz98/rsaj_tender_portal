/**
 * Who may table a matter before a committee (FR-CTE-006).
 *
 * The Secretariat is an office, `Committee.secretariatRoleCode`, resolved through
 * RoleAssignment on the tabling date. Unset means nobody has said who tables, and
 * tabling is refused rather than inferred. Until sign-in exists the tabler is picked
 * by whoever records it, so the screen shows it as attested, not authenticated.
 */

export type TablingFault = "SECRETARIAT_NOT_SET" | "NOT_TABLED" | "NOT_SECRETARIAT_HOLDER";

export function checkTabling(i: {
  secretariatRoleCode: string | null;
  tabledByPersonId: string | null;
  /// Active holders of the Secretariat office on the tabling date.
  holderIdsOnDate: readonly string[];
}): { ok: true } | { ok: false; fault: TablingFault } {
  if (!i.secretariatRoleCode) return { ok: false, fault: "SECRETARIAT_NOT_SET" };
  if (!i.tabledByPersonId) return { ok: false, fault: "NOT_TABLED" };
  if (!i.holderIdsOnDate.includes(i.tabledByPersonId)) {
    return { ok: false, fault: "NOT_SECRETARIAT_HOLDER" };
  }
  return { ok: true };
}
