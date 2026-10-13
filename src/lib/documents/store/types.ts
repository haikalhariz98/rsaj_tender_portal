/**
 * The storage façade (INT-13, ADR 0011). The only code that touches file bytes. Nothing
 * above it knows which driver holds them: a filesystem, S3 or Azure Blob driver later
 * implements the same interface, and nothing else changes.
 */

import type { Tx } from "@/lib/audit/record";

export type DriverName = "postgres" | "filesystem";

export interface BlobStore {
  readonly driver: DriverName;
  /**
   * True where `put` writes inside the caller's transaction, so bytes, metadata and audit
   * commit or fail together. A driver that cannot (an object store) writes before the
   * transaction, idempotently by digest, and the orphan report lists what a failed
   * transaction left behind — never deleted automatically.
   */
  readonly transactional: boolean;
  /// Idempotent on (organisation, sha256). Refuses bytes that do not hash to the address.
  put(tx: Tx, organisationId: string, sha256: string, bytes: Uint8Array): Promise<void>;
  get(organisationId: string, sha256: string): Promise<Uint8Array | null>;
}

/// Wave 3b (SR-13, ADR 0036 D6, M3, 20o) adds ERROR: a configured scanner that failed or could not be reached. It is never NOT_SCANNED, which means only that no scanner
/// is configured. A bid part reading THREAT or ERROR is refused in either mode (`storedScan`). Step 9 makes the scanner return it and every reader exhaustive over it.
export type ScanResult = "NOT_SCANNED" | "CLEAN" | "THREAT" | "ERROR";

/// Malware scanning (NFR-SEC-007). Ships unconfigured (OD-4): every version reads NOT_SCANNED.
export interface MalwareScanner {
  readonly configured: boolean;
  scan(bytes: Uint8Array): Promise<ScanResult>;
}
