/**
 * The façade's entry point: the configured store, the scanner, the ceiling. Everything
 * above this imports from here, never from a driver.
 */

import { postgresBlobStore } from "./postgres";
import { clamdScanner, FailClosedScanner } from "./clamd-scanner";
import { NotConfiguredScanner } from "./scanner";
import { scannerSettingFrom, type ScannerSetting } from "./scanner-config";
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

export type { ScannerSetting, ScannerFault } from "./scanner-config";

export const scannerSetting = (env: Readonly<Record<string, string | undefined>> = process.env): ScannerSetting => scannerSettingFrom(env);

/// The scanner: unconfigured unless the environment names a clamd (OD-4, N5). A setting that is present but wrong fails closed: configured, every scan ERROR (T2).
export function malwareScanner(env: Readonly<Record<string, string | undefined>> = process.env): MalwareScanner {
  const s = scannerSettingFrom(env);
  if (s.state === "NONE") return NotConfiguredScanner;
  if (s.state === "FAULT") return FailClosedScanner;
  return clamdScanner(s.target, { timeoutMs: s.timeoutMs });
}
