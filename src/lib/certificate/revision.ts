/**
 * The template revision a certificate is signed under (FR-CRT-001, OD-2 A): pinned at the first signature,
 * with the form's identity, its printed signature blocks and its distribution list as they stood. A draft
 * follows the latest form; once anyone has signed, the order and recipients they signed under cannot move,
 * and a later revision of the form never alters it (ADR 0008 keeps issued text frozen as well). Pure.
 */

import type { Block, DistributionRow, Finding } from "./types";

export interface TemplateRevision {
  templateId: string;
  code: string;
  nameEn: string;
  nameMs: string | null;
  formCode: string;
  revisionDate: string | null;
  bodyVersion: number;
  /// The text as it stood at the pin: the certificate is issued in it, whatever the form says later.
  bodyEn: string | null;
  bodyMs: string | null;
  blocks: Block[];
  distribution: DistributionRow[];
  /// The organisation's day it was pinned.
  pinnedOn: string;
}

export interface TemplateNow {
  id: string;
  code: string;
  nameEn: string;
  nameMs: string | null;
  formCode: string;
  revisionDate: string | null;
  bodyVersion: number;
  bodyEn: string | null;
  bodyMs: string | null;
  blocks: readonly Block[];
  distribution: readonly DistributionRow[];
}

/// The revision to pin from the form as it stands, blocks in printed order and rows in list order.
export function pinRevision(t: TemplateNow, pinnedOn: string): TemplateRevision {
  return {
    templateId: t.id,
    code: t.code,
    nameEn: t.nameEn,
    nameMs: t.nameMs,
    formCode: t.formCode,
    revisionDate: t.revisionDate,
    bodyVersion: t.bodyVersion,
    bodyEn: t.bodyEn,
    bodyMs: t.bodyMs,
    blocks: [...t.blocks].sort((a, b) => a.blockOrder - b.blockOrder).map((b) => ({ ...b })),
    distribution: [...t.distribution].sort((a, b) => a.sortOrder - b.sortOrder || a.recipientCode.localeCompare(b.recipientCode)).map((d) => ({ ...d })),
    pinnedOn,
  };
}

/**
 * Why a form cannot be pinned (the first signature refuses): no form chosen; no blocks; a block whose
 * delegation answer is not decided; no distribution list; no text; a text naming a field a certificate of
 * this kind does not fill. Each is the form's configuration as it stands, so each is put right under
 * Configuration › Templates before anyone signs. Checked here so that nothing undecided is ever pinned: a
 * pinned revision is never edited, so a gap frozen into it would have no exit but voiding the certificate.
 */
export function pinFaults(t: TemplateNow | null, allowed: ReadonlySet<string>, fieldsNamed: (body: string) => string[]): Finding[] {
  if (!t) return [{ code: "TEMPLATE_NOT_SET", level: "block" }];
  const out: Finding[] = [];
  const form = t.nameEn;
  if (t.blocks.length === 0) out.push({ code: "NO_BLOCKS", level: "block", data: { form } });
  for (const b of [...t.blocks].sort((a, c) => a.blockOrder - c.blockOrder)) if (b.delegable == null) out.push({ code: "DELEGABLE_UNDECIDED", level: "block", data: { form, block: b.labelEn } });
  if (t.distribution.length === 0) out.push({ code: "NO_DISTRIBUTION_LIST", level: "block", data: { form } });
  const bodies = [t.bodyEn, t.bodyMs].filter((b): b is string => b != null && b.trim() !== "");
  if (bodies.length === 0) out.push({ code: "TEMPLATE_BODY_EMPTY", level: "block", data: { form } });
  const unknown = [...new Set(bodies.flatMap(fieldsNamed))].filter((k) => !allowed.has(k));
  if (unknown.length) out.push({ code: "UNKNOWN_FIELDS", level: "block", data: { form, fields: unknown.map((u) => `{{${u}}}`).join(", ") } });
  return out;
}

/// A pinned revision read back from JSON, or null.
export function readRevision(json: unknown): TemplateRevision | null {
  if (!json || typeof json !== "object") return null;
  const r = json as Partial<TemplateRevision>;
  if (typeof r.templateId !== "string" || !Array.isArray(r.blocks) || !Array.isArray(r.distribution)) return null;
  return r as TemplateRevision;
}
