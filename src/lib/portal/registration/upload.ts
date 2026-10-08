/**
 * Whether a signed-in supplier's upload is taken (Phase 4b; ruling 2 of the CPD registration rulings, threat model C and D). Pure: the route sniffs the type from the file's own bytes,
 * counts the size while it reads, and reads the usage under the draft's lock; this judges them against the settings.
 *
 * Every limit is the customer's: the organisation's file types and size (`DocumentStorePolicy`), the class each kind of upload takes (`SupplierPolicy.supplierUploadClassId`,
 * `supplierBankStatementClassId`: a supplier cannot choose one, and the store refuses an upload without one) and the quota for one registration (`uploadMaxFilesPerApplication`,
 * `uploadMaxBytesPerApplication`). A setting that is not set REFUSES the upload and is named. Usage counts every version uploaded under the registration, withdrawn ones included, because
 * bytes are never deleted (ADR 0011).
 */

import type { Finding } from "@/lib/suppliers/types";

export type UploadFault =
  | "STORE_POLICY_NOT_SET"
  | "CLASS_NOT_SET"
  | "STATEMENT_CLASS_NOT_SULIT"
  | "QUOTA_NOT_SET"
  | "EMPTY"
  | "TYPE_NOT_ALLOWED"
  | "TOO_LARGE"
  | "QUOTA_FILES"
  | "QUOTA_BYTES";

export type UploadKind = "document" | "statement";

export interface UploadStore {
  /// The media types the organisation takes. Empty: not set.
  allowedTypes: readonly string[];
  /// The smaller of the organisation's size and the deployment's ceiling (`effectiveCap`). Null: not set.
  capBytes: bigint | null;
}

export interface UploadPolicy {
  /// The class this kind of upload takes (`supplierUploadClassId` for a certificate, `supplierBankStatementClassId` for the statement). Null: not set.
  classId: string | null;
  /// Whether that class classifies as SULIT: asked of the bank statement's class only. Absent: not asked.
  classIsSulit?: boolean;
  maxFiles: number | null;
  maxBytes: bigint | null;
}

export interface UploadUsage {
  files: number;
  bytes: bigint;
}

/// The setting each refusal names, for the words.
export const UPLOAD_SETTING_NAME: Readonly<Record<UploadKind, { cls: string }>> = {
  document: { cls: "the document class for suppliers' uploaded certificates" },
  statement: { cls: "the document class for suppliers' bank statements" },
};

/**
 * The settings an upload needs, judged before a byte of the body is read (so a closed upload costs nothing): the organisation's file types and size, the class this kind of upload takes (a
 * bank statement's must be SULIT, from upload, or the attachment would be refused), and the quota. The first one not set, named; null where all are set.
 */
export function uploadSettingFault(store: UploadStore, policy: UploadPolicy, kind: UploadKind = "document"): Finding<UploadFault> | null {
  if (store.allowedTypes.length === 0 || store.capBytes == null || store.capBytes <= 0n) return { code: "STORE_POLICY_NOT_SET", level: "block" };
  if (policy.classId == null) return { code: "CLASS_NOT_SET", level: "block", data: { setting: UPLOAD_SETTING_NAME[kind].cls } };
  if (kind === "statement" && policy.classIsSulit === false) return { code: "STATEMENT_CLASS_NOT_SULIT", level: "block", data: { setting: UPLOAD_SETTING_NAME[kind].cls } };
  if (policy.maxFiles == null || policy.maxBytes == null) return { code: "QUOTA_NOT_SET", level: "block" };
  return null;
}

/**
 * The first reason an upload is not taken, or null. The order is the order of what to tell the supplier first: a setting nobody has made, then the file itself, then the quota.
 * `sniffedType` is what the bytes say the file is (never what the request declared), or null where they are none of the types the product can tell.
 */
export function uploadFault(file: { size: bigint; sniffedType: string | null }, store: UploadStore, policy: UploadPolicy, usage: UploadUsage, kind: UploadKind = "document"): Finding<UploadFault> | null {
  const unset = uploadSettingFault(store, policy, kind);
  if (unset) return unset;
  if (file.size <= 0n) return { code: "EMPTY", level: "block" };
  if (file.size > store.capBytes!) return { code: "TOO_LARGE", level: "block", data: { cap: store.capBytes!.toString() } };
  if (file.sniffedType == null || !store.allowedTypes.includes(file.sniffedType)) return { code: "TYPE_NOT_ALLOWED", level: "block" };
  if (usage.files + 1 > policy.maxFiles!) return { code: "QUOTA_FILES", level: "block", data: { max: policy.maxFiles } };
  if (usage.bytes + file.size > policy.maxBytes!) return { code: "QUOTA_BYTES", level: "block", data: { max: policy.maxBytes!.toString() } };
  return null;
}
