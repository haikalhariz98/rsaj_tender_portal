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
import { checkFaults, freezeRoutingType, readRoutingSnapshot, receivedFaults, routingSheet, typeFaults, type Sheet } from "./routing-sheet";
import type { Finding } from "./types";
import { CertificateRefusal } from "./write";

const refuse = (lead: string, fs: readonly Finding[]): never => {
  throw new CertificateRefusal(refusalText(lead, fs));
};

export const awardSheetInclude = { type: { select: { id: true, labelEn: true } } } as const;

export interface AwardSheetRows {
  sheet: { typeSnapshot: unknown; receivedOn: Date | null } | null;
  checks: readonly { iteration: number; defOrder: number; personName: string; on: Date; note: string }[];
}

/// The award's sheet as it stands: the appointment route (and any successor) as iterations. Null: not started.
export function awardSheetOf(l: LoadedAward, rows: AwardSheetRows, today: string): Sheet | null {
  const type = rows.sheet ? readRoutingSnapshot(rows.sheet.typeSnapshot) : null;
  if (!type) return null;
  const routes = l.award.approvalInstances.filter((i) => i.domain === "appointment");
  return routingSheet({ type, receivedOn: rows.sheet!.receivedOn ? storedDay(rows.sheet!.receivedOn) : null, routes: routesOf(routes), checks: checksOf(rows.checks), ratio: null, today });
}

/// Whether the sheet takes checks: the award is not cancelled.
const sheetOpen = (l: LoadedAward) => l.award.status !== "CANCELLED";
const label = (l: LoadedAward) => `${l.award.reference} · routing sheet`;

async function audit(tx: Tx, l: LoadedAward, entity: string, entityId: string, suffix: string, action: "CREATE" | "UPDATE", changes: ReturnType<typeof diffFields>) {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { organisationId: l.org.id, entity, entityId, entityLabel: suffix ? `${label(l)} · ${suffix}` : label(l) }, action, changes);
}

export async function loadAwardSheetRows(awardId: string, client: Tx): Promise<AwardSheetRows> {
  const [sheet, checks] = await Promise.all([client.awardRoutingSheet.findUnique({ where: { awardId } }), client.routingCheck.findMany({ where: { awardId }, orderBy: [{ iteration: "asc" }, { defOrder: "asc" }] })]);
  return { sheet, checks };
}

/// Start the award's routing sheet on a type with subject AWARD, frozen as it stands today.
export async function startAwardSheet(tx: Tx, l: LoadedAward, typeId: string, now: Date, today: string) {
  if (!sheetOpen(l)) refuse("Not started:", [{ code: "SHEET_CLOSED", level: "block" }]);
  if (await tx.awardRoutingSheet.findUnique({ where: { awardId: l.award.id }, select: { id: true } })) throw new CertificateRefusal("This award's routing sheet has already started: its type was frozen then.");
  const owned = await tx.routingSheetType.findFirst({ where: { id: typeId, organisationId: l.org.id }, select: { id: true } });
  const t = owned ? await routingTypeNow(typeId, tx) : null;
  const fs = typeFaults(t, "AWARD", null, today);
  if (fs.length) refuse("Not started:", fs);
  const frozen = freezeRoutingType(t!, today);
  const row = await tx.awardRoutingSheet.create({ data: { organisationId: l.org.id, awardId: l.award.id, typeId, typeSnapshot: frozen as unknown as Prisma.InputJsonValue, startedAt: now } });
  await audit(tx, l, "AwardRoutingSheet", row.id, "", "CREATE", diffFields(null, { routingSheet: frozen.labelEn, checks: frozen.checks.map((c) => c.labelEn).join(", ") || "none", frozenOn: today }));
}

/// DATE (1) on the award's sheet: entered, never in the future, never after its first check.
export async function recordAwardReceived(tx: Tx, l: LoadedAward, received: string, now: Date, today: string) {
  const rows = await loadAwardSheetRows(l.award.id, tx);
  if (!rows.sheet) throw new CertificateRefusal("Start the routing sheet first: choose its type.");
  const sheet = awardSheetOf(l, rows, today)!;
  const first = sheet.iterations[0].checks.map((x) => x.recorded?.on).filter((d): d is string => !!d).sort()[0] ?? null;
  const fs = receivedFaults(sheetOpen(l), received, today, first);
  if (fs.length) refuse("Not recorded:", fs);
  const before = rows.sheet.receivedOn ? storedDay(rows.sheet.receivedOn) : null;
  await tx.awardRoutingSheet.update({ where: { awardId: l.award.id }, data: { receivedOn: dayToDate(received), receivedRecordedAt: now } });
  await audit(tx, l, "AwardRoutingSheet", l.award.id, "", "UPDATE", diffFields({ receivedOn: before }, { receivedOn: received }));
}

/// An internal check on the award's sheet, in the sheet's order.
export async function recordAwardCheck(tx: Tx, l: LoadedAward, defOrder: number, personId: string, on: string, note: string, now: Date, today: string) {
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
  const fs = checkFaults({ open: sheetOpen(l), sheet, defOrder, person, holders, on, today });
  if (fs.length) refuse("Not recorded:", fs);
  const row = await tx.routingCheck.create({ data: { organisationId: l.org.id, awardId: l.award.id, iteration: sheet.current.n, defOrder, kind: slot!.def.kind, label: slot!.def.labelEn, personId: person!.id, personName: person!.name, on: dayToDate(on), note, recordedAt: now } });
  await audit(tx, l, "RoutingCheck", row.id, slot!.def.labelEn, "CREATE", diffFields(null, { check: `${CHECK_KIND_WORDS[slot!.def.kind].en} (${slot!.def.labelEn})`, round: sheet.current.n, by: person!.name, on, note: note || null, recordedOnBehalf: ON_BEHALF }));
}
