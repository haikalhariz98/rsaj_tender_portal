/**
 * Proves the approval-matrix editor's lock order cannot deadlock, against a real database.
 *
 *   TEST_DATABASE_URL=postgresql://.../perolehan_native_check npx tsx scripts/check-config-lock-order.ts
 *
 * A source scan reads the text of a function; it cannot see the locks a foreign key takes. Inserting an AuditEntry (or an
 * AuthorityMatrix, or a FundingRoute) takes FOR KEY SHARE on its Organisation row, and FOR UPDATE on that row conflicts
 * with it. So a writer that holds an issue and then writes its audit row can deadlock with a writer that holds the
 * organisation FOR UPDATE and waits for the issue. Three pairs are raced here, each with two transactions sequenced
 * by hand, so the outcome does not depend on timing:
 *
 *   1. saveRule (holds the issue, then audits)            against saveMatrix / startRevision (the organisation, then that issue)
 *   2. saveFundingRoute (holds the route, then audits)    against saveMatrix (the organisation, then the route, share-locked)
 *   3. issueDraft (holds the draft and the predecessor)   against startRevision from that predecessor
 *
 * Each pair is run twice: with the lock statements the editor uses (src/lib/authority/locks.ts), which must finish with
 * no deadlock, and with the organisation lock as it was before (FOR UPDATE), the control, which must deadlock. Without the
 * control this check could pass whatever the code does. Last, two organisation locks still queue (the label check stays serialised).
 *
 * Runs only against TEST_DATABASE_URL, and refuses when that names the same database as DATABASE_URL: it creates and
 * deletes a temporary organisation, and it never touches the development database. Not a vitest file: `npm test` needs no database.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

const testUrl = process.env.TEST_DATABASE_URL;
const databaseName = (url: string | undefined) => (url ? new URL(url).pathname.replace(/^\//, "") : "");
if (!testUrl) throw new Error("TEST_DATABASE_URL is not set. This check runs only against a scratch database, never DATABASE_URL.");
if (databaseName(testUrl) === databaseName(process.env.DATABASE_URL) || testUrl === process.env.DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL names the same database as DATABASE_URL. Refusing: use a scratch database.");
}
// The editor's own modules read DATABASE_URL when they are imported; point them at the scratch database too.
process.env.DATABASE_URL = testUrl;

type Tx = import("../src/lib/audit/record").Tx;

const SETTLE_MS = 15_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { writeAudit } = await import("../src/lib/audit/record");
  const { lockIssue, lockOrganisation, shareLockFundingRoute } = await import("../src/lib/authority/locks");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl, max: 12 }) });
  const TX = { maxWait: 30_000, timeout: 60_000 };

  const org = await db.organisation.create({ data: { code: `lockcheck_${Date.now()}`, name: "Lock order check" } });
  try {
    const money = { boundaryValue: "1.00", quotationFloor: "1.00", tenderFloor: "1.00", requisitionBoundary: "1.00" };
    const issue = (label: string) => db.authorityMatrix.create({ data: { organisationId: org.id, label, effectiveFrom: new Date("2026-01-01T00:00:00Z"), ...money } });
    const route = await db.fundingRoute.create({ data: { organisationId: org.id, code: "LOCKCHECK", nameEn: "Lock check route", supersedesAuthority: true } });
    const audit = (tx: Tx, entityId: string) => writeAudit(tx, { actor: { kind: "SYSTEM", label: "lock-order check" }, organisationId: org.id, entity: "AuthorityMatrix", entityId, entityLabel: "lock check" }, "UPDATE", []);

    /// The organisation lock the editor used before the fix: the control.
    const lockOrganisationForUpdate = async (tx: Tx, id: string) => {
      await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${id} FOR UPDATE`;
    };

    /// How many statements are waiting on a lock in this database now.
    const waiting = async () => {
      const rows = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
      return rows[0].n;
    };
    const untilWaiting = async (n: number) => {
      const until = Date.now() + SETTLE_MS;
      while ((await waiting()) < n) {
        if (Date.now() > until) throw new Error("FAILED: the second transaction never waited on the first (the race did not set up)");
        await sleep(50);
      }
    };

    type Outcome = { aError: string | null; bError: string | null };
    const deadlocked = (e: string | null) => e !== null && /40P01|deadlock/i.test(e);

    /// A holds a row (holdA), B takes the organisation then waits on that row (bWaits), then A writes its audit row and both finish.
    async function race(holdA: (tx: Tx) => Promise<void>, lockOrg: (tx: Tx, id: string) => Promise<void>, bWaits: (tx: Tx) => Promise<void>, auditId: string): Promise<Outcome> {
      let release!: () => void;
      const released = new Promise<void>((r) => (release = r));
      let aHeld!: () => void;
      const held = new Promise<void>((r) => (aHeld = r));
      const a = db
        .$transaction(async (tx) => {
          await holdA(tx);
          aHeld();
          await released;
          await audit(tx, auditId);
        }, TX)
        .then(() => null, (e: unknown) => String(e));
      await held;
      const b = db
        .$transaction(async (tx) => {
          await lockOrg(tx, org.id);
          await bWaits(tx);
        }, TX)
        .then(() => null, (e: unknown) => String(e));
      await untilWaiting(1);
      release();
      const [aError, bError] = await Promise.all([a, b]);
      return { aError, bError };
    }

    const pairs: { name: string; run: (lockOrg: typeof lockOrganisation) => Promise<Outcome> }[] = [
      {
        name: "saveRule against saveMatrix on one draft",
        run: async (lockOrg) => {
          const x = await issue(`pair1-${Date.now()}`);
          return race((tx) => lockIssue(tx, x.id), lockOrg, (tx) => lockIssue(tx, x.id), x.id);
        },
      },
      {
        name: "saveFundingRoute against saveMatrix naming that route",
        run: async (lockOrg) => {
          return race(
            async (tx) => {
              await tx.fundingRoute.update({ where: { id: route.id }, data: { nameEn: `Lock check route ${Date.now()}` } });
            },
            lockOrg,
            (tx) => shareLockFundingRoute(tx, org.id, route.code),
            route.id,
          );
        },
      },
      {
        name: "issueDraft against startRevision from the predecessor",
        run: async (lockOrg) => {
          const predecessor = await issue(`pair3-predecessor-${Date.now()}`);
          const draft = await issue(`pair3-draft-${Date.now()}`);
          return race(
            async (tx) => {
              await lockIssue(tx, draft.id);
              await tx.authorityMatrix.update({ where: { id: predecessor.id }, data: { effectiveTo: new Date("2026-12-31T00:00:00Z") } });
            },
            lockOrg,
            (tx) => lockIssue(tx, predecessor.id),
            draft.id,
          );
        },
      },
    ];

    let failed = 0;
    for (const pair of pairs) {
      const fixed = await pair.run(lockOrganisation);
      const ok = fixed.aError === null && fixed.bError === null;
      console.log(`${ok ? "ok  " : "FAIL"} ${pair.name}: both finished, no deadlock${ok ? "" : ` (A: ${fixed.aError}; B: ${fixed.bError})`}`);
      if (!ok) failed++;
      const control = await pair.run(lockOrganisationForUpdate);
      const seen = deadlocked(control.aError) || deadlocked(control.bError);
      console.log(`${seen ? "ok  " : "FAIL"} ${pair.name}: control (organisation FOR UPDATE) deadlocks${seen ? "" : ", so this check could not have seen the defect"}`);
      if (!seen) failed++;
    }

    // The label check stays serialised: a second organisation lock waits for the first to commit.
    let firstDone = false;
    let secondSawFirstDone: boolean | null = null;
    let go!: () => void;
    const goOn = new Promise<void>((r) => (go = r));
    let first!: () => void;
    const firstHolds = new Promise<void>((r) => (first = r));
    const t1 = db.$transaction(async (tx) => {
      await lockOrganisation(tx, org.id);
      first();
      await goOn;
      firstDone = true;
    }, TX);
    await firstHolds;
    const t2 = db.$transaction(async (tx) => {
      await lockOrganisation(tx, org.id);
      secondSawFirstDone = firstDone;
    }, TX);
    await untilWaiting(1);
    go();
    await Promise.all([t1, t2]);
    const queued = secondSawFirstDone === true;
    console.log(`${queued ? "ok  " : "FAIL"} two organisation locks queue: the second ran only after the first finished`);
    if (!queued) failed++;

    if (failed > 0) throw new Error(`FAILED: ${failed} check(s) did not hold`);
    console.log("OK");
  } finally {
    // Cascades to the temporary issues, route and audit rows.
    await db.organisation.delete({ where: { id: org.id } }).catch((e) => console.error("cleanup failed:", e));
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
