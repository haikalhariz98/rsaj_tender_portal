/**
 * Loads starter packs into the deployment's organisation (ADR 0043 D1):
 *
 *   npm run pack -- generic                 say what would be written and skipped; writes nothing
 *   npm run pack -- rsaj,generic --apply    load them, in that order (the first pack wins)
 *
 * The organisation is the one named by ORGANISATION_CODE. One transaction, under the organisation's lock; it fills only empty groups and
 * empty lists, never overwrites, and a second run writes nothing. Any fault refuses the whole run and exits 1. Packs load only while
 * approval by another admin is off (SP-23); the development fill only on a database that holds the demonstration.
 */
import "dotenv/config";

import { demoIsLoaded } from "../prisma/demo-sign-in";
import { describeRun, packsNamed } from "../prisma/packs";
import { db } from "../src/lib/db";
import { ORGANISATION_CODE } from "../src/lib/org";
import { loadPacks } from "../src/lib/starter/apply";

async function main() {
  const apply = process.argv.includes("--apply");
  const names = (process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "").split(",").map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) throw new Error("Name the packs: npm run pack -- <pack>[,<pack>...] [--apply]. The packs are generic, rsaj and dev-fill.");
  const org = await db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true, name: true } });
  if (!org) throw new Error(`There is no organisation with the code ${ORGANISATION_CODE}. Run npm run setup first.`);
  const result = await loadPacks(db, org.id, await packsNamed(names), { apply, demoIsLoaded: (tx) => demoIsLoaded(tx as never) });
  console.log(`${org.name} (${ORGANISATION_CODE}), packs ${names.join(", ")}:`);
  for (const line of describeRun(result, apply)) console.log(line);
  if (result.faults.length > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
