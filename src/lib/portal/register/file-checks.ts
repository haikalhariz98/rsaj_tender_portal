/**
 * Each file of the one submission against the type, size and quotas (ADR 0041 D9, review SHOULD 2): one function, run by the page at each Next and by the submit route, so the two cannot
 * judge a file differently. The quotas count across the whole application, so each file is judged once, in the order it is sent, and a file refused is not counted as held. The caller
 * says what each file is: the page by the type the file says it is, the route by what its own bytes say, and whether its name or declared type disagrees with its bytes (a disguise,
 * refused as a type not taken). Pure, and safe for the browser.
 */

import { uploadFault, type UploadKind, type UploadPolicy, type UploadStore, type UploadUsage } from "@/lib/portal/registration/upload";
import { uploadFaultText } from "@/lib/portal/registration/words";

import type { FaultView } from "./contract";

export interface FileToCheck<T> {
  /// The row it goes with; null for the bank statement.
  key: string | null;
  kind: UploadKind;
  size: bigint;
  /// The media type it is judged by. Null: not known.
  type: string | null;
  /// Its name or declared type disagrees with its bytes (the route's reading only).
  disguised?: boolean;
  item: T;
}

export interface FileChecks<T> {
  faults: FaultView[];
  /// The files taken, in the order sent.
  accepted: FileToCheck<T>[];
  /// How many were taken for each row, and for the statement.
  counts: Map<string, number>;
  statementCount: number;
}

export function checkFiles<T>(files: Iterable<FileToCheck<T>>, rules: { store: UploadStore; document: UploadPolicy; statement: UploadPolicy }): FileChecks<T> {
  const usage: UploadUsage = { files: 0, bytes: 0n };
  const out: FileChecks<T> = { faults: [], accepted: [], counts: new Map(), statementCount: 0 };
  for (const f of files) {
    const found = f.disguised ? ({ code: "TYPE_NOT_ALLOWED", level: "block" } as const) : uploadFault({ size: f.size, sniffedType: f.type }, rules.store, rules[f.kind], usage, f.kind);
    if (found) {
      out.faults.push(f.kind === "statement" ? { step: "epayment", field: "creditor.statement", level: "block", message: uploadFaultText(found, "statement").en } : { step: "documents", field: `documents.${f.key}.file`, level: "block", message: uploadFaultText(found, "document").en });
      continue;
    }
    usage.files += 1;
    usage.bytes += f.size;
    out.accepted.push(f);
    if (f.key == null) out.statementCount += 1;
    else out.counts.set(f.key, (out.counts.get(f.key) ?? 0) + 1);
  }
  return out;
}
