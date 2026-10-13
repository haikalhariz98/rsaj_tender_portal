/**
 * Uploading one bid part: its rule, its type, its size, its hash and its scan (ADR 0036 D6, rulings 12a, 20o; build plan §1.3, written verbatim). Pure.
 */

import type { ArchiveVerdict, Sniffed } from "@/lib/documents/media";
import type { ScanResult } from "@/lib/documents/store/types";

import type { BidPartRule, OnlineSubmissionMode, PartUploadFault, StoredScan } from "./types";

// src/lib/bids/online/parts.ts (D6)
export declare function partUploadFaults(i: { rule: BidPartRule | null; sniffed: Sniffed; office: ArchiveVerdict | null; size: bigint; storeCap: bigint | null; browserSha256: string; serverSha256: string; scan: ScanResult; mode: OnlineSubmissionMode; scannerConfigured: boolean; draftFilesBySupplier: number }): PartUploadFault[];
export declare function storedScan(scan: ScanResult, mode: OnlineSubmissionMode, scannerConfigured: boolean): StoredScan | null;  // null: refuse
