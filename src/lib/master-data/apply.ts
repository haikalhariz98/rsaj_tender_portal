/**
 * Loads a master-data workbook into an organisation: one transaction, under the organisation's lock, the snapshot read and the plan made after the lock so
 * the writes meet what the plan saw. A dry run plans and writes nothing; a plan with any fault writes nothing. The organisation is created (code, name from the
 * Organisation tab, Kuala Lumpur time) only when the plan is clean and `apply` is set. Fill-only and re-runnable: a row whose code is stored is skipped.
 * Every row written is one audit row with a SYSTEM actor, saying which tab and row it came from and that the source is stated.
 */

import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { dayToDate, storedDay, todayIn } from "@/lib/dates";
import type { db as Db } from "@/lib/db";

import { emptyKnown, holderKey, movementKey, planMasterData, seatKey, SOURCE, type Known, type MasterPlan, type RawBook } from "./plan";

export const TIME_ZONE = "Asia/Kuala_Lumpur";
const ACTOR = { kind: "SYSTEM" as const, label: "Master data loader" };

export interface MasterDataOptions {
  organisationCode: string;
  book: RawBook;
  apply: boolean;
  /// Create the organisation from the Organisation tab and stop: the starter pack needs it to exist, and loads its lists before the workbook fills them.
  organisationOnly?: boolean;
  now?: Date;
}
export interface MasterDataResult {
  plan: MasterPlan;
  applied: boolean;
  organisationCreated: boolean;
}

export async function loadMasterData(client: typeof Db, o: MasterDataOptions): Promise<MasterDataResult> {
  const book: RawBook = o.organisationOnly ? { Organisation: o.book.Organisation } : o.book;
  const judge = (known: Known): MasterPlan => {
    const plan = planMasterData(book, known);
    return o.organisationOnly ? { ...plan, faults: plan.faults.filter((f) => f.tab === "Organisation") } : plan;
  };
  const day = todayIn(o.now ?? new Date(), TIME_ZONE)!;
  return client.$transaction(
    async (tx) => {
      let org = await tx.organisation.findUnique({ where: { code: o.organisationCode }, select: { id: true } });
      let created = false;
      let plan: MasterPlan;
      if (!org) {
        plan = judge(emptyKnown()); // a new organisation holds nothing, so this is the plan the writes will meet
        const w = plan.writes.organisation;
        if (!o.apply || plan.faults.length > 0 || !w) return { plan, applied: false, organisationCreated: false };
        org = await tx.organisation.create({ data: { code: o.organisationCode, name: w.name, shortName: w.shortName, timeZone: TIME_ZONE }, select: { id: true } });
        created = true;
        await audit(tx, org.id, "Organisation", org.id, w.name, { name: w.name, shortName: w.shortName, timeZone: TIME_ZONE }, `Created by the master data loader. Source: ${SOURCE}, tab Organisation.`);
      } else {
        await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${org.id} FOR UPDATE`;
        plan = judge(await snapshot(tx, org.id));
        if (!o.apply || plan.faults.length > 0) return { plan, applied: false, organisationCreated: false };
      }
      if (!o.organisationOnly) await write(tx, org.id, plan, dayToDate(day));
      return { plan, applied: true, organisationCreated: created };
    },
    { timeout: 600_000, maxWait: 10_000 },
  );
}

const audit = (tx: Tx, organisationId: string, entity: string, entityId: string, entityLabel: string, after: Record<string, unknown>, reason: string) =>
  writeAudit(tx, { organisationId, entity, entityId, entityLabel, reason, actor: ACTOR }, "CREATE", diffFields(null, after));

async function snapshot(tx: Tx, organisationId: string): Promise<Known> {
  const where = { organisationId };
  const codes = async (rows: Promise<{ code: string }[]>) => new Set((await rows).map((r) => r.code));
  const [units, costCentres, sites, accounts, budgetCodes, people, funding, categories, years, roles, committees, movements, holders, seats] = await Promise.all([
    tx.orgUnit.findMany({ where, select: { code: true, kind: true } }),
    codes(tx.costCentre.findMany({ where, select: { code: true } })),
    codes(tx.site.findMany({ where, select: { code: true } })),
    codes(tx.accountCode.findMany({ where, select: { code: true } })),
    codes(tx.budgetCode.findMany({ where, select: { code: true } })),
    tx.person.findMany({ where: { organisationId, staffNo: { not: null } }, select: { staffNo: true } }),
    codes(tx.fundingSource.findMany({ where, select: { code: true } })),
    codes(tx.projectCategory.findMany({ where, select: { code: true } })),
    tx.budgetYear.findMany({ where, select: { year: true } }),
    tx.authorityRole.findMany({ where, select: { code: true, nameEn: true } }),
    tx.committee.findMany({ where, select: { code: true, nameEn: true } }),
    tx.budgetMovement.findMany({ where: { budgetCode: where }, select: { kind: true, amount: true, occurredOn: true, reference: true, budgetCode: { select: { code: true } } } }),
    tx.roleAssignment.findMany({ where: { person: where }, select: { roleCode: true, scope: true, effectiveFrom: true, person: { select: { staffNo: true } } } }),
    tx.committeeMember.findMany({ where: { committee: where, personId: { not: null } }, select: { effectiveFrom: true, committee: { select: { code: true } }, person: { select: { staffNo: true } } } }),
  ]);
  // A holder or seat written with no start date is matched on who, what and where alone, whatever day it was given.
  const holderKeys = new Set<string>();
  for (const h of holders) for (const f of [storedDay(h.effectiveFrom), null]) holderKeys.add(holderKey(h.person.staffNo ?? "", h.roleCode, h.scope, f));
  const seatKeys = new Set<string>();
  for (const s of seats) for (const f of [storedDay(s.effectiveFrom), null]) seatKeys.add(seatKey(s.committee.code, s.person?.staffNo ?? "", f));
  return {
    organisationExists: true,
    hasCompanyUnit: units.some((u) => u.kind === "COMPANY"),
    units: new Set(units.map((u) => u.code)),
    costCentres,
    sites,
    accounts,
    budgetCodes,
    staff: new Set(people.map((p) => p.staffNo!)),
    funding,
    categories,
    years: new Set(years.map((y) => y.year)),
    offices: new Map(roles.map((r) => [r.nameEn.toLowerCase(), r.code])),
    committees: new Map(committees.map((c) => [c.nameEn.toLowerCase(), c.code])),
    movementKeys: new Set(movements.map((m) => movementKey(m.budgetCode.code, m.kind, storedDay(m.occurredOn), m.amount.toFixed(2), m.reference))),
    holderKeys,
    seatKeys,
  };
}

async function write(tx: Tx, organisationId: string, plan: MasterPlan, today: Date) {
  const w = plan.writes;
  const add = (entity: string, id: string, label: string, after: Record<string, unknown>, tab: string, r: { row: number; source: string }) =>
    audit(tx, organisationId, entity, id, label, after, `Loaded from the ${tab} tab, row ${r.row}. Source: ${r.source}.`);

  for (const [i, x] of w.accounts.entries()) {
    const row = await tx.accountCode.create({ data: { organisationId, code: x.code, nameEn: x.nameEn, provenance: "STATED", notes: x.source, sortOrder: i + 1, effectiveFrom: today }, select: { id: true } });
    await add("AccountCode", row.id, x.nameEn, { nameEn: x.nameEn }, "Main accounts", x);
  }
  for (const [i, x] of w.sites.entries()) {
    const row = await tx.site.create({ data: { organisationId, code: x.code, nameEn: x.nameEn, kind: x.kind, address: x.address, town: x.town, district: x.district, orgUnitCode: x.orgUnitCode, provenance: "STATED", notes: x.source, sortOrder: i + 1, effectiveFrom: today }, select: { id: true } });
    await add("Site", row.id, x.nameEn, { nameEn: x.nameEn, kind: x.kind, town: x.town, district: x.district }, "Sites", x);
  }
  for (const x of w.staff) {
    const row = await tx.person.create({ data: { organisationId, staffNo: x.staffNo, name: x.name, email: x.email, jobTitle: x.jobTitle, orgUnitCode: x.orgUnitCode, telephone: x.telephone, isActive: x.isActive }, select: { id: true } });
    await add("Person", row.id, x.name, { staffNo: x.staffNo, jobTitle: x.jobTitle, isActive: x.isActive ? "Yes" : "No" }, "Staff", x); // contact details are stored, not repeated in the trail
  }
  const people = new Map((await tx.person.findMany({ where: { organisationId, staffNo: { not: null } }, select: { id: true, staffNo: true } })).map((p) => [p.staffNo!, p.id]));
  const person = (staffNo: string | null) => (staffNo ? (people.get(staffNo) ?? null) : null);

  for (const [i, x] of w.units.entries()) {
    const company = x.kind === "COMPANY" ? w.organisation?.company : undefined;
    const row = await tx.orgUnit.create({
      data: { organisationId, code: x.code, nameEn: x.nameEn, kind: x.kind, parentCode: x.parentCode, costCentreCode: x.costCentreCode, headPersonId: person(x.headStaffNo), registrationNumber: company?.registrationNumber, taxReference: company?.taxReference, telephone: company?.telephone, address: company?.address ?? "", financialYearStart: company?.financialYearStart, governingSource: x.source, provenance: "STATED", sortOrder: i + 1, effectiveFrom: today },
      select: { id: true },
    });
    await add("OrgUnit", row.id, x.nameEn, { nameEn: x.nameEn, parentCode: x.parentCode, ...(company ? { registrationNumber: company.registrationNumber, financialYearStart: company.financialYearStart } : {}) }, "Org units", x);
  }
  for (const [i, x] of w.costCentres.entries()) {
    const row = await tx.costCentre.create({ data: { organisationId, code: x.code, nameEn: x.nameEn, orgUnitCode: x.orgUnitCode, siteCode: x.siteCode, activity: x.activity, ownerPersonId: person(x.ownerStaffNo), provenance: "STATED", notes: x.source, sortOrder: i + 1, effectiveFrom: today }, select: { id: true } });
    await add("CostCentre", row.id, x.nameEn, { nameEn: x.nameEn, orgUnitCode: x.orgUnitCode, siteCode: x.siteCode, activity: x.activity }, "Cost centres", x);
  }
  for (const [i, x] of w.categories.entries()) {
    const row = await tx.projectCategory.create({ data: { organisationId, code: x.code, nameEn: x.nameEn, governingSource: x.source, provenance: "STATED", sortOrder: i + 1 }, select: { id: true } });
    await add("ProjectCategory", row.id, x.nameEn, { nameEn: x.nameEn }, "Project categories", x);
  }
  for (const [i, x] of w.funding.entries()) {
    const data: Prisma.FundingSourceUncheckedCreateInput = { organisationId, code: x.code, nameEn: x.nameEn, envelope: x.envelope, categoriesRestricted: x.eligibleCategoryCodes.length > 0, eligibleCategoryCodes: x.eligibleCategoryCodes, eligibilityProvenance: "STATED", governingSource: x.source, provenance: "STATED", sortOrder: i + 1 };
    const row = await tx.fundingSource.create({ data, select: { id: true } });
    await add("FundingSource", row.id, x.nameEn, { nameEn: x.nameEn, envelope: x.envelope, eligibleCategories: x.eligibleCategoryCodes.join(", ") || "Any" }, "Funding sources", x);
  }
  for (const x of w.budgetCodes) {
    const row = await tx.budgetCode.create({ data: { organisationId, code: x.code, descriptionEn: x.descriptionEn, type: x.type, owningUnitCode: x.owningUnitCode, accountCode: x.accountCode, holderPersonId: person(x.holderStaffNo), isActive: x.isActive, effectiveFrom: today }, select: { id: true } });
    await add("BudgetCode", row.id, x.code, { descriptionEn: x.descriptionEn, type: x.type, owningUnitCode: x.owningUnitCode, accountCode: x.accountCode, isActive: x.isActive ? "Yes" : "No" }, "Budget codes", x);
  }
  for (const year of w.years) {
    const row = await tx.budgetYear.create({ data: { organisationId, year }, select: { id: true } });
    await audit(tx, organisationId, "BudgetYear", row.id, `Budget year ${year}`, { year }, `Created for a budget allocation in the Budget allocations tab. Source: ${SOURCE}.`);
  }
  const budgetIds = new Map((await tx.budgetCode.findMany({ where: { organisationId }, select: { id: true, code: true } })).map((b) => [b.code, b.id]));
  for (const x of w.movements) {
    const row = await tx.budgetMovement.create({ data: { budgetCodeId: budgetIds.get(x.budgetCode)!, kind: x.kind, reference: x.reference, description: x.description, amount: x.amount, occurredOn: dayToDate(x.occurredOn) }, select: { id: true } });
    await add("BudgetMovement", row.id, x.budgetCode, { amount: x.amount, occurredOn: x.occurredOn, reference: x.reference, description: x.description }, "Budget allocations", x);
  }
  for (const x of w.holders) {
    const row = await tx.roleAssignment.create({ data: { personId: person(x.staffNo)!, roleCode: x.roleCode, scope: x.scope, effectiveFrom: x.from ? dayToDate(x.from) : today, effectiveTo: x.to ? dayToDate(x.to) : null }, select: { id: true } });
    await add("RoleAssignment", row.id, x.roleCode, { scope: x.scope, from: x.from ?? storedDay(today), to: x.to }, "Office holders", x);
  }
  const committees = new Map((await tx.committee.findMany({ where: { organisationId }, select: { id: true, code: true } })).map((c) => [c.code, c.id]));
  for (const x of w.seats) {
    const row = await tx.committeeMember.create({ data: { committeeId: committees.get(x.committeeCode)!, personId: person(x.staffNo), position: x.position, isAlternate: x.isAlternate, provenance: "STATED", appointmentRef: x.appointmentRef, effectiveFrom: x.from ? dayToDate(x.from) : today, effectiveTo: x.to ? dayToDate(x.to) : null }, select: { id: true } });
    await add("CommitteeMember", row.id, x.committeeCode, { position: x.position, appointmentRef: x.appointmentRef, from: x.from ?? storedDay(today), to: x.to }, "Committee members", x);
  }
}
