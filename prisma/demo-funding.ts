/**
 * Demo records for ADR 0046 (Sukuk core, plan step 8). Invented throughout. The funding sources, project categories and impact measures are configuration, written only by
 * the audited development fill (`npm run pack -- dev-fill --apply`, prisma/dev-fill.ts); this puts them on the demonstration's records, each write direct, audited as the
 * demo loader, and skipped where already set, so a second run writes nothing:
 * - DEMO/KP/T/005/2026 (demo_con13, with issued interim and advance certificates and a payment) and the case of demo_rq23 take the demo sukuk, for water storage;
 * - the supply contract's requisition (demo_rq24) is funded internally;
 * - demo_con13's split is 60% the demo sukuk and 40% internal, recorded on its execution day, before its first certificate (the act refuses one after it, FS-7), so
 *   History never shows a split after certification; where the execution day is not before the first certificate, no split is written;
 * - an approved requisition with no award yet (demo_rq1) takes the demo sukuk, so the Use of proceeds tab counts one awaiting award;
 * - demo_con13 carries two impact figures.
 */

import type { PrismaClient } from "../src/generated/prisma/client";
import { diffFields } from "../src/lib/audit/diff";
import { DEMO_ACTOR } from "./demo-actor";
import { DEMO_FUNDING } from "./dev-fill";

type Db = PrismaClient;
const P = "demo_";
const REASON = "Demonstration funding (invented).";

export async function loadFundingDemo(db: Db, organisationId: string, now = new Date()): Promise<{ notes: string[] }> {
  const sources = await db.fundingSource.findMany({ where: { organisationId, code: { in: [DEMO_FUNDING.sukuk, DEMO_FUNDING.internal] } }, select: { id: true, code: true, nameEn: true } });
  const sukuk = sources.find((s) => s.code === DEMO_FUNDING.sukuk);
  const internal = sources.find((s) => s.code === DEMO_FUNDING.internal);
  if (!sukuk || !internal) return { notes: ["no funding was added: the demo funding sources are not there. Run the development fill (npm run pack -- dev-fill --apply), then this again"] };
  const notes: string[] = [];
  const audit = (id: string, entity: string, entityId: string, entityLabel: string, changes: object[], at = now) =>
    db.auditEntry.createMany({ data: [{ id, organisationId, entity, entityId, entityLabel, action: "UPDATE" as const, at, changes, reason: REASON, ...DEMO_ACTOR }] as never, skipDuplicates: true });

  // The requisitions' source and category, only where none is set.
  const picks: [string, { id: string; nameEn: string }, string | null][] = [
    [`${P}rq41`, sukuk, DEMO_FUNDING.water],
    [`${P}rq23`, sukuk, DEMO_FUNDING.water],
    [`${P}rq24`, internal, null],
    [`${P}rq1`, sukuk, DEMO_FUNDING.water],
  ];
  const category = new Map((await db.projectCategory.findMany({ where: { organisationId }, select: { code: true, nameEn: true } })).map((c) => [c.code, c.nameEn]));
  for (const [id, source, code] of picks) {
    const done = await db.requisition.updateMany({ where: { id, organisationId, fundingSourceId: null }, data: { fundingSourceId: source.id, projectCategoryCode: code } });
    if (done.count !== 1) continue;
    const r = await db.requisition.findUniqueOrThrow({ where: { id }, select: { reference: true, title: true } });
    await audit(`${id}_au_funding`, "Requisition", id, `${r.reference} · ${r.title}`, diffFields({ fundingSource: null, projectCategory: null }, { fundingSource: source.nameEn, projectCategory: code ? (category.get(code) ?? null) : null }));
    notes.push(`${r.reference} funded by ${source.nameEn}`);
  }

  // demo_con13's split, only where none is recorded.
  const con13 = `${P}con13`;
  const contract = await db.contract.findFirst({
    where: { id: con13, organisationId },
    select: { number: true, contractDateRecordedAt: true, award: { select: { awardeeName: true } }, _count: { select: { fundingAllocations: true } }, certificates: { where: { status: "ISSUED" }, orderBy: { issuedAt: "asc" }, take: 1, select: { issuedAt: true } } },
  });
  // Its execution, as recorded: the split and its audit row are dated then, never after money is certified.
  const executed = contract?.contractDateRecordedAt ?? null;
  const firstIssued = contract?.certificates[0]?.issuedAt ?? null;
  const beforeMoney = executed != null && (firstIssued == null || executed < firstIssued);
  if (contract && contract._count.fundingAllocations === 0 && !beforeMoney) notes.push(`${contract.number} not split: its execution is not recorded before its first certificate`);
  if (contract && contract._count.fundingAllocations === 0 && executed && beforeMoney) {
    await db.fundingAllocation.createMany({
      data: [
        { id: `${con13}_fa1`, organisationId, contractId: con13, fundingSourceId: sukuk.id, sharePct: "60", recordedAt: executed },
        { id: `${con13}_fa2`, organisationId, contractId: con13, fundingSourceId: internal.id, sharePct: "40", recordedAt: executed },
      ],
      skipDuplicates: true,
    });
    await audit(`${con13}_au_funding`, "Contract", con13, `Contract ${contract.number} · ${contract.award.awardeeName}`, diffFields({ funding: sukuk.nameEn }, { funding: `${sukuk.nameEn} 60% · ${internal.nameEn} 40%` }), executed);
    notes.push(`${contract.number} split 60/40`);
  }

  // Two impact figures on demo_con13, only where it has none.
  const measures = await db.impactMeasure.findMany({ where: { organisationId, code: { in: [DEMO_FUNDING.storage, DEMO_FUNDING.households] } }, select: { id: true, code: true, nameEn: true, unit: true } });
  if (contract && measures.length === 2 && (await db.projectImpact.count({ where: { organisationId, contractId: con13 } })) === 0) {
    const value = { [DEMO_FUNDING.storage]: "4.5", [DEMO_FUNDING.households]: "1200" } as Record<string, string>;
    await db.projectImpact.createMany({ data: measures.map((m) => ({ id: `${con13}_im_${m.code}`, organisationId, contractId: con13, measureId: m.id, value: value[m.code] })), skipDuplicates: true });
    await audit(`${con13}_au_impact`, "Contract", con13, `Contract ${contract.number} · ${contract.award.awardeeName}`, diffFields(Object.fromEntries(measures.map((m) => [m.nameEn, null])), Object.fromEntries(measures.map((m) => [m.nameEn, `${value[m.code]} ${m.unit}`]))));
    notes.push(`${contract.number} impact figures`);
  }
  return { notes };
}
