/**
 * A cap on how many uploads, and how many downloads, one server process handles at
 * once (audit C-1). Each holds the whole file in memory — an upload several times over
 * (see DOCUMENT_MAX_BYTES in .env.example) — so a handful of large requests at once is
 * enough to exhaust a small host. A request over the cap is refused with 503 and
 * Retry-After, and is not an access event: nothing was asked of the store.
 *
 * In-process on purpose. The portal is deployed as one Node process per instance (no
 * shared cache or queue is part of the platform), so a counter in the process is exact
 * for that process; with several instances the cap applies to each, and the operator
 * multiplies. A cross-instance cap would need a shared store the platform does not have.
 */

export interface Limiter {
  readonly max: number;
  active(): number;
  /// A release function while there is room, otherwise null. Release is idempotent.
  tryAcquire(): (() => void) | null;
}

export function createLimiter(max: number): Limiter {
  let active = 0;
  return {
    max,
    active: () => active,
    tryAcquire() {
      if (active >= max) return null;
      active += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        active -= 1;
      };
    },
  };
}

export const DEFAULT_MAX_CONCURRENT_UPLOADS = 3;
export const DEFAULT_MAX_CONCURRENT_DOWNLOADS = 6;

/// A whole number of at least one; anything else (unset, blank, zero, negative, text) is the default.
export function parseConcurrency(raw: string | null | undefined, fallback: number): number {
  const v = (raw ?? "").trim();
  if (!/^[1-9][0-9]{0,5}$/.test(v)) return fallback;
  return Number(v);
}

/// Seconds a refused client is told to wait.
export const RETRY_AFTER_SECONDS = 5;

const KEY = Symbol.for("perolehan.documentLimiters");
type Held = { uploads?: Limiter; downloads?: Limiter; publicDownloads?: Limiter; registerUploads?: Limiter };

// Held on globalThis so a reloaded module in development shares one count, as the database client does.
function held(): Held {
  const g = globalThis as unknown as Record<symbol, Held | undefined>;
  return (g[KEY] ??= {});
}

export const uploadLimiter = (): Limiter => (held().uploads ??= createLimiter(parseConcurrency(process.env.DOCUMENT_MAX_CONCURRENT_UPLOADS, DEFAULT_MAX_CONCURRENT_UPLOADS)));
export const downloadLimiter = (): Limiter => (held().downloads ??= createLimiter(parseConcurrency(process.env.DOCUMENT_MAX_CONCURRENT_DOWNLOADS, DEFAULT_MAX_CONCURRENT_DOWNLOADS)));

/// The anonymous schedule download has a cap of its own, so a flood of strangers cannot take the slots signed-in downloads and officers use.
export const DEFAULT_MAX_CONCURRENT_PUBLIC_DOWNLOADS = 2;
export const publicDownloadLimiter = (): Limiter => (held().publicDownloads ??= createLimiter(parseConcurrency(process.env.DOCUMENT_MAX_CONCURRENT_PUBLIC_DOWNLOADS, DEFAULT_MAX_CONCURRENT_PUBLIC_DOWNLOADS)));

/// The anonymous registration's bodies have a cap of their own (security audit H1), so strangers posting slowly cannot take the slots staff and signed-in suppliers upload through. Like
/// the others, per process, and the operator's to raise (`DOCUMENT_MAX_CONCURRENT_REGISTER_UPLOADS`).
export const DEFAULT_MAX_CONCURRENT_REGISTER_UPLOADS = 2;
export const registerUploadLimiter = (): Limiter => (held().registerUploads ??= createLimiter(parseConcurrency(process.env.DOCUMENT_MAX_CONCURRENT_REGISTER_UPLOADS, DEFAULT_MAX_CONCURRENT_REGISTER_UPLOADS)));
