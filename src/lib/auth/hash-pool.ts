/**
 * At most `max` password hashes at once in one process (ADR 0034 D3). Each scrypt holds about 32 MiB for its run, so an
 * unbounded burst of sign-in attempts would be a way to exhaust the host. The rest wait their turn, in order.
 *
 * The count is per process: several instances multiply it, as the document store's caps do.
 */

export interface Pool {
  run<T>(task: () => Promise<T>): Promise<T>;
  readonly active: number;
  readonly waiting: number;
}

export function createPool(max: number): Pool {
  if (!Number.isInteger(max) || max < 1) throw new Error("A pool allows at least one task at a time.");
  let active = 0;
  const queue: (() => void)[] = [];

  // A finished task hands its slot straight to the next waiter, so a newcomer cannot slip in between and take the count over `max`.
  const release = () => {
    const next = queue.shift();
    if (next) next();
    else active--;
  };

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      if (active < max) active++;
      else await new Promise<void>((resolve) => queue.push(resolve));
      try {
        return await task();
      } finally {
        release();
      }
    },
    get active() {
      return active;
    },
    get waiting() {
      return queue.length;
    },
  };
}

/**
 * Hashes run on libuv's thread pool, which is also what file reads, compression and name lookups wait on (default 4 threads, set by
 * `UV_THREADPOOL_SIZE` in the process environment before it starts, never from code). Holding every thread with hashes would stall
 * the rest of the application, so at most one fewer than the pool has runs at once, up to 4 (ADR 0034 D3). With the default pool that is 3.
 */
const libuvThreads = Number(process.env.UV_THREADPOOL_SIZE);
export const HASH_CONCURRENCY = Math.max(1, Math.min(4, (Number.isInteger(libuvThreads) && libuvThreads >= 1 ? libuvThreads : 4) - 1));

/// The most attempts left waiting for a hash slot. Past it a sign-in is refused at once, without being hashed: the queue is not allowed to grow without bound under a flood.
export const HASH_QUEUE_LIMIT = 64;

const globalForPool = globalThis as unknown as { hashPool?: Pool };
/// One pool for the process, kept across hot reloads in development.
export const hashPool = (globalForPool.hashPool ??= createPool(HASH_CONCURRENCY));
