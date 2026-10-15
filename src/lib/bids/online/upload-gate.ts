/**
 * How many part uploads run at once (step 9; ADR 0036 D6, threat S17, S19, ruling 20e). Two bounds, both per process:
 *  - the deployment's own limit on bid uploads (`BID_UPLOAD_MAX_CONCURRENT`), a limiter of its own and never the staff documents' one, so a flood of bids cannot starve the
 *    office's uploads and the office's cannot starve a bidder's;
 *  - one upload in flight per supplier (any exercise), so one company cannot hold more than one of the deployment's places.
 * Held on `globalThis` so a reloaded module in development shares one count. A deployment running several processes has this bound per process; the draft cap and the rate
 * limit, which are the database's, hold across them.
 */

import { createLimiter, type Limiter } from "@/lib/documents/concurrency";
import { bidUploadMaxConcurrent } from "@/lib/integration/sealing-deployment";

const KEY = Symbol.for("perolehan.bidUploadGate");
type Held = { limiter?: Limiter; suppliers?: Set<string> };
function held(): Held {
  const g = globalThis as unknown as Record<symbol, Held | undefined>;
  return (g[KEY] ??= {});
}

export const bidUploadLimiter = (): Limiter => (held().limiter ??= createLimiter(bidUploadMaxConcurrent()));

/// Takes the deployment's place and the supplier's one place, or neither. Returns the release, or null when busy.
export function tryBeginBidUpload(organisationId: string, supplierId: string): (() => void) | null {
  const suppliers = (held().suppliers ??= new Set<string>());
  const key = `${organisationId}:${supplierId}`;
  if (suppliers.has(key)) return null;
  const slot = bidUploadLimiter().tryAcquire();
  if (!slot) return null;
  suppliers.add(key);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    suppliers.delete(key);
    slot();
  };
}
