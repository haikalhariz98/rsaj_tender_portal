import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/// The columns sealed until disclosure (OD-1, ADR 0012), omitted from every query.
export const SEALED_OMIT = { companyEstimateVersion: { value: true, reason: true } } as const;

// Next.js clears the module cache on every hot reload in dev, which would leak a
// new pool of Postgres connections each time. Stash the client on globalThis so
// reloads reuse one. In production the module is only evaluated once.
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createClient>;
};

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — copy .env.example to .env");
  }

  // Prisma 7 talks to Postgres through a driver adapter rather than a bundled engine.
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // 6.2 sealed-figure rule (ADR 0012): the company estimate's figure and amendment reason
    // are never read by default. One accessor un-omits them: readSealedFigures in
    // src/lib/scope/estimate-store.ts (source-scanned).
    omit: SEALED_OMIT,
  });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
