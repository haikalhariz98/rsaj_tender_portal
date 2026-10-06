/**
 * The pre-award routing sheet (CPD/DFA/PRE T-QUO) over an award's appointment route (rulings 6.14 condition,
 * ADR 0023): a RoutingSheetType with subject AWARD. Its header (the type, frozen when the sheet starts, and
 * DATE (1)) and its internal checks are recorded on the award; its recommending and approving steps are the
 * appointment route's own, read and never copied. 6.11's committee and approver blocks are unchanged.
 *
 * Server-only helpers: each runs inside the award act's transaction on rows `withLockedAward` locked
 * (Requisition → Exercise → Award), re-runs the rule, writes and audits before/after in the same
 * transaction; a refusal throws `CertificateRefusal` and nothing is saved.
 */

import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import type { LoadedAward } from "@/lib/award/repo";
import { dayToDate, storedDay } from "@/lib/dates";
import { ORGANISATION_CODE } from "@/lib/org";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { holdersFor } from "@/lib/requisition/holders";

import { refusalText } from "./fault-text";
import { CHECK_KIND_WORDS, ON_BEHALF } from "./labels";
import { checksOf, routesOf, routingTypeNow } from "./repo";
import { awardSheetFaults, checkFaults, freezeRoutingType, latestRouteState, readRoutingSnapshot, receivedFaults, routeBounds, routingSheet, typeFaults, type Sheet } from "./routing-sheet";
import type { Finding } from "./types";
import { CertificateRefusal } from "./write";
import type { AuditActor } from "@/lib/auth/types";

const refuse = (lead: string, fs: readonly Finding[]): never => {
  throw new CertificateRefusal(refusalText(lead, fs));
};

export const awardSheetInclude = { type: { select: { id: true, labelEn: true } } } as const;

export interface AwardSheetRows {
  sheet: { id: string; typeSnapshot: unknown; receivedOn: Date | null } | null;
  checks: readonly { iteration: number; defOrder: number; personName: string; on: Date; note: string }[];
}

/// The award's sheet as it stands: the appointment route (and any successor) as iterations. Null: not started.
export function awardSheetOf(l: LoadedAward, rows: AwardSheetRows, today: string): Sheet | null {
  const type = rows.sheet ? readRoutingSnapshot(rows.sheet.typeSnapshot) : null;
  if (!type) return null;
  return routingSheet({ type, receivedOn: rows.sheet!.receivedOn ? storedDay(rows.sheet!.receivedOn) : null, routes: appointmentRoutes(l), checks: checksOf(rows.checks), ratio: null, today });
}

/// The award's appointment routes (the first and any successor), as the sheet reads them.
const appointmentRoutes = (l: LoadedAward) => routesOf(l.award.approvalInstances.filter((i) => i.domain === "appointment"));

/// Why the sheet starts on nothing and takes no check or received day (R-6): the award is cancelled, or its latest appointment route is decided.
export const awardSheetClosed = (l: LoadedAward): Finding[] => awardSheetFaults(l.award.status === "CANCELLED", latestRouteState(appointmentRoutes(l)));
const label = (l: LoadedAward) => `${l.award.reference} · routing sheet`;

async function audit(tx: Tx, actor: AuditActor, l: LoadedAward, entity: string, entityId: string, suffix: string, action: "CREATE" | "UPDATE", changes: ReturnType<typeof diffFields>) {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { actor, organisationId: l.org.id, entity, entityId, entityLabel: suffix ? `${label(l)} · ${suffix}` : label(l) }, action, changes);
}

export async function loadAwardSheetRows(awardId: string, client: Tx): Promise<AwardSheetRows> {
  const [sheet, checks] = await Promise.all([client.awardRoutingSheet.findUnique({ where: { awardId } }), client.routingCheck.findMany({ where: { awardId }, orderBy: [{ iteration: "asc" }, { defOrder: "asc" }] })]);
  return { sheet, checks };
}

/// Start the award's routing sheet on a type with subject AWARD, frozen as it stands today.
export async function startAwardSheet(tx: Tx, actor: AuditActor, l: LoadedAward, typeId: string, now: Date, today: string) {
  // Not on a cancelled award, nor once its appointment route is decided: the sheet would have nothing to record.
  const closed = awardSheetClosed(l);
  if (closed.length) refuse("Not started:", closed);
  if (await tx.awardRoutingSheet.findUnique({ where: { awardId: l.award.id }, select: { id: true } })) throw new CertificateRefusal("This award's routing sheet has already started: its type was frozen then.");
  const owned = await tx.routingSheetType.findFirst({ where: { id: typeId, organisationId: l.org.id }, select: { id: true } });
  const t = owned ? await routingTypeNow(typeId, tx) : null;
  const fs = typeFaults(t, "AWARD", null, today);
  if (fs.length) refuse("Not started:", fs);
  const frozen = freezeRoutingType(t!, today);
  const row = await tx.awardRoutingSheet.create({ data: { organisationId: l.org.id, awardId: l.award.id, typeId, typeSnapshot: frozen as unknown as Prisma.InputJsonValue, startedAt: now } });
  await audit(tx, actor, l, "AwardRoutingSheet", row.id, "", "CREATE", diffFields(null, { routingSheet: frozen.labelEn, checks: frozen.checks.map((c) => c.labelEn).join(", ") || "none", frozenOn: today }));
}

/// DATE (1) on the award's sheet: entered, never in the future, never after its first check, never after the route opened or decided (R-5), and not once the route is decided (R-6).
export async function recordAwardReceived(tx: Tx, actor: AuditActor, l: LoadedAward, received: string, now: Date, today: string) {
  const rows = await loadAwardSheetRows(l.award.id, tx);
  if (!rows.sheet) throw new CertificateRefusal("Start the routing sheet first: choose its type.");
  const sheet = awardSheetOf(l, rows, today)!;
  const closed = awardSheetClosed(l);
  if (closed.length) refuse("Not recorded:", closed);
  const first = sheet.iterations[0].checks.map((x) => x.recorded?.on).filter((d): d is string => !!d).sort()[0] ?? null;
  const fs = receivedFaults(true, received, today, first, routeBounds(appointmentRoutes(l)));
  if (fs.length) refuse("Not recorded:", fs);
  const before = rows.sheet.receivedOn ? storedDay(rows.sheet.receivedOn) : null;
  await tx.awardRoutingSheet.update({ where: { awardId: l.award.id }, data: { receivedOn: dayToDate(received), receivedRecordedAt: now } });
  // The sheet's own row, as its start was audited under (one entity id for the sheet's trail).
  await audit(tx, actor, l, "AwardRoutingSheet", rows.sheet.id, "", "UPDATE", diffFields({ receivedOn: before }, { receivedOn: received }));
}

/// An internal check on the award's sheet, in the sheet's order.
export async function recordAwardCheck(tx: Tx, actor: AuditActor, l: LoadedAward, defOrder: number, personId: string, on: string, note: string, now: Date, today: string) {
  const rows = await loadAwardSheetRows(l.award.id, tx);
  const sheet = rows.sheet ? awardSheetOf(l, rows, today) : null;
  if (!sheet) throw new CertificateRefusal("Start the routing sheet first: choose its type.");
  const slot = sheet.current.checks.find((x) => x.def.order === defOrder);
  const person = await tx.person.findFirst({ where: { id: personId, organisationId: l.org.id }, select: { id: true, name: true, isActive: true } });
  let holders: { holderIds: string[]; delegateIds: string[] } | null = null;
  if (slot?.def.officeCode) {
    const [roster, delegations, units] = await Promise.all([loadRoster(ORGANISATION_CODE, tx), loadDelegations(ORGANISATION_CODE, tx), tx.orgUnit.findMany({ where: { organisationId: l.org.id } })]);
    const asOf = on <= today ? on : today;
    const path = pathTo(units as unknown as OrgUnit[], l.req.sectionUnitCode || l.req.requestingUnitCode, dayToDate(asOf)).reverse().map((u) => u.code);
    const h = holdersFor(slot.def.officeCode, path, roster, delegations, asOf);
    holders = { holderIds: h.holderIds, delegateIds: h.delegates.map((d) => d.personId) };
  }
  const closed = awardSheetClosed(l);
  if (closed.length) refuse("Not recorded:", closed);
  const fs = checkFaults({ open: true, sheet, defOrder, person, holders, on, today });
  if (fs.length) refuse("Not recorded:", fs);
  const row = await tx.routingCheck.create({ data: { organisationId: l.org.id, awardId: l.award.id, iteration: sheet.current.n, defOrder, kind: slot!.def.kind, label: slot!.def.labelEn, personId: person!.id, personName: person!.name, on: dayToDate(on), note, recordedAt: now } });
  await audit(tx, actor, l, "RoutingCheck", row.id, slot!.def.labelEn, "CREATE", diffFields(null, { check: `${CHECK_KIND_WORDS[slot!.def.kind].en} (${slot!.def.labelEn})`, round: sheet.current.n, by: person!.name, on, note: note || null, recordedOnBehalf: ON_BEHALF }));
}
