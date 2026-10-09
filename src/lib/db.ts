import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ambientStore, nested, type Ambient, type SavepointSql } from "@/lib/ambient/ambient-tx";

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

const client = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = client;
}

/**
 * The application client. While an ambient transaction is set (`src/lib/ambient/ambient-tx.ts`: a two-person change being applied, or rehearsed) it stands for that
 * transaction, and a `$transaction` on it is a savepoint of it. Everywhere else it is the client, unchanged.
 */
export const db: typeof client = new Proxy(client, {
  get(target, prop) {
    const ambient: Ambient | undefined = ambientStore.getStore();
    if (ambient && typeof prop === "string" && prop !== "$connect" && prop !== "$disconnect" && prop !== "$on" && prop !== "$extends") {
      if (prop === "$transaction") {
        return async (arg: unknown) => {
          if (typeof arg === "function") return nested(ambient, arg as (tx: object) => Promise<unknown>);
          // The array form: the queries were made on this client, so they already belong to the ambient transaction. Awaited in order.
          const out: unknown[] = [];
          for (const query of arg as PromiseLike<unknown>[]) out.push(await query);
          return out;
        };
      }
      const held = (ambient.tx as Record<string, unknown>)[prop];
      if (held !== undefined) return typeof held === "function" ? (held as (...a: unknown[]) => unknown).bind(ambient.tx) : held;
    }
    const value = Reflect.get(target, prop, target);
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
  },
});

/// The statements of a savepoint, on a transaction client: for whoever sets an ambient transaction. The name is made from a counter (`ambient-tx.ts`) and never from input.
export const savepointSql = (tx: Pick<typeof client, "$executeRaw">): SavepointSql => ({
  savepoint: (name) => tx.$executeRaw`SAVEPOINT ${Prisma.raw(name)}`,
  release: (name) => tx.$executeRaw`RELEASE SAVEPOINT ${Prisma.raw(name)}`,
  rollbackTo: (name) => tx.$executeRaw`ROLLBACK TO SAVEPOINT ${Prisma.raw(name)}`,
});
