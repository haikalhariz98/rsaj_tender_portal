/**
 * Read-only: lists every administrator account whose Person holds a live office, committee seat or delegation (ADR 0034 D9: administration is kept apart
 * from transactions). Phase 2a made the rule, but before it any Person could be given a holding, so a database from before it may break it, and nothing
 * else says so. This finds them and changes nothing: ending a holding is a decision (`endAssignment`, `vacateSeat`, a delegation's end date), and so is
 * giving the administrator a Person of their own.
 *
 *   npm run auth:holdings
 *
 * Exit status 1 when it finds any, so a deployment can run it as a check.
 */
import "dotenv/config";

import { administratorHoldingViolations } from "../src/lib/auth/administration-guard";
import { db } from "../src/lib/db";

async function main() {
  const found = await db.$transaction((tx) => administratorHoldingViolations(tx, new Date()));
  if (found.length === 0) {
    console.log("No administrator account's Person holds an office, a committee seat or a delegation.");
    return;
  }
  console.log(`${found.length} administrator account${found.length === 1 ? "" : "s"} whose Person holds something that has not ended:`);
  for (const v of found) console.log(`  ${v.loginName} (${v.personName}, account ${v.status.toLowerCase()}): ${v.words}`);
  process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
