/**
 * The wording of the registration's agreements as the server fixes it: which text is in force, and the frozen filled wording with its SHA-256 (FR-VND-005, FR-VND-006, ADR 0041 D4).
 * Server-only: it hashes with `node:crypto`. The browser never imports this; it receives the hashes as data. The rules that judge a tick against a hash are in `declaration.ts`, which
 * the browser does import (plan section 2.3, `src/lib/portal/register/client-safe.test.ts`).
 */

import { createHash } from "node:crypto";

import { fillText } from "./declaration";
import type { DeclarationKind, DeclarationTextConfig } from "./types";

/// A stored text of a declaration, as the store reads it.
export interface StoredDeclarationText {
  id: string;
  kind: DeclarationKind;
  version: number;
  bodyEn: string;
  bodyMs: string | null;
  /// YYYY-MM-DD: the organisation's day it was issued and, once withdrawn, the day it stopped being the one in force.
  issuedOn: string;
  retiredOn: string | null;
}

/// What a signature fixes: the wording as the supplier was shown it, and the SHA-256 of it. The hash formula is unchanged, so a signature made with a Malay text still reproduces. A new one is
/// made from `bodyMs: null` (see `currentDeclarationText`): the Malay line is blank and the hash covers the English text only.
export function frozenWording(text: Pick<DeclarationTextConfig, "bodyEn" | "bodyMs">, organisationName: string): { en: string; ms: string; sha256: string } {
  const en = fillText(text.bodyEn, organisationName);
  const ms = text.bodyMs ? fillText(text.bodyMs, organisationName) : "";
  return { en, ms, sha256: createHash("sha256").update(`${en}\n---\n${ms}`, "utf8").digest("hex") };
}

/// The text in force for a kind on a day: issued on or before the day, not retired on or before it, and of those the highest version. Null while there is none (the step is closed and names
/// the text), and always null while the day is not known.
export function currentDeclarationText(texts: readonly StoredDeclarationText[], kind: DeclarationKind, today: string | null, organisationName: string): DeclarationTextConfig | null {
  if (today == null) return null;
  const inForce = texts.filter((t) => t.kind === kind && t.issuedOn <= today && (t.retiredOn == null || t.retiredOn > today)).sort((a, b) => b.version - a.version)[0];
  // English only (founder, 2026-10-20): the Malay body is left out, so what is shown, hashed and frozen is the English text. Signatures made before keep their stored text and hash.
  return inForce ? { id: inForce.id, version: inForce.version, bodyEn: inForce.bodyEn, bodyMs: null, sha256: frozenWording({ bodyEn: inForce.bodyEn, bodyMs: null }, organisationName).sha256 } : null;
}

/// The Personal Data Notice as it is shown and agreed (`SupplierPolicy.personalDataNoticeEn`, ADR 0041 D4): filled with the organisation's name and hashed with the same formula as a
/// declaration's wording. It has no version of its own, so its hash is its identity. Null while it is not set (blank counts as not set).
export function personalDataNoticeOf(noticeEn: string | null | undefined, organisationName: string): { en: string; sha256: string } | null {
  if (!noticeEn || noticeEn.trim() === "") return null;
  const w = frozenWording({ bodyEn: noticeEn, bodyMs: null }, organisationName);
  return { en: w.en, sha256: w.sha256 };
}
