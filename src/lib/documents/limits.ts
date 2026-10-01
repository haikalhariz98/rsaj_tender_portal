/**
 * How large a file may be (OD-3, NFR-SEC-007).
 *
 * Two limits: the organisation's policy (`DocumentStorePolicy.maxBytes`, unset refuses)
 * and the deployment's technical ceiling (`DOCUMENT_MAX_BYTES`, set by whoever runs the
 * portal, unset refuses). The smaller wins. A file exactly at the cap is accepted; one
 * byte over is refused. Sizes are bigint throughout: never a float.
 */

import type { Finding, StorePolicy } from "./types";

export type CeilingFault = "CEILING_NOT_SET" | "CEILING_INVALID";

/// The deployment's ceiling, from its environment value: a whole number of bytes above zero.
export function parseCeiling(raw: string | null | undefined): { ceiling: bigint } | { fault: CeilingFault } {
  const v = (raw ?? "").trim();
  if (!v) return { fault: "CEILING_NOT_SET" };
  if (!/^[1-9][0-9]{0,15}$/.test(v)) return { fault: "CEILING_INVALID" };
  return { ceiling: BigInt(v) };
}

export type CapFault = "SIZE_NOT_SET" | CeilingFault;

/// The cap in force: the policy's size or the ceiling, whichever is smaller.
export function effectiveCap(policy: Pick<StorePolicy, "maxBytes">, ceiling: { ceiling: bigint } | { fault: CeilingFault }): { cap: bigint; from: "POLICY" | "CEILING" } | { fault: CapFault } {
  if (policy.maxBytes == null || policy.maxBytes <= 0n) return { fault: "SIZE_NOT_SET" };
  if ("fault" in ceiling) return { fault: ceiling.fault };
  return policy.maxBytes <= ceiling.ceiling ? { cap: policy.maxBytes, from: "POLICY" } : { cap: ceiling.ceiling, from: "CEILING" };
}

export type SizeFault = CapFault | "EMPTY" | "TOO_LARGE";

export function sizeFault(bytes: bigint, policy: Pick<StorePolicy, "maxBytes">, ceiling: { ceiling: bigint } | { fault: CeilingFault }): Finding<SizeFault> | null {
  const cap = effectiveCap(policy, ceiling);
  if ("fault" in cap) return { code: cap.fault, level: "block" };
  if (bytes <= 0n) return { code: "EMPTY", level: "block" };
  if (bytes > cap.cap) return { code: "TOO_LARGE", level: "block", data: { cap: cap.cap.toString(), size: bytes.toString(), from: cap.from } };
  return null;
}

/**
 * What a multipart request may carry beyond the file itself: the boundary, the part
 * headers and the short text fields (title, class, person, day, note). A technical
 * allowance, not policy (BD-DS-7): the request is refused before it is read when its
 * declared length exceeds the cap plus this, and a body sent without a length is
 * counted as it arrives and cut off at the same point. The file's own size is then
 * held to the exact cap.
 */
export const MULTIPART_ALLOWANCE_BYTES = 64n * 1024n;

export type LengthFault = "TOO_LARGE" | "LENGTH_INVALID";

/// Whether a request's declared length is refused before reading. Null length: counted instead.
export function requestLengthFault(contentLength: string | null, cap: bigint): LengthFault | null {
  if (contentLength == null) return null;
  const v = contentLength.trim();
  if (!/^[0-9]{1,20}$/.test(v)) return "LENGTH_INVALID";
  return BigInt(v) > cap + MULTIPART_ALLOWANCE_BYTES ? "TOO_LARGE" : null;
}

/// The most a request body may be read to, whatever it declares.
export const readLimit = (cap: bigint) => cap + MULTIPART_ALLOWANCE_BYTES;
