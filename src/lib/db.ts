import { PrismaPg } from "@prisma/adapter-pg";
import type { ITXClientDenyList } from "@prisma/client/runtime/client";
import { PrismaClient } from "@/generated/prisma/client";
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
    // are never read by default. Nothing un-omits them: the figure is read only through
    // the database's logged figure reader (readFigure in src/lib/scope/estimate-store.ts) and the reason by an explicit select there (source-scanned).
    omit: SEALED_OMIT,
  });
}

const client = globalForPrisma.prisma ?? createClient();

/// The application client: Prisma's default `PrismaClient` type, except that the sealed estimate's delegate is the one of the client built above, which carries the global
/// omit (ADR 0012), so a query can no more read the figure by type than at runtime (nested reads through an `include` are not typed away; the runtime omit holds).
/// Not the client's own type whole: its `log` and `omit` type arguments are invariant, so it differs from the `PrismaClient` and `TransactionClient` that scripts, tests
/// and `$transaction` hand on, and every hand-over made the checker compare two whole clients model by model, which ran `tsc` out of memory.
type AppClient = Omit<PrismaClient, "companyEstimateVersion"> & Pick<typeof client, "companyEstimateVersion">;

/// The application client inside a transaction (a `TransactionClient`, with the same sealed delegate).
export type Tx = Omit<AppClient, ITXClientDenyList>;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = client;
}

/**
 * The application client. While an ambient transaction is set (`src/lib/ambient/ambient-tx.ts`: a two-person change being applied, or rehearsed) it stands for that
 * transaction, and a `$transaction` on it is a savepoint of it. Everywhere else it is the client, unchanged.
 */
export const db = new Proxy(client, {
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
}) as unknown as AppClient; // the Proxy hands back the client itself; only its type is narrowed

type SavepointClient = Pick<typeof client, "$executeRaw">;

/// One set of statements a level, written out whole (`MAX_SAVEPOINT_DEPTH` levels): a savepoint's name is never assembled from pieces, so nothing a request says can reach the SQL.
const SAVEPOINT_STATEMENTS: readonly (readonly [(tx: SavepointClient) => Promise<unknown>, (tx: SavepointClient) => Promise<unknown>, (tx: SavepointClient) => Promise<unknown>])[] = [
  [(tx) => tx.$executeRaw`SAVEPOINT amb_1`, (tx) => tx.$executeRaw`RELEASE SAVEPOINT amb_1`, (tx) => tx.$executeRaw`ROLLBACK TO SAVEPOINT amb_1`],
  [(tx) => tx.$executeRaw`SAVEPOINT amb_2`, (tx) => tx.$executeRaw`RELEASE SAVEPOINT amb_2`, (tx) => tx.$executeRaw`ROLLBACK TO SAVEPOINT amb_2`],
  [(tx) => tx.$executeRaw`SAVEPOINT amb_3`, (tx) => tx.$executeRaw`RELEASE SAVEPOINT amb_3`, (tx) => tx.$executeRaw`ROLLBACK TO SAVEPOINT amb_3`],
  [(tx) => tx.$executeRaw`SAVEPOINT amb_4`, (tx) => tx.$executeRaw`RELEASE SAVEPOINT amb_4`, (tx) => tx.$executeRaw`ROLLBACK TO SAVEPOINT amb_4`],
  [(tx) => tx.$executeRaw`SAVEPOINT amb_5`, (tx) => tx.$executeRaw`RELEASE SAVEPOINT amb_5`, (tx) => tx.$executeRaw`ROLLBACK TO SAVEPOINT amb_5`],
  [(tx) => tx.$executeRaw`SAVEPOINT amb_6`, (tx) => tx.$executeRaw`RELEASE SAVEPOINT amb_6`, (tx) => tx.$executeRaw`ROLLBACK TO SAVEPOINT amb_6`],
  [(tx) => tx.$executeRaw`SAVEPOINT amb_7`, (tx) => tx.$executeRaw`RELEASE SAVEPOINT amb_7`, (tx) => tx.$executeRaw`ROLLBACK TO SAVEPOINT amb_7`],
  [(tx) => tx.$executeRaw`SAVEPOINT amb_8`, (tx) => tx.$executeRaw`RELEASE SAVEPOINT amb_8`, (tx) => tx.$executeRaw`ROLLBACK TO SAVEPOINT amb_8`],
];

/// The statements of a savepoint, on a transaction client: for whoever sets an ambient transaction.
export const savepointSql = (tx: SavepointClient): SavepointSql => ({
  savepoint: (level) => SAVEPOINT_STATEMENTS[level - 1][0](tx),
  release: (level) => SAVEPOINT_STATEMENTS[level - 1][1](tx),
  rollbackTo: (level) => SAVEPOINT_STATEMENTS[level - 1][2](tx),
});
