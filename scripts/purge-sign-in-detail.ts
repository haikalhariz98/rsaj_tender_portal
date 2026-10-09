/**
 * Delete the sign-in addresses that are past their retention period (ADR 0034 D16, ruling O-1).
 *
 *   npm run auth:purge-sign-in-detail -- --organisation CODE             delete them
 *   npm run auth:purge-sign-in-detail -- --organisation CODE --dry-run   say how many, delete nothing
 *   npm run auth:purge-sign-in-detail -- --help
 *
 * Run by an operator with access to the server, as the database's owner: the application's login has no DELETE on the table, and the table's own trigger refuses every
 * delete while the retention period is unset and any delete of a sign-in that is not older than it, whoever asks. Nothing schedules this. The sign-in events themselves are
 * permanent; only the address and the device go. Every run is audited, as the system, with the cutoff and the count. The logic is in src/lib/auth/purge.ts, which the tests exercise.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { purgeSignInDetail, purgeSummary } from "../src/lib/auth/purge";

const HELP = `
Delete the sign-in addresses that are past the organisation's retention period.

  npm run auth:purge-sign-in-detail -- --organisation CODE
  npm run auth:purge-sign-in-detail -- --organisation CODE --dry-run

The period is the organisation's own (Configuration, Sign-in settings). While it is not set, nothing is deleted. The command connects as the database's owner
(MIGRATE_DATABASE_URL, else DATABASE_URL): the application's login cannot delete these rows. The sign-in events are kept; only the address and device are removed.
`;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}
const at = args.indexOf("--organisation");
const code = at >= 0 ? args[at + 1] : undefined;
const unknown = args.filter((a, i) => !["--organisation", "--dry-run"].includes(a) && i !== at + 1);
if (!code || unknown.length > 0) {
  console.error(`${unknown.length > 0 ? `Unknown option: ${unknown.join(" ")}\n` : ""}Name the organisation: --organisation CODE.\n${HELP}`);
  process.exit(2);
}
const dryRun = args.includes("--dry-run");

async function main() {
  const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Neither MIGRATE_DATABASE_URL nor DATABASE_URL is set.");
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const organisation = await client.organisation.findUnique({ where: { code: code! }, select: { id: true, name: true } });
    if (!organisation) {
      console.error(`There is no organisation with the code "${code}".`);
      process.exitCode = 1;
      return;
    }
    const outcome = await client.$transaction((tx) => purgeSignInDetail(tx as unknown as Parameters<typeof purgeSignInDetail>[0], { organisationId: organisation.id, now: new Date(), dryRun }));
    if (!outcome.ok) {
      console.log(outcome.message);
      return;
    }
    console.log(`${organisation.name}: ${purgeSummary(outcome)}`);
  } finally {
    await client.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
