import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const count = await db.item.count();
  if (count > 0) {
    console.log(`Skipping seed — ${count} item(s) already present.`);
    return;
  }

  await db.item.createMany({
    data: [
      { title: "Rename the project from the myapp placeholder" },
      { title: "Replace the Item model with the real domain model" },
      { title: "Delete this seed data" },
    ],
  });

  console.log("Seeded 3 items.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
