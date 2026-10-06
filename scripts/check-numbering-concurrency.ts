/**
 * Proves `issueReference` never issues a reference twice under concurrency.
 *
 *   npx tsx scripts/check-numbering-concurrency.ts
 *
 * Against the configured database (DATABASE_URL): creates a temporary series, runs 20
 * issues in parallel transactions, and checks the references are distinct and
 * contiguous. Then shows the unique backstop refusing a duplicate reference. Then the
 * same for the committee sitting path (sign-in programme Phase 0), through
 * `createNumberedSitting`, the function `scheduleSitting` numbers with: 20 sittings
 * scheduled at once from one series, and a sitting whose number is typed drawing nothing.
 * Removes everything it created, whatever happens. Not a vitest file: `npm test` needs no
 * database.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { createNumberedSitting } from "../src/lib/committee/sitting-number";
import { issueReference } from "../src/lib/numbering/issue";

const N = 20;
// More connections than issues, so every transaction is genuinely in flight at once
// and waits on the row lock rather than on the pool.
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: N + 5 }) });

/// The sitting path: the same lock, reached through the function the scheduling action calls.
async function sittingPath(organisationId: string, on: Date, cleanup: { committeeId: string | null; seriesId: string | null }) {
  const key = `sitting_check_${Date.now()}`;
  const series = await db.numberingSeries.create({
    data: { organisationId, key, nameEn: "Sitting concurrency check", pattern: "SIT/{SERIAL}/{YEAR}", padding: 4, resetOn: "CALENDAR_YEAR", nextSerial: 1, serialPeriod: "2026" },
  });
  cleanup.seriesId = series.id;
  const committee = await db.committee.create({
    data: { organisationId, code: `CHK${Date.now()}`, nameEn: "Concurrency check committee", mandate: "check", governingSource: "check" },
  });
  cleanup.committeeId = committee.id;
  const meetingDate = new Date("2026-10-30T00:00:00.000Z");
  const rows = await Promise.all(
    Array.from({ length: N }, () =>
      db.$transaction(
        (tx) => createNumberedSitting(tx, { organisationId, committeeId: committee.id, meetingDate, agenda: "", typedReference: null, day: on, seriesKey: key }),
        { maxWait: 30_000, timeout: 30_000 },
      ),
    ),
  );
  const refs = rows.map((r) => r.reference);
  const serials = refs.map((r) => Number(r.split("/")[1])).sort((a, b) => a - b);
  const contiguous = serials.every((s, i) => s === i + 1);
  const after = await db.numberingSeries.findUniqueOrThrow({ where: { id: series.id } });
  const stored = await db.meeting.count({ where: { committeeId: committee.id } });
  console.log(`sittings: scheduled ${rows.length}, distinct ${new Set(refs).size}, contiguous ${contiguous}, stored ${stored}, next serial ${after.nextSerial}`);
  if (new Set(refs).size !== N || !contiguous || stored !== N || after.nextSerial !== N + 1) throw new Error("FAILED: the sitting path issued a duplicate or missing reference");

  // A typed number is the sitting's own: it draws nothing from the series.
  const typed = await db.$transaction((tx) => createNumberedSitting(tx, { organisationId, committeeId: committee.id, meetingDate, agenda: "", typedReference: "TYPED-1", day: on, seriesKey: key }));
  const untouched = await db.numberingSeries.findUniqueOrThrow({ where: { id: series.id } });
  console.log(`sittings: a typed number kept as typed (${typed.reference}), series untouched: ${untouched.nextSerial === N + 1}`);
  if (typed.reference !== "TYPED-1" || untouched.nextSerial !== N + 1) throw new Error("FAILED: a typed sitting number drew from the series");

  // A series that is gone refuses: no number is improvised, and the sitting is not created.
  await db.numberingSeries.delete({ where: { id: series.id } });
  cleanup.seriesId = null;
  let refused = false;
  try {
    await db.$transaction((tx) => createNumberedSitting(tx, { organisationId, committeeId: committee.id, meetingDate, agenda: "", typedReference: null, day: on, seriesKey: key }));
  } catch (e) {
    refused = (e as Error).name === "NumberingError";
  }
  const after2 = await db.meeting.count({ where: { committeeId: committee.id } });
  console.log(`sittings: a missing series refused: ${refused}, no sitting created: ${after2 === N + 1}`);
  if (!refused || after2 !== N + 1) throw new Error("FAILED: a missing series did not refuse");
}

async function main() {
  const org = await db.organisation.findFirst({ select: { id: true } });
  if (!org) throw new Error("No organisation. Run the seed first.");
  const key = `concurrency_check_${Date.now()}`;
  const on = new Date("2026-09-30T00:00:00.000Z");
  const series = await db.numberingSeries.create({
    data: { organisationId: org.id, key, nameEn: "Concurrency check", pattern: "CHK/{SERIAL}/{YEAR}", padding: 4, resetOn: "CALENDAR_YEAR", nextSerial: 1, serialPeriod: "2026" },
  });
  const created: string[] = [];
  const sittingCleanup = { committeeId: null as string | null, seriesId: null as string | null, async run() {
    if (this.committeeId) await db.committee.delete({ where: { id: this.committeeId } }).catch(() => undefined);
    if (this.seriesId) await db.numberingSeries.delete({ where: { id: this.seriesId } }).catch(() => undefined);
  } };
  try {
    const refs = await Promise.all(
      Array.from({ length: N }, () =>
        db.$transaction((tx) => issueReference(tx, org.id, key, on), { maxWait: 30_000, timeout: 30_000 }),
      ),
    );
    const distinct = new Set(refs);
    const serials = refs.map((r) => Number(r.split("/")[1])).sort((a, b) => a - b);
    const contiguous = serials.every((s, i) => s === i + 1);
    const after = await db.numberingSeries.findUniqueOrThrow({ where: { id: series.id } });
    console.log(`issued ${refs.length}, distinct ${distinct.size}, contiguous ${contiguous}, next serial ${after.nextSerial}`);
    if (distinct.size !== N || !contiguous || after.nextSerial !== N + 1) throw new Error("FAILED: duplicate or missing references");

    // The backstop: a second requisition with a reference already issued is refused by
    // the unique index, whatever the application does.
    const person = await db.person.findFirst({ where: { organisationId: org.id }, select: { id: true } });
    if (person) {
      const base = {
        organisationId: org.id, reference: refs[0], requestingUnitCode: "X", requestingPersonId: person.id, title: "concurrency check",
        justification: "", needStatement: "", costCentreCode: "", accountCode: "", placeOfDelivery: "",
        dateRequired: on, estimatedValue: "1.00", raisedOn: on,
      };
      const first = await db.requisition.create({ data: base });
      created.push(first.id);
      let refused = false;
      try {
        const dup = await db.requisition.create({ data: base });
        created.push(dup.id);
      } catch {
        refused = true;
      }
      console.log(`unique backstop refused a duplicate reference: ${refused}`);
      if (!refused) throw new Error("FAILED: the unique reference accepted a duplicate");
    }
    await sittingPath(org.id, on, sittingCleanup);
    console.log("OK");
  } finally {
    await sittingCleanup.run();
    await db.requisition.deleteMany({ where: { id: { in: created } } });
    await db.numberingSeries.delete({ where: { id: series.id } });
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
