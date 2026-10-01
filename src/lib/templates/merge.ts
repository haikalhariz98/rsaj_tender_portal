/**
 * Rendering a template body (ADR 0008), shared by every instrument the portal freezes:
 * the award's letters (6.11) and the tender documents (6.4).
 *
 * Plain text with `{{field}}` merge fields from a whitelist the caller passes. A field
 * not on the whitelist is reported and never printed as written; a field with no value
 * is reported as missing. A blank line separates paragraphs. Pure and deterministic:
 * the same body, fields and whitelist always give the same text.
 */

export interface Rendered {
  paragraphs: string[];
  missing: string[];
  unknown: string[];
}

/// The merge fields an instrument may name, and how a missing one reads in the text.
export interface MergeWhitelist {
  has(key: string): boolean;
  label(key: string): string;
}

const FIELD = /\{\{\s*([^{}]*?)\s*\}\}/g;

export function renderWith(body: string, fields: Readonly<Record<string, string>>, whitelist: MergeWhitelist): Rendered {
  const missing = new Set<string>();
  const unknown = new Set<string>();
  const text = body.replace(/\r\n?/g, "\n").replace(FIELD, (_, raw: string) => {
    const key = raw.trim();
    if (!whitelist.has(key)) {
      unknown.add(key);
      return "[not a merge field]";
    }
    const v = fields[key];
    if (v == null || v.trim() === "") {
      missing.add(key);
      return `[${whitelist.label(key).toLowerCase()} not recorded]`;
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
