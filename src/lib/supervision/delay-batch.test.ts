import { describe, expect, it } from "vitest";

import type { Tx } from "@/lib/audit/record";
import { dayPlus, dayToDate, storedDay } from "@/lib/dates";

import { inDelay, type DelayReading } from "./delay";
import { delayReadingsOf } from "./delay-batch";
import { programmeInForce, type RevisionFacts } from "./programme";
import type { ProgrammeDecision } from "./types";

/**
 * 6.13 Part A residual D3: the Projects list's In Delay readings are read in O(contracts) rows (the programme in
 * force and the latest progress on or before today, per contract) and are identical to the reading the earlier
 * loader gave from every revision and every progress record. The reference below is that loader's rule, kept
 * here as the oracle; the client is in memory and counts the rows it hands back.
 */

interface Programme { contractId: string; revision: number; submittedOn: Date; scrutinisedOn: Date | null; reasonable: boolean | null; decision: ProgrammeDecision | null; decidedOn: Date | null; points: { day: Date; plannedPct: string }[] }
interface Progress { contractId: string; day: Date; actualPct: string }
interface Data { organisationId: string; possessions: { organisationId: string; contractId: string; possessionOn: Date }[]; programmes: Programme[]; progress: Progress[]; policyPct: string | null }

/// A plain-number stand-in for Prisma's Decimal: only toString is read.
const dec = (s: string) => ({ toString: () => s });

function memoryClient(d: Data) {
  const rows = { programmes: 0, progress: 0 };
  const inIds = (w: { contractId: { in: string[] } }, id: string) => w.contractId.in.includes(id);
  const client = {
    possession: {
      findMany: async ({ where }: { where: { organisationId: string; contractId: { in: string[] } } }) =>
        d.possessions.filter((p) => p.organisationId === where.organisationId && inIds(where, p.contractId)).map((p) => ({ contractId: p.contractId, possessionOn: p.possessionOn })),
    },
    postAwardPolicy: { findUnique: async () => (d.policyPct == null ? { inDelayProgressPct: null } : { inDelayProgressPct: dec(d.policyPct) }) },
    workProgramme: {
      groupBy: async ({ where }: { where: { contractId: { in: string[] }; decision: string; decidedOn: { lt: Date } } }) => {
        const m = new Map<string, number>();
        for (const p of d.programmes) if (inIds(where, p.contractId) && p.decision === where.decision && p.decidedOn && p.decidedOn < where.decidedOn.lt) m.set(p.contractId, Math.max(m.get(p.contractId) ?? -Infinity, p.revision));
        return [...m].map(([contractId, revision]) => ({ contractId, _max: { revision } }));
      },
      findMany: async ({ where }: { where: { OR: { contractId: string; revision: number }[] } }) => {
        const hit = d.programmes.filter((p) => where.OR.some((k) => k.contractId === p.contractId && k.revision === p.revision));
        rows.programmes += hit.length;
        return hit.map((p) => ({ contractId: p.contractId, points: [...p.points].sort((a, b) => +a.day - +b.day).map((x) => ({ day: x.day, plannedPct: dec(x.plannedPct) })) }));
      },
    },
    progressRecord: {
      groupBy: async ({ where }: { where: { contractId: { in: string[] }; day: { lt: Date } } }) => {
        const m = new Map<string, Date>();
        for (const p of d.progress) if (inIds(where, p.contractId) && p.day < where.day.lt && (!m.has(p.contractId) || p.day > m.get(p.contractId)!)) m.set(p.contractId, p.day);
        return [...m].map(([contractId, day]) => ({ contractId, _max: { day } }));
      },
      findMany: async ({ where }: { where: { OR: { contractId: string; day: Date }[] } }) => {
        const hit = d.progress.filter((p) => where.OR.some((k) => k.contractId === p.contractId && +k.day === +p.day));
        rows.progress += hit.length;
        return hit.map((p) => ({ contractId: p.contractId, day: p.day, actualPct: dec(p.actualPct) }));
      },
    },
  };
  return { client: client as unknown as Tx, rows };
}

/// The earlier loader's rule: every revision and every progress record, judged in memory.
function reference(d: Data, rows: { id: string; dateForCompletion: Date | null }[], today: string): Map<string, DelayReading> {
  const out = new Map<string, DelayReading>();
  const ids = new Set(rows.map((r) => r.id));
  for (const p of d.possessions.filter((x) => x.organisationId === d.organisationId && ids.has(x.contractId))) {
    const revs: (RevisionFacts & { points: { day: string; plannedPct: string }[] })[] = d.programmes
      .filter((x) => x.contractId === p.contractId)
      .sort((a, b) => a.revision - b.revision)
      .map((x) => ({ revision: x.revision, submittedOn: storedDay(x.submittedOn), scrutinisedOn: x.scrutinisedOn ? storedDay(x.scrutinisedOn) : null, reasonable: x.reasonable, decision: x.decision, decidedOn: x.decidedOn ? storedDay(x.decidedOn) : null, points: [...x.points].sort((a, b) => +a.day - +b.day).map((pt) => ({ day: storedDay(pt.day), plannedPct: pt.plannedPct })) }));
    const prog = programmeInForce(revs, today);
    const latest = d.progress.filter((x) => x.contractId === p.contractId && storedDay(x.day) <= today).sort((a, b) => +a.day - +b.day).at(-1) ?? null;
    const completion = rows.find((r) => r.id === p.contractId)?.dateForCompletion ?? null;
    out.set(p.contractId, inDelay({ today, possessed: storedDay(p.possessionOn) <= today, dateForCompletion: completion ? storedDay(completion) : null, programme: prog ? prog.points : null, latest: latest ? { day: storedDay(latest.day), actualPct: latest.actualPct } : null, policyPct: d.policyPct }));
  }
  return out;
}

/// A seeded generator, so every run judges the same sets.
function lcg(seed: number) {
  let s = seed >>> 0;
  return (n: number) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s >>> 8) % n; // the high bits: an LCG's low bits cycle quickly
  };
}

const TODAY = "2026-10-03";
const D = (offset: number) => dayToDate(dayPlus(TODAY, offset));

function dataset(seed: number, contracts: number) {
  const r = lcg(seed);
  const d: Data = { organisationId: "org", possessions: [], programmes: [], progress: [], policyPct: r(5) === 0 ? null : ["70", "75", "80.5"][r(3)] };
  const rows: { id: string; dateForCompletion: Date | null }[] = [];
  for (let c = 0; c < contracts; c++) {
    const id = `c${c}`;
    rows.push({ id, dateForCompletion: r(4) === 0 ? null : D(r(120) - 30) });
    if (r(6) === 0) continue; // not possessed
    d.possessions.push({ organisationId: r(15) === 0 ? "other" : "org", contractId: id, possessionOn: D(r(60) - 55) });
    const revisions = r(4);
    for (let n = 1; n <= revisions; n++) {
      const decision = ([null, "APPROVED", "APPROVED", "RETURNED"] as const)[r(4)];
      const points = Array.from({ length: r(5) }, (_, i) => ({ day: D(-60 + i * 20 + r(10)), plannedPct: String(Math.min(100, i * 25 + r(20))) }));
      // Unique days per programme, as the schema's unique (programmeId, day) requires.
      const seen = new Set<number>();
      d.programmes.push({ contractId: id, revision: n, submittedOn: D(-50), scrutinisedOn: null, reasonable: null, decision, decidedOn: decision ? D(r(20) - 15) : null, points: points.filter((p) => !seen.has(+p.day) && seen.add(+p.day)) });
    }
    const days = new Set<number>();
    for (let k = r(8); k > 0; k--) {
      const day = D(r(50) - 40);
      if (days.has(+day)) continue; // unique (contractId, day)
      days.add(+day);
      d.progress.push({ contractId: id, day, actualPct: String(r(10001) / 100) });
    }
  }
  return { d, rows };
}

describe("In Delay for many contracts, in O(contracts) rows", () => {
  it("identical to the earlier loader's reading, over many generated sets (property)", async () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const { d, rows } = dataset(seed, 25);
      const { client } = memoryClient(d);
      const got = await delayReadingsOf("org", rows, TODAY, client);
      expect(got).toEqual(reference(d, rows, TODAY));
      for (const v of got.values()) seen.add("why" in v ? `${v.state}:${v.why}` : v.state);
    }
    // The generated sets reach every reading, so the comparison is not vacuous.
    expect([...seen].sort()).toEqual(["IN_DELAY:BEHIND", "IN_DELAY:LAPSED", "NOT_JUDGED:BEFORE_PROGRAMME", "NOT_JUDGED:NOT_POSSESSED", "NOT_JUDGED:NO_PROGRAMME", "NOT_JUDGED:NO_PROGRESS", "NOT_SET", "ON_TRACK"]);
  });

  it("reads at most one programme and one progress record per contract", async () => {
    const { d, rows } = dataset(7, 200);
    const { client, rows: read } = memoryClient(d);
    const m = await delayReadingsOf("org", rows, TODAY, client);
    expect(d.progress.length).toBeGreaterThan(m.size);
    expect(read.progress).toBeLessThanOrEqual(m.size);
    expect(read.programmes).toBeLessThanOrEqual(m.size);
  });

  it("worked example: a later progress record and a later revision are not read today", async () => {
    // Possessed 1 Sep. Revision 1 approved 2 Sep: 0% on 1 Sep, 100% on 31 Oct. Revision 2 approved tomorrow.
    // Progress 20% on 1 Oct (the latest on or before 3 Oct) and 90% tomorrow. Policy 75%.
    // Planned on 1 Oct, straight line: 30/60 of 100% = 50%; 75% of it is 37.5%; 20% is below: In Delay.
    const d: Data = {
      organisationId: "org",
      possessions: [{ organisationId: "org", contractId: "k", possessionOn: dayToDate("2026-09-01") }],
      programmes: [
        { contractId: "k", revision: 1, submittedOn: dayToDate("2026-09-01"), scrutinisedOn: null, reasonable: null, decision: "APPROVED", decidedOn: dayToDate("2026-09-02"), points: [{ day: dayToDate("2026-09-01"), plannedPct: "0" }, { day: dayToDate("2026-10-31"), plannedPct: "100" }] },
        { contractId: "k", revision: 2, submittedOn: dayToDate("2026-10-02"), scrutinisedOn: null, reasonable: null, decision: "APPROVED", decidedOn: dayToDate("2026-10-04"), points: [{ day: dayToDate("2026-09-01"), plannedPct: "0" }, { day: dayToDate("2026-12-31"), plannedPct: "100" }] },
      ],
      progress: [{ contractId: "k", day: dayToDate("2026-10-01"), actualPct: "20" }, { contractId: "k", day: dayToDate("2026-10-04"), actualPct: "90" }],
      policyPct: "75",
    };
    const rows = [{ id: "k", dateForCompletion: dayToDate("2026-10-31") }];
    const { client } = memoryClient(d);
    expect((await delayReadingsOf("org", rows, TODAY, client)).get("k")).toEqual({ state: "IN_DELAY", why: "BEHIND", day: "2026-10-01", actualPct: "20", plannedPct: "50", policyPct: "75" });
  });

  it("no possessed contract: nothing read beyond the possessions", async () => {
    const { client } = memoryClient({ organisationId: "org", possessions: [], programmes: [], progress: [], policyPct: "75" });
    expect((await delayReadingsOf("org", [{ id: "x", dateForCompletion: null }], TODAY, client)).size).toBe(0);
  });
});
