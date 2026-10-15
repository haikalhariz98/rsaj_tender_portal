/**
 * What the submit and withdraw routes read from a request, parsed by hand in one place (the API rules: validate at the edge, reject unknown fields). Pure.
 * A refusal names the fields that were wrong, never what was in them: the password in particular is never echoed.
 */

import { MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE } from "@/lib/portal/bids/limits";

import { parseDeclaration } from "./submission";
import { isId } from "./upload-parse";
import type { Declaration, OnlineBidKind, SubmitFault } from "./types";

export type ActParsed<T> = { ok: true; value: T } | { ok: false; fields: string[] };

/// The most the portal reads of a password: far above any real one, and it bounds the hash's input.
export const MAX_PASSWORD_CHARS = 1024;

const isPlainObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/// A list of distinct ids, at most `max` of them. `null` where it is not one.
function idList(v: unknown, max: number): string[] | null {
  if (!Array.isArray(v) || v.length > max || !v.every(isId) || new Set(v).size !== v.length) return null;
  return v as string[];
}

const SUBMIT_KEYS = ["exerciseId", "kind", "parentOnlineBidId", "replacesOnlineBidId", "fileIds", "declaration", "password"] as const;
const DECLARATION_KEYS = ["price", "completionPeriod", "completionUnit"] as const;

export interface SubmitBody {
  exerciseId: string;
  kind: OnlineBidKind;
  parentOnlineBidId: string | null;
  replacesOnlineBidId: string | null;
  fileIds: string[];
  /// The declaration as the rules take it (`parseDeclaration`), or the faults it was refused with.
  declaration: { ok: true; value: Declaration } | { ok: false; faults: SubmitFault[] };
  password: string;
}

export function parseSubmitBody(b: Record<string, unknown>): ActParsed<SubmitBody> {
  const bad: string[] = [];
  for (const k of Object.keys(b)) if (!(SUBMIT_KEYS as readonly string[]).includes(k)) bad.push("unknown");
  if (!isId(b.exerciseId)) bad.push("exerciseId");
  if (b.kind !== "BID" && b.kind !== "ALTERNATIVE") bad.push("kind");
  for (const k of ["parentOnlineBidId", "replacesOnlineBidId"] as const) {
    if (b[k] !== undefined && b[k] !== null && !isId(b[k])) bad.push(k);
  }
  const fileIds = idList(b.fileIds, MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE);
  if (!fileIds) bad.push("fileIds");
  if (!isPlainObject(b.declaration) || Object.keys(b.declaration).some((k) => !(DECLARATION_KEYS as readonly string[]).includes(k))) bad.push("declaration");
  if (typeof b.password !== "string" || b.password.length === 0 || b.password.length > MAX_PASSWORD_CHARS) bad.push("password");
  if (bad.length > 0) return { ok: false, fields: [...new Set(bad)] };
  return {
    ok: true,
    value: {
      exerciseId: b.exerciseId as string,
      kind: b.kind as OnlineBidKind,
      parentOnlineBidId: (b.parentOnlineBidId as string | null | undefined) ?? null,
      replacesOnlineBidId: (b.replacesOnlineBidId as string | null | undefined) ?? null,
      fileIds: fileIds!,
      declaration: parseDeclaration(b.declaration),
      password: b.password as string,
    },
  };
}

const WITHDRAW_KEYS = ["onlineBidId", "alsoWithdraw", "password"] as const;

export interface WithdrawBody { onlineBidId: string; alsoWithdraw: string[]; password: string }

export function parseWithdrawBody(b: Record<string, unknown>): ActParsed<WithdrawBody> {
  const bad: string[] = [];
  for (const k of Object.keys(b)) if (!(WITHDRAW_KEYS as readonly string[]).includes(k)) bad.push("unknown");
  if (!isId(b.onlineBidId)) bad.push("onlineBidId");
  const also = idList(b.alsoWithdraw ?? [], MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE);
  if (!also) bad.push("alsoWithdraw");
  if (typeof b.password !== "string" || b.password.length === 0 || b.password.length > MAX_PASSWORD_CHARS) bad.push("password");
  if (bad.length > 0) return { ok: false, fields: [...new Set(bad)] };
  return { ok: true, value: { onlineBidId: b.onlineBidId as string, alsoWithdraw: also!, password: b.password as string } };
}
