import { describe, expect, it, vi } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { requisitionListWhere } from "@/lib/requisition/repo";

import { contractFigures, proceedsBySource, type ContractMoney } from "./proceeds";
import { contractMoney } from "./store";
import type { SourceRef } from "./types";

// contractMoney is pure; its module reaches the client through the requisition list's where. Nothing here touches a database.
vi.mock("@/lib/db", () => ({ db: {} }));

const src = (id: string, sortOrder: number, envelope: bigint | null): SourceRef => ({ id, code: id.toUpperCase(), label: id, sortOrder, envelope, categoriesRestricted: false, eligibleCategoryCodes: [], retiredOn: null });
const SUKUK = src("sukuk", 1, 1_000_000n);
const INTERNAL = src("internal", 2, null);

const adj = (...nets: bigint[]) => ({ ok: true as const, issued: nets.map((net, n) => ({ id: `a${n}`, certificateId: `c${n}`, number: `PPJHK ${n}`, net, issuedAt: null })) });
const money = (over: Partial<ContractMoney> = {}): ContractMoney => ({
  contractId: "k1",
  label: "C/1 · Tank",
  status: "ACTIVE",
  supplyRoute: false,
  contractSum: 100_000n,
  adjustments: adj(),
  certified: { ok: true, sen: 0n },
  retentionHeld: { ok: true, sen: 0n },
  paid: 0n,
  funding: { state: "FROM_REQUISITION", shares: [{ sourceId: "sukuk", bp: 10000 }] },
  ...over,
});
const figures = (c: ContractMoney) => {
  const r = contractFigures(c);
  if (!r.ok) throw new Error(r.reason);
  return r.figures;
};

describe("contractFigures (FS-8)", () => {
  it("committed is the sum plus its issued adjustments", () => {
    expect(figures(money({ adjustments: adj(5_000n, -2_000n) })).committed).toBe(103_000n);
  });

  it("an advance plus interim certificates are not double counted: certified sums each one's paid figure, the interim's already net of the recovery", () => {
    // Advance 20 000.00 paid. Interim 1: gross 55 000.00 less retention 5 500.00 less the advance's recovery 10 000.00 = 39 500.00 recommended.
    const lines = (o: Record<string, string>) => ({ figures: { lines: Object.entries(o).map(([key, value]) => ({ key, value })) } });
    const paid = (amount: string) => ({ paidOn: new Date("2026-03-01"), batchNo: "B1", amount: new Prisma.Decimal(amount), corrections: [] });
    const m = contractMoney(
      {
        id: "k1", number: "C/1", status: "ACTIVE", contractSum: new Prisma.Decimal("100000.00"),
        award: { awardeeName: "Tank Sdn Bhd", exercise: { contractTypeCode: null, requisition: { fundingSourceId: "sukuk" } } },
        fundingAllocations: [], sumAdjustments: [], supplyInvoicePayments: [],
        certificates: [
          { kind: "ADVANCE_PAYMENT", number: "AP 1", sequence: 1, issueSnapshot: lines({ advanceAmount: "20000.00" }), financePayment: paid("20000.00") },
          { kind: "INTERIM_PAYMENT", number: "IPC 1", sequence: 1, issueSnapshot: lines({ grossValuation: "55000.00", retentionMain: "5500.00", retentionNsc: "0.00", retentionNs: "0.00", advanceRecovery: "10000.00", recommended: "39500.00" }), financePayment: paid("39500.00") },
        ],
      } as Parameters<typeof contractMoney>[0],
      false,
    );
    // 20 000 + 39 500: the advance once, as paid out; never the gross valuation, nor the advance again inside the interim.
    expect(m.certified).toEqual({ ok: true, sen: 5_950_000n });
    expect(m.paid).toBe(5_950_000n);
    const f = figures(m);
    expect([f.committed, f.certified, f.paid, f.certifiedPartial]).toEqual([10_000_000n, 5_950_000n, 5_950_000n, false]);
  });

  it("a terminated contract commits its certified figure plus the retention still held on its latest interim (amendment 15)", () => {
    const f = figures(money({ status: "TERMINATED", adjustments: adj(9_999n), certified: { ok: true, sen: 40_000n }, retentionHeld: { ok: true, sen: 4_000n } }));
    expect(f.committed).toBe(44_000n);
  });

  it("a terminated contract whose retention cannot be read refuses by name", () => {
    const r = contractFigures(money({ status: "TERMINATED", certified: { ok: true, sen: 40_000n }, retentionHeld: { ok: false, number: "IPC 3" } }));
    expect(r).toEqual({ ok: false, reason: expect.stringContaining("IPC 3") });
  });

  it("a terminated supply contract commits its paid figure", () => {
    expect(figures(money({ status: "TERMINATED", supplyRoute: true, paid: 12_345n })).committed).toBe(12_345n);
  });

  it("a supply route gives a partial certified, and paid may exceed it", () => {
    const f = figures(money({ supplyRoute: true, certified: { ok: true, sen: 0n }, paid: 7_000n }));
    expect([f.certified, f.certifiedPartial, f.paid]).toEqual([0n, true, 7_000n]);
  });

  it("a missing adjustment net refuses, naming its certificate", () => {
    const r = contractFigures(money({ adjustments: { ok: false, refused: { number: "PPJHK 2", certificateId: "x", message: "The issued adjustment of the contract sum PPJHK 2 has no net." } } }));
    expect(r).toEqual({ ok: false, reason: expect.stringContaining("PPJHK 2") });
  });

  it("a certificate with no frozen figure refuses", () => {
    expect(contractFigures(money({ certified: { ok: false, number: "IPC 1" } }))).toEqual({ ok: false, reason: expect.stringContaining("IPC 1") });
  });

  it("a cancelled contract counts nothing", () => {
    expect(figures(money({ status: "CANCELLED", certified: { ok: true, sen: 9n }, paid: 9n }))).toMatchObject({ committed: 0n, certified: 0n, paid: 0n });
  });
});

describe("proceedsBySource (FS-8 to FS-10)", () => {
  it("splits each figure by share, to the sen, and the parts sum to the rows", () => {
    const split = money({ contractId: "k2", label: "C/2", contractSum: 100_001n, certified: { ok: true, sen: 50_001n }, paid: 33_333n, funding: { state: "SPLIT", shares: [{ sourceId: "sukuk", bp: 6000 }, { sourceId: "internal", bp: 4000 }] } });
    const u = proceedsBySource([SUKUK, INTERNAL], [money(), split]);
    const s = u.bySource.find((r) => r.sourceId === "sukuk")!;
    const i = u.bySource.find((r) => r.sourceId === "internal")!;
    expect(s.committed + i.committed).toBe(200_001n);
    expect(s.certified + i.certified).toBe(50_001n);
    expect(s.paid + i.paid).toBe(33_333n);
    expect([s.contracts, i.contracts]).toEqual([2, 1]);
    for (const row of u.bySource) {
      const mine = u.parts.filter((p) => p.sourceId === row.sourceId);
      expect([mine.reduce((a, p) => a + p.committed, 0n), mine.reduce((a, p) => a + p.certified, 0n), mine.reduce((a, p) => a + p.paid, 0n)]).toEqual([row.committed, row.certified, row.paid]);
    }
  });

  it("'Not set' collects the contracts with no funding", () => {
    const u = proceedsBySource([SUKUK], [money({ funding: { state: "NOT_SET" }, paid: 10n })]);
    expect(u.notSet).toMatchObject({ contracts: 1, committed: 100_000n, paid: 10n });
    expect(u.bySource[0].contracts).toBe(0);
  });

  it("unallocated is null without an envelope, and negative, never clamped, when over", () => {
    const u = proceedsBySource([SUKUK, INTERNAL], [money({ contractSum: 1_200_000n }), money({ contractId: "k3", funding: { state: "FROM_REQUISITION", shares: [{ sourceId: "internal", bp: 10000 }] } })]);
    expect(u.bySource.find((r) => r.sourceId === "sukuk")!.unallocated).toBe(-200_000n);
    expect(u.bySource.find((r) => r.sourceId === "internal")!.unallocated).toBeNull();
  });

  it("a cancelled contract is left out of every count", () => {
    const u = proceedsBySource([SUKUK], [money({ status: "CANCELLED" }), money({ status: "CANCELLED", funding: { state: "NOT_SET" } })]);
    expect(u.bySource[0]).toMatchObject({ contracts: 0, committed: 0n });
    expect(u.notSet.contracts).toBe(0);
  });

  it("a contract that cannot be read is named on each of its sources, never counted as nothing", () => {
    const bad = money({ contractId: "k9", label: "C/9", certified: { ok: false, number: "IPC 4" }, funding: { state: "SPLIT", shares: [{ sourceId: "sukuk", bp: 5000 }, { sourceId: "internal", bp: 5000 }] } });
    const u = proceedsBySource([SUKUK, INTERNAL], [bad, money({ contractId: "k8", label: "C/8", funding: { state: "NOT_SET" }, certified: { ok: false, number: "IPC 5" } })]);
    for (const row of u.bySource) expect(row.refused).toEqual([{ contractId: "k9", label: "C/9", reason: expect.stringContaining("IPC 4") }]);
    expect(u.notSet.refused).toEqual([{ contractId: "k8", label: "C/8", reason: expect.stringContaining("IPC 5") }]);
  });
});

describe("the awaiting-award where (review)", () => {
  it("is ANDed with the base, never spread over it, so the base's own status condition stands", () => {
    const where = JSON.stringify(requisitionListWhere("org", { words: [], view: null, unit: null, route: null, method: null, source: "SUK", stage: "awaiting", from: "2026-01-01", to: "2027-01-01" }));
    expect(where).toContain('"status":{"not":"DRAFT"}');
    expect(where).toContain('"status":{"in":["APPROVED","SOURCING"]}');
  });
});
