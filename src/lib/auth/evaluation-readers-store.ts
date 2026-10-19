import type { Tx } from "@/lib/audit/record";
import { dayToDate, storedDay, todayIn } from "@/lib/dates";
import { evaluationOfficeHeld, evaluationReaderCodes, type EvaluationReaderBasis } from "@/lib/evaluation/readers";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import type { RoleHolding } from "@/lib/scope/estimate";
import { inOrder } from "@/lib/series";

/**
 * Whether a reader reads each of these exercises' evaluations as the Secretariat or as Internal Audit (product owner, 2026-10-08, decisions log line 1735). The rule is
 * `evaluationOfficeHeld` (`src/lib/evaluation/readers.ts`); this reads what it judges, for several exercises at once: the two offices the organisation set on the evaluation policy,
 * who holds them on the organisation's day, and each exercise's own unit. An office held for a department counts for that department's exercises only.
 *
 * Nothing is read when neither office is set (never "nobody" and never "everybody": unset grants nothing), and when the organisation's day is not known (no time zone) nobody
 * can be shown to hold an office today, so nobody is let in on that account.
 */
export async function evaluationOfficeBases(
  client: Tx,
  reader: { organisationId: string; personId: string; organisationTimeZone: string | null },
  exerciseIds: readonly string[],
  now: Date = new Date(),
): Promise<Map<string, EvaluationReaderBasis | null>> {
  const out = new Map<string, EvaluationReaderBasis | null>(exerciseIds.map((id) => [id, null]));
  if (exerciseIds.length === 0 || !reader.personId) return out;
  const policy = await client.evaluationPolicy.findUnique({ where: { organisationId: reader.organisationId }, select: { secretariatRoleCode: true, internalAuditRoleCode: true } });
  if (!policy) return out;
  const codes = evaluationReaderCodes(policy);
  const today = todayIn(now, reader.organisationTimeZone);
  if (codes.length === 0 || !today) return out;
  // Every holding of the two offices is read, not only the reader's own: the nearest unit with a holder wins, so another person's holding of the office for the unit shadows theirs.
  const [assignments, units, exercises] = await inOrder(
    () => client.roleAssignment.findMany({ where: { roleCode: { in: codes }, person: { organisationId: reader.organisationId } }, select: { personId: true, roleCode: true, scope: true, effectiveFrom: true, effectiveTo: true } }),
    () => client.orgUnit.findMany({ where: { organisationId: reader.organisationId } }),
    () => client.sourcingExercise.findMany({ where: { id: { in: [...exerciseIds] }, organisationId: reader.organisationId }, select: { id: true, requisition: { select: { sectionUnitCode: true, requestingUnitCode: true } } } }));
  const holders: RoleHolding[] = assignments.map((a) => ({ personId: a.personId, roleCode: a.roleCode, scope: a.scope, from: storedDay(a.effectiveFrom), to: a.effectiveTo ? storedDay(a.effectiveTo) : null }));
  const day = dayToDate(today);
  for (const ex of exercises) {
    const unit = ex.requisition.sectionUnitCode || ex.requisition.requestingUnitCode;
    const path = pathTo(units as unknown as OrgUnit[], unit, day).reverse().map((u) => u.code);
    out.set(ex.id, evaluationOfficeHeld(policy, holders, reader.personId, today, path));
  }
  return out;
}
