/**
 * Proves `issueReference` never issues a reference twice under concurrency.
 *
 *   npx tsx scripts/check-numbering-concurrency.ts
 *
 * Against the configured database (DATABASE_URL): creates a temporary series, runs 20
 * issues in parallel transactions, and checks the references are distinct and
 * contiguous. Then shows the unique backstop refusing a duplicate reference. Removes
 * everything it created, whatever happens. Not a vitest file: `npm test` needs no
 * database.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { issueReference } from "../src/lib/numbering/issue";

const N = 20;
// More connections than issues, so every transaction is genuinely in flight at once
// and waits on the row lock rather than on the pool.
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: N + 5 }) });

async function main() {
  const org = await db.organisation.findFirst({ select: { id: true } });
  if (!org) throw new Error("No organisation. Run the seed first.");
  const key = `concurrency_check_${Date.now()}`;
  const on = new Date("2026-09-30T00:00:00.000Z");
  const series = await db.numberingSeries.create({
    data: { organisationId: org.id, key, nameEn: "Concurrency check", pattern: "CHK/{SERIAL}/{YEAR}", padding: 4, resetOn: "CALENDAR_YEAR", nextSerial: 1, serialPeriod: "2026" },
  });
  const created: string[] = [];
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
    console.log("OK");
  } finally {
    await db.requisition.deleteMany({ where: { id: { in: created } } });
    await db.numberingSeries.delete({ where: { id: series.id } });
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
