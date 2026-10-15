/**
 * The façade's entry point: the configured store, the scanner, the ceiling. Everything
 * above this imports from here, never from a driver.
 */

import { postgresBlobStore } from "./postgres";
import { NotConfiguredScanner } from "./scanner";
import { ceilingFrom, driverFrom, type DriverFault } from "./select";
import type { BlobStore, MalwareScanner } from "./types";

export type { BlobStore, MalwareScanner, ScanResult, DriverName } from "./types";
export { sha256Hex, isSha256 } from "./digest";
export { runScan } from "./scanner";
export { orphanReport, orphanDigests } from "./orphans";
export { BlobAddressError } from "./postgres";

const DRIVERS: Readonly<Record<string, BlobStore>> = { postgres: postgresBlobStore };

/// The store this deployment is configured for, or why there is none.
export function blobStore(env: Readonly<Record<string, string | undefined>> = process.env): { store: BlobStore } | { fault: DriverFault } {
  const d = driverFrom(env);
  if ("fault" in d) return d;
  return { store: DRIVERS[d.driver] };
}

export const deploymentCeiling = (env: Readonly<Record<string, string | undefined>> = process.env) => ceilingFrom(env);

/// The scanner: none is configured in this build (OD-4).
export const malwareScanner = (): MalwareScanner => NotConfiguredScanner;
