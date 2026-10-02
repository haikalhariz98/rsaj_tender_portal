import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 6.6 CR-3: a server-stamped act reads the clock once, at its entry, before any lock, to the
 * second; and judges that stamp against the closing read under the locks. The clock is injected:
 * waiting for the exercise lock (`inWindow`) and the envelope lock each move it on, so a stamp
 * taken after the locks would read later than the one asserted here, and these tests fail.
 */

const CLOSING = new Date("2026-11-17T06:30:00.000Z"); // 14:30:00 in Kuala Lumpur
const PUBLISHED = new Date("2026-10-20T03:00:00.000Z");
const S = 1000;

const h = vi.hoisted(() => ({
  closing: null as Date | null,
  waitExercise: 0,
  waitEnvelopes: 0,
  created: [] as { model: string; data: Record<string, unknown> }[],
  updated: [] as { model: string; data: Record<string, unknown> }[],
}));

const advance = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/org-time", () => ({ organisationTimeZone: async () => "Asia/Kuala_Lumpur" }));
vi.mock("@/lib/people/load", () => ({ loadRoster: async () => null }));
vi.mock("@/lib/committee/sittings", () => ({ lockSittingIn: async () => null }));
vi.mock("@/lib/bids/lock", () => ({
  lockEnvelopeRows: async () => advance(h.waitEnvelopes),
  lockWithdrawalRows: async () => undefined,
  lockBoxRows: async () => undefined,
  lockExtensionRows: async () => undefined,
}));
vi.mock("@/lib/bids/repo", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/bids/repo")>();
  return {
    ...real,
    loadBidWindow: async () => ({ id: "w1", publishedAt: PUBLISHED, policySnapshot: {}, bidValidityDays: null, bidValidityProvenance: null, alternativesPermitted: null }),
    loadBoxEvents: async () => [],
    loadEnvelopes: async () => [
      { id: "e1", sequence: 1, kind: "BID", channel: "COUNTER", status: "RECEIVED", late: false, markings: "M", receivedAt: PUBLISHED, receivedSource: "SERVER", statedReceivedAt: null, receivedByPersonId: "p1", receivedBy: { id: "p1", name: "Clerk" }, withdrawal: null, parentEnvelopeId: null },
    ],
  };
});
vi.mock("../window/shared", () => ({
  exerciseIdOf: () => "x1",
  label: (_l: unknown, s: string) => s,
  audit: async () => undefined,
  activePerson: async () => ({ id: "p1", name: "Clerk" }),
  // The exercise lock: waiting for it moves the clock on, and the closing is read under it.
  inWindow: async (_id: string, fn: (tx: unknown, l: unknown) => Promise<unknown>) => {
    advance(h.waitExercise);
    const model = (name: string) => ({
      create: async ({ data }: { data: Record<string, unknown> }) => {
        h.created.push({ model: name, data });
        return { id: `${name}1`, ...data };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        h.updated.push({ model: name, data });
        return data;
      },
      updateMany: async () => ({ count: 1 }),
    });
    const tx = { bidEnvelope: model("bidEnvelope"), bidWithdrawal: model("bidWithdrawal"), boxEvent: model("boxEvent") };
    return fn(tx, { org: { id: "o1", timeZone: "Asia/Kuala_Lumpur", today: "2026-11-17" }, req: {}, ex: { id: "x1", status: "ADVERTISED", closingAt: h.closing, reference: "T/1", title: "T", sourcingMethodCode: "open_tender" } });
  },
}));

import { correctEnvelope, lockBox, recordReceiptAfterTheFact, recordReceiptNow, recordWithdrawal } from "./actions";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const RECEIPT = { exerciseId: "x1", kind: "BID", channel: "COUNTER", markings: "Tender T/1", receivedByPersonId: "p1" };
const last = (model: string) => h.created.filter((c) => c.model === model).at(-1)?.data;

beforeEach(() => {
  vi.useFakeTimers();
  h.closing = CLOSING;
  h.waitExercise = 3 * S;
  h.waitEnvelopes = 2 * S;
  h.created.length = 0;
  h.updated.length = 0;
});
afterEach(() => vi.useRealTimers());

describe("the server's stamp is read at the act's entry, before the locks (6.6 CR-3)", () => {
  it("a receipt asked for at 14:29:59.600 is stamped 14:29:59 and in time, though the locks took five seconds", async () => {
    vi.setSystemTime(new Date(CLOSING.getTime() - 400));
    const r = await recordReceiptNow({ ok: false }, form(RECEIPT));
    expect(r.ok).toBe(true);
    const row = last("bidEnvelope")!;
    expect(row.receivedAt).toEqual(new Date(CLOSING.getTime() - S));
    expect(row.late).toBe(false);
    // The clock really did move on while the act waited.
    expect(Date.now()).toBe(CLOSING.getTime() - 400 + 5 * S);
  });

  it("a receipt asked for one second after the closing is late, even with no wait", async () => {
    h.waitExercise = 0;
    h.waitEnvelopes = 0;
    vi.setSystemTime(new Date(CLOSING.getTime() + S));
    await recordReceiptNow({ ok: false }, form(RECEIPT));
    expect(last("bidEnvelope")).toMatchObject({ receivedAt: new Date(CLOSING.getTime() + S), late: true, closingAtJudged: CLOSING });
  });

  it("the stamp is judged against the closing read under the lock: an extension committed while the act waited is honoured", async () => {
    vi.setSystemTime(new Date(CLOSING.getTime() + 10 * S));
    const extended = new Date(CLOSING.getTime() + 3600 * S);
    h.closing = extended;
    await recordReceiptNow({ ok: false }, form(RECEIPT));
    expect(last("bidEnvelope")).toMatchObject({ receivedAt: new Date(CLOSING.getTime() + 10 * S), late: false, closingAtJudged: extended });
  });

  it("a receipt recorded after the event is stamped at entry too, its stated time kept beside it", async () => {
    vi.setSystemTime(new Date(CLOSING.getTime() - 400));
    const r = await recordReceiptAfterTheFact({ ok: false }, form({ ...RECEIPT, statedDay: "2026-11-17", statedTime: "14:10", entryReason: "Outage at the counter" }));
    expect(r.ok).toBe(true);
    expect(last("bidEnvelope")).toMatchObject({ receivedAt: new Date(CLOSING.getTime() - S), late: false, receivedSource: "ENTERED", statedReceivedAt: new Date("2026-11-17T06:10:00.000Z") });
  });

  it("a withdrawal asked for before the closing is stamped then, and not refused by the wait", async () => {
    vi.setSystemTime(new Date(CLOSING.getTime() - 400));
    const r = await recordWithdrawal({ ok: false }, form({ exerciseId: "x1", envelopeId: "e1", markings: "Tender T/1, envelope as marked", receivedByPersonId: "p1" }));
    expect(r.ok).toBe(true);
    expect(last("bidWithdrawal")).toMatchObject({ receivedAt: new Date(CLOSING.getTime() - S), closingAtJudged: CLOSING });
  });

  it("a correction's cut-off is judged at entry, and its stamp is the entry's", async () => {
    vi.setSystemTime(new Date(CLOSING.getTime() - 400));
    const r = await correctEnvelope({ ok: false }, form({ exerciseId: "x1", envelopeId: "e1", reason: "Typo", markings: "Tender T/1 (corrected)" }));
    expect(r.ok).toBe(true);
    expect(h.updated.at(-1)?.data).toMatchObject({ markings: "Tender T/1 (corrected)", correctedAt: new Date(CLOSING.getTime() - S) });
  });

  it("the box's lock is stamped at entry: asked for a second before the closing it is refused, though the closing passed while it waited", async () => {
    vi.setSystemTime(new Date(CLOSING.getTime() - S));
    const r = await lockBox({ ok: false }, form({ exerciseId: "x1", personId: "p1", note: "" }));
    expect(r.ok).toBe(false);
    expect(last("boxEvent")).toBeUndefined();
  });

  it("the box's lock asked for at 14:30:00.900 is stamped 14:30:00", async () => {
    vi.setSystemTime(new Date(CLOSING.getTime() + 900));
    const r = await lockBox({ ok: false }, form({ exerciseId: "x1", personId: "p1", note: "" }));
    expect(r.ok).toBe(true);
    expect(last("boxEvent")).toMatchObject({ kind: "LOCKED", occurredAt: CLOSING });
  });
});
