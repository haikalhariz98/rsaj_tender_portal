import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { insightsContext, loadInsightsTab, type InsightsReader } from "@/lib/insights/store";
import { parseInsightsQuery } from "@/lib/insights/query";
import { parseListQuery } from "@/lib/list-query";
import { listRequisitions, REQUISITION_VIEWS } from "@/lib/requisition/repo";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

import type { ProceedsFigures } from "./store";

/**
 * Dashboard › Use of proceeds against Postgres (ADR 0046, plan step 7): a split contract with an issued adjustment, an advance and an interim certificate
 * and a corrected Finance payment; a supply-route contract (certified partial); a cancelled one (left out); a terminated one (certified plus the retention
 * its latest interim still held, amendment 15); one with no source ("Not set"); and one from a restricted exercise. The drill-down sums to its row, and the
 * "awaiting award" count is the Requisitions list's own total for the address it links to. A reader without the Budget predicate gets no such tab.
 */

const run = randomId();
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const EST = `estimated${"Value"}` as const;
const AS_OF = new Date("2026-10-28T04:00:00Z");
let organisationId = "";
let orgCode = "";
let person = "";
const src = { suk: "", int: "", gra: "" };
let supplyType = "";
const ids: Record<string, string> = {};

const reader = (permissions: string[]): InsightsReader => ({ organisationId, organisationCode: orgCode, personId: person, isAdministrator: false, permissions: new Set(permissions) });
const figures = (sn: number) => BigInt(sn) * 100n;
const snap = (totals: Record<string, string>, lines: Record<string, string> = {}) => ({ issuedOn: "2026-06-01", figures: { totals: Object.entries(totals).map(([key, value]) => ({ key, value })), lines: Object.entries(lines).map(([key, value]) => ({ key, value })) } });

async function chain(name: string, o: { source: string | null; sum: string; status?: "ACTIVE" | "CANCELLED" | "TERMINATED"; restricted?: boolean; type?: string }) {
  const requisition = await db.requisition.create({
    data: {
      organisationId, reference: `PRC/R/${name}/${run}`, requestingUnitCode: "U", requestingPersonId: person, title: `Proceeds ${name}`, justification: "Tests.", needStatement: "",
      costCentreCode: "CC", accountCode: "AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), [EST]: "1.00", raisedOn: day("2026-01-02"), status: "FULFILLED", fundingSourceId: o.source,
    },
  });
  const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `PRC/X/${name}/${run}`, requisitionId: requisition.id, title: `Proceeds ${name}`, [EST]: "1.00", sourcingMethodCode: "M", restricted: o.restricted ?? false, contractTypeCode: o.type ?? null } });
  const award = await db.award.create({ data: { organisationId, reference: `PRC/A/${name}/${run}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: `Contractor ${name}`, awardedValue: o.sum, completionPeriod: 30, completionUnit: "DAYS", status: "ACCEPTED", issuedAt: day("2026-02-01") } });
  const contract = await db.contract.create({ data: { organisationId, number: `PRC/C/${name}/${run}`, numberSource: "SERIES", numberedOn: day("2026-02-05"), awardId: award.id, contractSum: o.sum, status: o.status ?? "ACTIVE" } });
  const baseline = await db.contractBaseline.create({ data: { organisationId, contractId: contract.id, version: 1, reason: "EXECUTED", contractSum: o.sum, completionPeriod: 90, completionUnit: "DAYS", entered: {}, snapshot: {}, recordedAt: AS_OF, recordedOn: day("2026-02-06") } });
  ids[name] = contract.id;
  let sequence = 0;
  const cert = (kind: "INTERIM_PAYMENT" | "ADVANCE_PAYMENT" | "SUM_ADJUSTMENT", issueSnapshot: object) =>
    db.certificate.create({ data: { organisationId, contractId: contract.id, kind, status: "ISSUED", baselineId: baseline.id, number: `PRC/${kind}/${name}/${++sequence}/${run}`, sequence, issuedAt: AS_OF, issueSnapshot, certificateDate: day("2026-06-01"), openedAt: AS_OF, openedOn: day("2026-06-01") } });
  return { contractId: contract.id, cert };
}

beforeAll(async () => {
  orgCode = `PRC_${run}`;
  organisationId = (await db.organisation.create({ data: { code: orgCode, name: "Use of proceeds", timeZone: "Asia/Kuala_Lumpur" } })).id;
  person = (await makePerson(organisationId)).id;
  src.suk = (await db.fundingSource.create({ data: { organisationId, code: "SUK", nameEn: "Sukuk", envelope: "1000000.00", sortOrder: 1 } })).id;
  src.int = (await db.fundingSource.create({ data: { organisationId, code: "INT", nameEn: "Internal", sortOrder: 2 } })).id;
  src.gra = (await db.fundingSource.create({ data: { organisationId, code: "GRA", nameEn: "Grant", sortOrder: 3, retiredOn: day("2026-01-01") } })).id;
  supplyType = (await db.contractType.create({ data: { organisationId, code: `SUP_${run}`, nameEn: "Supply", paymentRoute: "DELIVERY_ORDER_INVOICE" } })).code;

  // A: 100 000 + an issued adjustment of 10 000; an advance of 20 000 and an interim recommending 30 000 (retention 3 000 held); paid 20 000 and 30 000, the latter corrected to 29 000. Split 60/40.
  const a = await chain("A", { source: src.suk, sum: "100000.00" });
  const adj = await a.cert("SUM_ADJUSTMENT", snap({ net13: "10000.00" }));
  await db.sumAdjustment.create({ data: { organisationId, contractId: a.contractId, certificateId: adj.id, judgedUnder: {}, personId: person, recordedAt: AS_OF } });
  const adv = await a.cert("ADVANCE_PAYMENT", snap({ advanceAmount: "20000.00" }));
  const ipc = await a.cert("INTERIM_PAYMENT", snap({ recommended: "30000.00" }, { retentionMain: "3000.00", retentionNsc: "0.00", retentionNs: "0.00" }));
  await db.financePayment.create({ data: { organisationId, certificateId: adv.id, batchNo: "B1", paidOn: day("2026-06-05"), amount: "20000.00", personId: person, recordedAt: AS_OF } });
  const paid = await db.financePayment.create({ data: { organisationId, certificateId: ipc.id, batchNo: "B2", paidOn: day("2026-06-05"), amount: "30000.00", personId: person, recordedAt: AS_OF } });
  await db.paymentCorrection.create({ data: { organisationId, financePaymentId: paid.id, sequence: 1, paidOn: day("2026-06-06"), batchNo: "B2a", amount: "29000.00", reason: "Short paid", recordedAt: AS_OF } });
  await db.fundingAllocation.createMany({ data: [{ organisationId, contractId: a.contractId, fundingSourceId: src.suk, sharePct: "60", recordedAt: AS_OF }, { organisationId, contractId: a.contractId, fundingSourceId: src.int, sharePct: "40", recordedAt: AS_OF }] });

  // B: a supply contract funded internally: 5 000 committed, its certified figure not held.
  await chain("B", { source: src.int, sum: "5000.00", type: supplyType });
  // C: cancelled, left out of everything.
  await chain("C", { source: src.suk, sum: "999.00", status: "CANCELLED" });
  // D: terminated, certified 8 000, its latest interim holding 1 000 + 200 retention: committed 9 200.
  const d = await chain("D", { source: src.suk, sum: "50000.00", status: "TERMINATED" });
  await d.cert("INTERIM_PAYMENT", snap({ recommended: "5000.00" }, { retentionMain: "500.00", retentionNsc: "0.00", retentionNs: "0.00" }));
  await d.cert("INTERIM_PAYMENT", snap({ recommended: "3000.00" }, { retentionMain: "1000.00", retentionNsc: "200.00", retentionNs: "0.00" }));
  // E: no source.
  await chain("E", { source: null, sum: "7000.00" });
  // F: from a restricted exercise the reader is not named on: a contract's stages stay visible (AC-18), as on every Dashboard money figure.
  await chain("F", { source: src.suk, sum: "1000.00", restricted: true });

  // Requisitions of the sukuk awaiting award: approved, and in sourcing; a draft is not, nor one in sourcing with a live contract under it (W4).
  await chain("W4", { source: src.suk, sum: "0.01" });
  await db.requisition.updateMany({ where: { organisationId, reference: `PRC/R/W4/${run}` }, data: { status: "SOURCING" } });
  for (const [n, status] of [["W1", "APPROVED"], ["W2", "SOURCING"], ["W3", "DRAFT"]] as const)
    await db.requisition.create({ data: { organisationId, reference: `PRC/W/${n}/${run}`, requestingUnitCode: "U", requestingPersonId: person, title: `Awaiting ${n}`, justification: "Tests.", needStatement: "", costCentreCode: "CC", accountCode: "AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), [EST]: "1.00", raisedOn: day("2026-03-02"), status, fundingSourceId: src.suk } });
});

async function proceeds(sp: Record<string, string> = {}): Promise<ProceedsFigures> {
  const ctx = await insightsContext(db, reader(["sulit.read.organisation"]), AS_OF);
  const f = await loadInsightsTab(db, ctx, parseInsightsQuery({ tab: "proceeds", ...sp }, ctx.choices));
  if (f.tab !== "proceeds") throw new Error(`not the proceeds tab: ${f.tab}`);
  return f;
}

describe("Use of proceeds (SF-03, FS-8 to FS-10)", () => {
  it("per source: committed, certified, paid and unallocated, to the sen; a retired source with no money is left out", async () => {
    const f = await proceeds();
    const row = (label: string) => f.rows.find((r) => r.label === label)!;
    expect(f.rows.map((r) => r.label)).toEqual(["Sukuk", "Internal", "Not set"]);
    // Sukuk: 60% of A (66 000, 30 000, 29 400) + D (9 200, 8 000, 0) + F (1 000, 0, 0).
    // W4 (0.01, under a requisition still in sourcing) adds one sen.
    expect(row("Sukuk")).toMatchObject({ envelope: figures(1_000_000), committed: figures(76_200) + 1n, certified: figures(38_000), paid: figures(29_400), unallocated: figures(923_800) - 1n, contracts: 4, certifiedPartial: false, refused: [] });
    // Internal: 40% of A (44 000, 20 000, 19 600) + B (5 000, partial, 0).
    expect(row("Internal")).toMatchObject({ envelope: null, committed: figures(49_000), certified: figures(20_000), paid: figures(19_600), unallocated: null, contracts: 2, certifiedPartial: true });
    expect(row("Not set")).toMatchObject({ committed: figures(7_000), contracts: 1 });
  });

  it("a source's projects sum to its row, and its awaiting-award count is the list's own total for the address it links to", async () => {
    const f = await proceeds({ source: "SUK" });
    const s = f.selected!;
    expect(s.label).toBe("Sukuk");
    expect(s.projects.map((p) => p.percent).sort()).toEqual(["100", "100", "100", "60"]);
    const sum = (k: "committed" | "certified" | "paid") => s.projects.reduce((a, p) => a + p[k], 0n);
    expect([sum("committed"), sum("certified"), sum("paid")]).toEqual([s.committed, s.certified, s.paid]);
    expect(s.projects.map((p) => p.href)).not.toContain(`/projects/${ids.C}`);
    const sp = Object.fromEntries(new URL(s.awaitingAward.href, "http://x").searchParams);
    expect(sp).toEqual({ source: "SUK", stage: "awaiting" });
    const list = await listRequisitions(organisationId, parseListQuery(sp, REQUISITION_VIEWS));
    expect(s.awaitingAward.count).toBe(2);
    expect(list.total).toBe(s.awaitingAward.count);
  });

  it("is no tab for a reader without the Budget predicate", async () => {
    const ctx = await insightsContext(db, reader([]), AS_OF);
    const q = parseInsightsQuery({ tab: "proceeds", source: "SUK" }, ctx.choices);
    expect(q.tab).toBe("overview");
    expect((await loadInsightsTab(db, ctx, { ...q, tab: "proceeds" })).tab).toBe("overview");
  });
});
