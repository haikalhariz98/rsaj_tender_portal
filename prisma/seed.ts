import "dotenv/config";

import { db } from "../src/lib/db";
import { loadPacks } from "../src/lib/starter/apply";
import { demoIsLoaded } from "./demo-sign-in";
import { describeRun, packsNamed } from "./packs";

const ORG_CODE = process.env.ORGANISATION_CODE ?? "ORG";
const ORG_NAME = process.env.ORGANISATION_NAME ?? "Your organisation";

/**
 * Creates the organisation and loads STARTER_PACKS (ADR 0043 D1): `generic` unless set; an RSAJ deployment sets `rsaj,generic` before its
 * first `npm run setup`; empty loads none.
 *
 * The generic pack holds working values that are not authority (sign-in settings, upload rules, classes, supplier lists, numbering). An
 * authority matrix, its offices and its committees are the customer's own policy and never come from here: the RSAJ pack brings RSAJ's
 * stated values, its limits only as a draft a named person puts in force. Loading fills only what is unset, so re-running setup writes
 * nothing; on an organisation already live (approval by another admin on) the packs refuse and say so.
 */
async function main() {
  const organisation = await db.organisation.upsert({
    where: { code: ORG_CODE },
    // Created with the name, never renamed: the legal name is edited under Configuration, Organisation, and every printed record
    // (certificates, award letters) names its issuer from this row. Re-running setup must not put the placeholder back over it.
    update: {},
    create: { code: ORG_CODE, name: ORG_NAME },
  });
  console.log(`Seeded organisation ${organisation.code} — "${organisation.name}".`);

  const names = (process.env.STARTER_PACKS ?? "generic").split(",").map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) return;
  const result = await loadPacks(db, organisation.id, await packsNamed(names), { apply: true, demoIsLoaded: (tx) => demoIsLoaded(tx as never) });
  console.log(`Starter packs ${names.join(", ")}:`);
  for (const line of describeRun(result, true)) console.log(line);
  if (result.faults.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
