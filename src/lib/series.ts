/**
 * Run these reads one after another and hand back their results in the same order, as `Promise.all` would.
 *
 * Use it wherever the queries share one connection: an interactive transaction (`tx`) or a client that may be one. A transaction holds a single connection, and asking it two things at once makes
 * the driver warn ("client.query() when the client is already executing a query") and will fail in the driver's next major version. Reads on the pooled client may still use `Promise.all`.
 * Each query is a function, so it starts only when the one before it has finished.
 */
export async function inOrder<const T extends readonly (() => unknown)[]>(...queries: T): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const out: unknown[] = [];
  for (const q of queries) out.push(await q());
  return out as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
}
