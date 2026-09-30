/**
 * Rendering a template body (ADR 0008).
 *
 * Plain text with `{{field}}` merge fields from a whitelist. A field not on the
 * whitelist is reported and never printed as written; a field with no value is
 * reported as missing, and either refuses issue. A blank line separates paragraphs.
 * Pure and deterministic: the same body and fields always give the same text.
 */

import { MERGE_FIELD_KEYS, mergeFieldLabel } from "./fields";

export interface Rendered {
  paragraphs: string[];
  missing: string[];
  unknown: string[];
}

const FIELD = /\{\{\s*([^{}]*?)\s*\}\}/g;

export function renderTemplate(body: string, fields: Readonly<Record<string, string>>): Rendered {
  const missing = new Set<string>();
  const unknown = new Set<string>();
  const text = body.replace(/\r\n?/g, "\n").replace(FIELD, (_, raw: string) => {
    const key = raw.trim();
    if (!MERGE_FIELD_KEYS.has(key)) {
      unknown.add(key);
      return "[not a merge field]";
    }
    const v = fields[key];
    if (v == null || v.trim() === "") {
      missing.add(key);
      return `[${mergeFieldLabel(key).toLowerCase()} not recorded]`;
    }
    return v;
  });
  const paragraphs = text
    .split(/\n[ \t]*\n+/)
    .map((p) => p.replace(/[ \t]+$/gm, "").trim())
    .filter(Boolean);
  return { paragraphs, missing: [...missing], unknown: [...unknown] };
}

/// The frozen text: paragraphs separated by a blank line.
export const renderedText = (r: Rendered) => r.paragraphs.join("\n\n");
