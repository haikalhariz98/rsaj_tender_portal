import type { MalwareScanner, ScanResult } from "./types";

/// The scanner used when no clamd is named in the environment: every file is NOT_SCANNED and the screens say so (OD-4).
export const NotConfiguredScanner: MalwareScanner = {
  configured: false,
  async scan() {
    return "NOT_SCANNED";
  },
};

const RESULTS: readonly ScanResult[] = ["NOT_SCANNED", "CLEAN", "THREAT", "ERROR"];

/**
 * Runs a scanner and never lets a failure read as "not scanned" (wave 3b, M3, 20o). NOT_SCANNED means one thing: no scanner is configured. A configured scanner that throws,
 * rejects, or answers with anything but one of the four results returns ERROR, which a bid part refuses in either mode. Nothing here ever returns CLEAN for a scanner that
 * did not say so.
 */
export async function runScan(scanner: MalwareScanner, bytes: Uint8Array): Promise<ScanResult> {
  if (!scanner.configured) return "NOT_SCANNED";
  try {
    const result = await scanner.scan(bytes);
    return RESULTS.includes(result) ? result : "ERROR";
  } catch {
    return "ERROR";
  }
}
