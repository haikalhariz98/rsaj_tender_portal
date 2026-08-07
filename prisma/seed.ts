import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const ORG_CODE = process.env.ORGANISATION_CODE ?? "ORG";
const ORG_NAME = process.env.ORGANISATION_NAME ?? "Your organisation";

/**
 * Creates the organisation and nothing else.
 *
 * There is deliberately no sample configuration: an authority matrix, its offices
 * and its committees are the customer's own policy, and shipping someone else's as
 * a starting point is how a wrong threshold ends up in production. Every screen
 * handles the unconfigured state and says what is missing.
 */
async function main() {
  const organisation = await db.organisation.upsert({
    where: { code: ORG_CODE },
    update: { name: ORG_NAME },
    create: { code: ORG_CODE, name: ORG_NAME },
  });

  console.log(`Seeded organisation ${organisation.code} — "${organisation.name}".`);
  console.log("No authority matrix, offices or committees: configure those in the portal.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
