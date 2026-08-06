import { db } from "@/lib/db";
import { ItemList } from "@/components/item-list";

// Without this the page is prerendered at build time and the list freezes at
// whatever was in the database when `next build` ran.
export const dynamic = "force-dynamic";

// Read straight from Postgres in the Server Component. Mutations go through
// /api/items so both halves of the stack are exercised.
export default async function Home() {
  const items = await db.item.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">myapp</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Next.js + Prisma + Postgres. The list below is served from the database — replace{" "}
          <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-xs dark:bg-white/10">
            Item
          </code>{" "}
          in{" "}
          <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-xs dark:bg-white/10">
            prisma/schema.prisma
          </code>{" "}
          with your real model.
        </p>
      </header>

      <ItemList initialItems={items} />
    </main>
  );
}
