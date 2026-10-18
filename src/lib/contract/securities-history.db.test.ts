import { beforeAll, describe, expect, it } from "vitest";

import { awardHistory } from "@/lib/award/repo";
import { awardReadiness } from "@/lib/award/gate-read";
import { policyLabel, securityLabel } from "@/lib/audit/entity-labels";
import { db } from "@/lib/db";
import { requiredBond } from "@/lib/securities/bond";
import { parseSen, senFromDecimal } from "@/lib/money";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

import { contractHistory } from "./load";
import { loadContract } from "./repo";

/**
 * A bond lodged and verified on the contract (Award and Contract Requirements v2, C-4; design note 0004 C6; AC-21). The acts stay in
 * awards/actions.ts and write the rows below; the case page reads them. The signature gate reads the verified bond, and the award's
 * history and the contract's both show the register's rows (the contract's did not, before C6: the rows carry the award's label).
 */

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
let organisationId = "";
let awardId = "";
let contractId = "";
let awardRef = "";
let securityId = "";

beforeAll(async () => {
  organisationId = (await db.organisation.create({ data: { code: `SEC_${randomId()}`, name: "Securities history test", timeZone: "Asia/Kuala_Lumpur" } })).id;
  const person = await makePerson(organisationId, `Securities person ${randomId()}`);
  const requisition = await db.requisition.create({
    data: {
      organisationId, reference: `SH/REQ/${randomId()}`, requestingUnitCode: "SH_DEPT", requestingPersonId: person.id, title: "Securities test", justification: "Tests.", needStatement: "None.",
      costCentreCode: "SH_CC", accountCode: "SH_AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), estimatedValue: "1000.00", raisedOn: day("2026-10-01"), status: "SOURCING",
    },
  });
  const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `SH/EX/${randomId()}`, requisitionId: requisition.id, title: "Securities exercise", estimatedValue: "1000.00", sourcingMethodCode: "SH_METHOD", restricted: false, status: "DRAFT" } });
  awardRef = `SH/AW/${randomId()}`;
  const award = await db.award.create({
    data: { organisationId, reference: awardRef, exerciseId: exercise.id, instrumentKind: "LETTER_OF_ACCEPTANCE", awardeeName: "Securities contractor", awardedValue: "1000.00", completionPeriod: 30, completionUnit: "DAYS", status: "ISSUED", bondRequired: true, bondBasis: "STATED_AMOUNT", bondBasisAmount: "500.00" },
  });
  awardId = award.id;
  const contract = await db.contract.create({ data: { organisationId, number: `SH/CON/${randomId()}`, numberSource: "SERIES", numberedOn: day("2026-10-02"), awardId, contractSum: "1000.00", status: "IN_PREPARATION" } });
  contractId = contract.id;
  // What lodgeSecurity writes, and then what reviewSecurity writes.
  const bond = await db.securityInstrument.create({ data: { contractId, kind: "PERFORMANCE_BOND", form: "BANK_GUARANTEE", issuerNameAsWritten: "A bank", value: "500.00", effectiveFrom: day("2026-10-03"), lodgedOn: day("2026-10-03") } });
  securityId = bond.id;
  await db.auditEntry.create({ data: { organisationId, entity: "SecurityInstrument", entityId: bond.id, entityLabel: securityLabel(awardRef, "PERFORMANCE_BOND"), action: "CREATE", changes: [{ field: "status", before: null, after: "LODGED" }] } });
}, 60_000);

const bondItem = async () => {
  const l = (await loadContract(organisationId, contractId))!;
  const req = requiredBond({ basis: l.award.bondBasis, percent: null, basisAmount: l.award.bondBasisAmount ? parseSen(l.award.bondBasisAmount.toString()) : null, contractPrice: senFromDecimal(l.award.awardedValue) });
  return { l, item: awardReadiness(l.award, req, [], null).items.find((x) => x.key === "BOND")! };
};

describe("a bond lodged and verified from the case page", () => {
  it("is read by the signature gate only once it is verified", async () => {
    expect((await bondItem()).item.state).toBe("NOT_MET");
    const checker = await makePerson(organisationId, `Securities checker ${randomId()}`);
    await db.securityInstrument.update({ where: { id: securityId }, data: { status: "VERIFIED", verifiedOn: day("2026-10-04"), verifiedByPersonId: checker.id } });
    await db.auditEntry.create({ data: { organisationId, entity: "SecurityInstrument", entityId: securityId, entityLabel: securityLabel(awardRef, "PERFORMANCE_BOND"), action: "UPDATE", changes: [{ field: "status", before: "LODGED", after: "VERIFIED" }] } });
    expect((await bondItem()).item.state).toBe("MET");
  });

  it("shows both of its rows in the award's history and in the contract's", async () => {
    const { l } = await bondItem();
    const own = (rows: { entity: string; entityId?: string }[]) => rows.filter((e) => e.entity === "SecurityInstrument");
    const contract = await contractHistory(l);
    const award = await awardHistory(l);
    expect(own(contract.entries)).toHaveLength(2);
    expect(own(award.entries)).toHaveLength(2);
  });
});

describe("a reader who sees the contract stages only (AC-37 b)", () => {
  it("is given neither the securities' nor the insurance policies' lodging rows, and still the wages-check row", async () => {
    const { l } = await bondItem();
    const policy = await db.insurancePolicy.create({
      data: { contractId, kind: "WORKMENS_COMPENSATION", issuerNameAsWritten: "An insurer", policyNo: "P-1", sumInsured: "100.00", periodStart: day("2026-10-03"), periodEnd: day("2027-10-03"), lodgedOn: day("2026-10-03") },
    });
    await db.auditEntry.create({ data: { organisationId, entity: "InsurancePolicy", entityId: policy.id, entityLabel: policyLabel(awardRef, "WORKMENS_COMPENSATION"), action: "CREATE", changes: [{ field: "status", before: null, after: "LODGED" }] } });
    await db.auditEntry.create({ data: { organisationId, entity: "InsurancePolicy", entityId: policy.id, entityLabel: `Contract ${l.contract.number} · workmen's compensation wages check`, action: "UPDATE", changes: [{ field: "wcCheckedOn", before: null, after: "2026-10-05" }] } });
    const fresh = (await loadContract(organisationId, contractId))!;
    const rows = (await contractHistory(fresh, { withAwardActs: false })).entries.filter((e) => e.entity === "InsurancePolicy" || e.entity === "SecurityInstrument");
    expect(rows.map((e) => e.entityLabel)).toEqual([`Contract ${l.contract.number} · workmen's compensation wages check`]);
    expect((await contractHistory(fresh)).entries.filter((e) => e.entity === "InsurancePolicy")).toHaveLength(2);
  });
});
