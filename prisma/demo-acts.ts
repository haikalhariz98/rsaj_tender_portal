/**
 * The demo's acts, run through the product's own server actions on a demo clock (6.13 Part A step 5).
 *
 * A contract past its date for completion cannot be told by writing rows by hand without restating every act it went
 * through; so from its formation on, demo_con13's history is made by the acts themselves: each server action is called
 * with the form the drawer posts, at the instant the demo says it happened. What makes that possible, and only inside
 * `act()`:
 *
 * - The clock. Every act reads the server's clock once on entry (`new Date()`); here `new Date()` and `Date.now()`
 *   answer the act's instant (written as the organisation's local time, Kuala Lumpur), so the act's day, its stamps
 *   and the trail's `at` are the demo's. Date is swapped only while an act runs (and `instanceof Date` holds for any
 *   date, whichever constructor made it); outside `act()` it is the real one. A column Prisma stamps itself
 *   (`@updatedAt`) keeps the real instant: the demo's dates are its acts' own columns and the trail's `at`.
 * - Raw SQL: no act the demo runs inserts a row by raw SQL (the only raw insert, a document's bytes, belongs to an
 *   upload, which the demo writes as rows with demo ids); every row the acts make goes through the client below.
 * - Demo ids. Every row an act creates (and every row it creates nested in it) is given a `demo_` id from the
 *   sub-prefix of its model below, so the wipe finds it exactly; the approval routes take the claimed numbered range
 *   `demo_ai131`–`159` (their steps `demo_as<n>_<sequence>`), committee matters `demo_d60`–`79`, sittings
 *   `demo_mt20`–`29`. A model with no sub-prefix here stops the load naming it (never a generated id).
 * - Cache revalidation. `next/cache` exists only inside Next; outside it every act's `revalidatePath` is a no-op here.
 *
 * Nothing else is replaced: the act locks, re-reads, judges by its own rule, writes and audits exactly as it does from
 * the screen, and a refusal stops the load naming the act and the reason (X-10 c). This module installs itself on
 * import and must be imported before anything that reads `src/lib/db` (the product's client is the one built here,
 * with the product's own options).
 */

import Module, { createRequire, register } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

// ------------------------------------------------------------------ next/cache outside Next

const STUB = "data:text/javascript," + encodeURIComponent("export function revalidatePath() {}\nexport function revalidateTag() {}\nexport function refresh() {}\n");
const STUBBED = new Set(["next/cache"]);
{
  const m = Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown };
  const load = m._load;
  m._load = function (request: string, ...rest: unknown[]) {
    if (STUBBED.has(request)) return { revalidatePath() {}, revalidateTag() {}, refresh() {} };
    return load.call(this, request, ...rest);
  };
  register(
    "data:text/javascript," + encodeURIComponent(`export async function resolve(s, c, n) { if (${JSON.stringify([...STUBBED])}.includes(s)) return { url: ${JSON.stringify(STUB)}, shortCircuit: true }; return n(s, c); }`),
    pathToFileURL(__filename),
  );
}

// ------------------------------------------------------------------ the clock

const RealDate = Date;
let fixed: number | null = null;
class DemoDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0 && fixed != null) super(fixed);
    else super(...(args as []));
  }
  static now() {
    return fixed ?? RealDate.now();
  }
  /// Any date is a Date, whichever constructor made it (a row read before the act, a driver's own).
  static [Symbol.hasInstance](x: unknown) {
    return x instanceof RealDate;
  }
}
/// The demo's clock is in place only while an act runs; outside it, Date is the real one.
async function onDemoClock<T>(when: string, fn: () => Promise<T>): Promise<T> {
  fixed = kl(when).getTime();
  globalThis.Date = DemoDate as unknown as DateConstructor;
  try {
    return await fn();
  } finally {
    globalThis.Date = RealDate;
    fixed = null;
  }
}

/// A local time in Kuala Lumpur ("2026-06-09T10:00", UTC+8, no daylight saving) as the instant.
export const kl = (local: string) => new RealDate(RealDate.parse(`${local}:00.000+08:00`));

// ------------------------------------------------------------------ demo ids

const P = "demo_";
/// Each model an act may create, and its sub-prefix (grepped free; the wipe matches each exactly).
export const ACT_PREFIX: Readonly<Record<string, string>> = {
  AuditEntry: "lau",
  // The contract's formation.
  ContractAssemblyPart: "lap",
  FormationCheck: "lfc",
  ContractReconciliation: "lrc",
  ReconciliationAmendment: "lam",
  ArithmeticCorrection: "lac",
  RateComparison: "lrt",
  ContractBaseline: "lvb",
  ContractSection: "lvs",
  LegalReview: "llr",
  ContractSignature: "lsi",
  IntegrityBriefing: "lib",
  ContractSoAssignment: "lso",
  IssuedCopy: "lcp",
  // Supervision.
  Possession: "lpo",
  WorkProgramme: "lpg",
  ProgrammePoint: "lpn",
  ProgressRecord: "lpr",
  SiteDiaryEntry: "lsd",
  DiaryEndorsement: "len",
  SiteMeeting: "lsm",
  ComplianceObservation: "lob",
  ProgrammeDirection: "ldi",
  SiteRecordsHandover: "lho",
  SoDelegation: "ldl",
  SoDelegationScope: "lds",
  ContractParty: "lpt",
  // Payment and the damages chain.
  PaymentCalendar: "lcl",
  InterimValuation: "liv",
  ValuationDeduction: "lde",
  MaterialLine: "lml",
  PartyLine: "lpy",
  PendingDeduction: "lpd",
  AdvancePayment: "lad",
  AdvanceRecoupmentRow: "lrr",
  RetentionRelease: "lrl",
  LadWarning: "llw",
  NonCompletion: "lnc",
  FinancePayment: "lfp",
  // The certificate core.
  Certificate: "lct",
  CertificateSignature: "lsg",
  CertificateDocument: "lcd",
  CertificateOverride: "lov",
  RoutingCheck: "lck",
  // Variations and the adjustment of the contract sum.
  Variation: "vvo",
  VariationApproval: "vva",
  VariationInstruction: "vin",
  VariationMeasurement: "vms",
  DayworkRecord: "vdw",
  VariationCertificate: "vvc",
  SumAdjustment: "vpj",
  SumAdjustmentLine: "vpl",
  // Sittings.
  MeetingAttendance: "lat",
  Vote: "lvt",
  DecisionRecusal: "lrx",
};
/// Numbered ranges claimed in the plan (6.13 Part A: routes 131–159, sittings 20–29, matters 60–79).
const NUMBERED: Readonly<Record<string, { prefix: string; from: number; to: number }>> = {
  ApprovalInstance: { prefix: "ai", from: 131, to: 159 },
  Meeting: { prefix: "mt", from: 20, to: 29 },
  CommitteeDecision: { prefix: "d", from: 60, to: 79 },
};
const counters = new Map<string, number>();
let idsOn = false;

/// The demo's next id for a model (numbered ranges claimed; sub-prefixed counters otherwise).
export function demoIdFor(model: string): string {
  const n = NUMBERED[model];
  if (n) {
    const next = Math.max(counters.get(model) ?? n.from - 1, numberedFloor[model] ?? 0) + 1;
    if (next > n.to) throw new Error(`demo acts: the claimed range for ${model} (${P}${n.prefix}${n.from}–${n.to}) is used up`);
    counters.set(model, next);
    return `${P}${n.prefix}${next}`;
  }
  const pre = ACT_PREFIX[model];
  if (!pre) throw new Error(`demo acts: an act created a ${model}, which has no demo sub-prefix (add one to ACT_PREFIX in prisma/demo-acts.ts)`);
  const next = (counters.get(model) ?? 0) + 1;
  counters.set(model, next);
  return `${P}${pre}${next}`;
}
/// Ids in a numbered range the demo wrote itself, before the acts: the acts continue after them.
const numberedFloor: Record<string, number> = {};
export function claimNumbered(model: keyof typeof NUMBERED, upTo: number) {
  numberedFloor[model] = Math.max(numberedFloor[model] ?? 0, upTo);
}

/// The relations of every model, read from the schema (which nested `create` makes which model), and the columns
/// stamped with the clock by default (written with the act's instant, never the database's).
const SCHEMA = (() => {
  const src = readFileSync(path.join(__dirname, "schema.prisma"), "utf8");
  const models = new Set([...src.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]));
  const relations: Record<string, Record<string, string>> = {};
  const stamped: Record<string, string[]> = {};
  for (const m of src.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const fields: Record<string, string> = {};
    for (const f of m[2].matchAll(/^\s+(\w+)\s+(\w+)(\[\])?\??/gm)) if (models.has(f[2])) fields[f[1]] = f[2];
    relations[m[1]] = fields;
    stamped[m[1]] = [...m[2].matchAll(/^\s+(\w+)\s+DateTime\b[^\n]*@default\(now\(\)\)/gm)].map((f) => f[1]);
  }
  return { relations, stamped };
})();

type Row = Record<string, unknown>;
const rows = (x: unknown): Row[] => (Array.isArray(x) ? (x as Row[]) : x && typeof x === "object" ? [x as Row] : []);

/// Give a row being created its demo id and its clock stamps, then the rows created nested in it.
function inject(model: string, data: Row | undefined) {
  if (!data) return;
  if (data.id == null) data.id = demoIdFor(model);
  for (const f of SCHEMA.stamped[model] ?? []) if (data[f] == null && fixed != null) data[f] = new RealDate(fixed);
  children(model, data, data.id as string);
}

/// The rows created nested in a row (on create or update); a route's steps take the route's number.
function children(model: string, data: Row | undefined, parentId: string | null) {
  if (!data) return;
  for (const [field, target] of Object.entries(SCHEMA.relations[model] ?? {})) {
    const nested = data[field] as Row | undefined;
    if (!nested || typeof nested !== "object") continue;
    for (const child of rows(nested.create)) {
      // demo_ai131's steps are demo_as131_1, demo_as131_2…
      if (target === "ApprovalStep" && child.id == null && parentId && /^demo_ai\d+$/.test(parentId)) child.id = `${parentId.replace("demo_ai", "demo_as")}_${child.sequence}`;
      inject(target, child);
    }
    for (const child of rows((nested.createMany as Row | undefined)?.data)) inject(target, child);
    for (const c of rows(nested.connectOrCreate)) inject(target, c.create as Row);
  }
}

/// The product's client, with the demo's ids: built on first use, with the product's own options (src/lib/db.ts reads
/// this one from `globalThis.prisma` instead of building its own, so it must not be read before this module runs).
function build() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set — copy .env.example to .env");
  // By now src/lib/db.ts has taken this proxy as its client: its options are read from it, never restated here. Read
  // synchronously (a property read builds the client), so through Node's own loader rather than an import.
  const { SEALED_OMIT } = createRequire(__filename)("../src/lib/db") as typeof import("../src/lib/db");
  const base = new PrismaClient({ adapter: new PrismaPg({ connectionString }), log: ["error"], omit: SEALED_OMIT });
  return base.$extends({
    query: {
      $allModels: {
        async create({ model, args, query }) {
          if (idsOn) inject(model, args.data as Row);
          return query(args);
        },
        async createMany({ model, args, query }) {
          if (idsOn) for (const r of rows(args.data)) inject(model, r);
          return query(args);
        },
        async createManyAndReturn({ model, args, query }) {
          if (idsOn) for (const r of rows(args.data)) inject(model, r);
          return query(args);
        },
        async upsert({ model, args, query }) {
          if (idsOn) inject(model, args.create as Row);
          return query(args);
        },
        async update({ model, args, query }) {
          if (idsOn) children(model, args.data as Row, ((args.where as Row | undefined)?.id as string | undefined) ?? null);
          return query(args);
        },
      },
    },
  });
}
let real: ReturnType<typeof build> | null = null;
const client = new Proxy({} as object, {
  get(_, key) {
    real ??= build();
    const v = (real as unknown as Record<string | symbol, unknown>)[key];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});
(globalThis as unknown as { prisma?: unknown }).prisma = client;

/// The product's client, as the acts use it (reads outside `act()` go through it unchanged).
export const actDb = client as unknown as PrismaClient;

// ------------------------------------------------------------------ act()

type FormState = { ok: boolean; message?: string; errors?: Record<string, string> };
type Action = (prev: FormState, data: FormData) => Promise<FormState>;

/**
 * Run one act at its instant (Kuala Lumpur local time), with the form its drawer posts. A refusal stops the load
 * naming the act and what refused it. `ids: false` leaves the act's own generated ids (a throwaway database).
 */
export async function act(when: string, what: string, action: Action, fields: Record<string, string | string[] | null | undefined>, opts: { ids?: boolean } = {}): Promise<FormState> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v == null) continue;
    for (const x of Array.isArray(v) ? v : [v]) form.append(k, x);
  }
  idsOn = opts.ids ?? true;
  try {
    const r = await onDemoClock(when, () => action({ ok: false }, form));
    if (!r.ok) throw new Error(`Demo act refused (${what}, ${when}): ${r.message ?? ""} ${r.errors ? JSON.stringify(r.errors) : ""}`.trim());
    return r;
  } finally {
    idsOn = false;
  }
}

/// Run lib code (a reader or a pure rule needing "today") at an instant, without creating rows.
export async function at<T>(when: string, fn: () => Promise<T>): Promise<T> {
  return onDemoClock(when, fn);
}

/// A route handler's act (the committee's vote API) at its instant: a refusal (not 2xx) stops the load.
export async function actRoute(when: string, what: string, handler: () => Promise<Response>): Promise<unknown> {
  idsOn = true;
  try {
    const r = await onDemoClock(when, handler);
    const body = await r.json();
    if (!r.ok) throw new Error(`Demo act refused (${what}, ${when}): ${JSON.stringify(body)}`);
    return body;
  } finally {
    idsOn = false;
  }
}
