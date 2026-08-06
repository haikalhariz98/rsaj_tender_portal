"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Item } from "@/generated/prisma/client";

export function ItemList({ initialItems }: { initialItems: Item[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // The server re-renders the list, so we only refresh after a successful write
  // rather than keeping a second copy of the items in client state.
  async function send(input: RequestInfo, init: RequestInit) {
    setError(null);
    const res = await fetch(input, init);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? `Request failed (${res.status})`);
      return false;
    }
    startTransition(() => router.refresh());
    return true;
  }

  async function addItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (title.trim() === "") return;
    const ok = await send("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (ok) setTitle("");
  }

  return (
    <section className="flex flex-col gap-4">
      <form onSubmit={addItem} className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add an item…"
          aria-label="Item title"
          className="flex-1 rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
        />
        <button
          type="submit"
          disabled={isPending || title.trim() === ""}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity disabled:opacity-40"
        >
          Add
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {initialItems.length === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50">
          No items yet. Add one above, or run <code className="font-mono">npm run db:seed</code>.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-black/10 dark:divide-white/10">
          {initialItems.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2.5">
              <input
                type="checkbox"
                checked={item.done}
                aria-label={`Mark "${item.title}" as done`}
                onChange={(e) =>
                  send(`/api/items/${item.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ done: e.target.checked }),
                  })
                }
                className="size-4 accent-current"
              />
              <span
                className={`flex-1 text-sm ${item.done ? "text-black/40 line-through dark:text-white/40" : ""}`}
              >
                {item.title}
              </span>
              <button
                onClick={() => send(`/api/items/${item.id}`, { method: "DELETE" })}
                aria-label={`Delete "${item.title}"`}
                className="text-xs text-black/40 hover:text-red-600 dark:text-white/40 dark:hover:text-red-400"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
