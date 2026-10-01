/**
 * Rendering an award's template body (ADR 0008): the shared renderer
 * (`src/lib/templates/merge.ts`) with the award's merge-field whitelist (`fields.ts`).
 * A field not on the whitelist is reported and never printed as written; a field with
 * no value is reported as missing, and either refuses issue.
 */

import { renderWith, type Rendered } from "@/lib/templates/merge";

import { MERGE_FIELD_KEYS, mergeFieldLabel } from "./fields";

export type { Rendered };
export { renderedText } from "@/lib/templates/merge";

const AWARD_FIELDS = { has: (k: string) => MERGE_FIELD_KEYS.has(k), label: mergeFieldLabel };

export function renderTemplate(body: string, fields: Readonly<Record<string, string>>): Rendered {
  return renderWith(body, fields, AWARD_FIELDS);
}
