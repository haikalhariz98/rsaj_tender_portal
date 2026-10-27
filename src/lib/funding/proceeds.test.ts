import { describe, expect, it } from "vitest";

import { contractFigures, useOfProceeds, type ContractMoney } from "./proceeds";
import type { SourceRef } from "./types";

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

  it("an advance plus interim certificates are not double counted: certified is the loaded sum of their paid figures, as is", () => {
    // Advance 10 000 + interim recommended 30 000 (already net of the advance's recovery).
    const f = figures(money({ certified: { ok: true, sen: 40_000n }, paid: 35_000n }));
    expect([f.committed, f.certified, f.paid, f.certifiedPartial]).toEqual([100_000n, 40_000n, 35_000n, false]);
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

describe("useOfProceeds (FS-8 to FS-10)", () => {
  it("splits each figure by share, to the sen, and the parts sum to the rows", () => {
    const split = money({ contractId: "k2", label: "C/2", contractSum: 100_001n, certified: { ok: true, sen: 50_001n }, paid: 33_333n, funding: { state: "SPLIT", shares: [{ sourceId: "sukuk", bp: 6000 }, { sourceId: "internal", bp: 4000 }] } });
    const u = useOfProceeds([SUKUK, INTERNAL], [money(), split]);
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
    const u = useOfProceeds([SUKUK], [money({ funding: { state: "NOT_SET" }, paid: 10n })]);
    expect(u.notSet).toMatchObject({ contracts: 1, committed: 100_000n, paid: 10n });
    expect(u.bySource[0].contracts).toBe(0);
  });

  it("unallocated is null without an envelope, and negative, never clamped, when over", () => {
    const u = useOfProceeds([SUKUK, INTERNAL], [money({ contractSum: 1_200_000n }), money({ contractId: "k3", funding: { state: "FROM_REQUISITION", shares: [{ sourceId: "internal", bp: 10000 }] } })]);
    expect(u.bySource.find((r) => r.sourceId === "sukuk")!.unallocated).toBe(-200_000n);
    expect(u.bySource.find((r) => r.sourceId === "internal")!.unallocated).toBeNull();
  });

  it("a cancelled contract is left out of every count", () => {
    const u = useOfProceeds([SUKUK], [money({ status: "CANCELLED" }), money({ status: "CANCELLED", funding: { state: "NOT_SET" } })]);
    expect(u.bySource[0]).toMatchObject({ contracts: 0, committed: 0n });
    expect(u.notSet.contracts).toBe(0);
  });

  it("a contract that cannot be read is named on each of its sources, never counted as nothing", () => {
    const bad = money({ contractId: "k9", label: "C/9", certified: { ok: false, number: "IPC 4" }, funding: { state: "SPLIT", shares: [{ sourceId: "sukuk", bp: 5000 }, { sourceId: "internal", bp: 5000 }] } });
    const u = useOfProceeds([SUKUK, INTERNAL], [bad, money({ contractId: "k8", label: "C/8", funding: { state: "NOT_SET" }, certified: { ok: false, number: "IPC 5" } })]);
    for (const row of u.bySource) expect(row.refused).toEqual([{ contractId: "k9", label: "C/9", reason: expect.stringContaining("IPC 4") }]);
    expect(u.notSet.refused).toEqual([{ contractId: "k8", label: "C/8", reason: expect.stringContaining("IPC 5") }]);
  });
});
