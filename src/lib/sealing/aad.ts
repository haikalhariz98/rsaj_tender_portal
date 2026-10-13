/**
 * The additional authenticated data bound into every ciphertext of online sealed bids (ADR 0036 D2, threat S8). Pure.
 *
 * Canonical form: `v1|purpose|organisationId|exerciseId|keyId|recordId|partKey`, partKey "" when absent. A ciphertext moved to another organisation, exercise, key,
 * record or part, or opened for another purpose, fails its tag. The separator never appears inside a field (ids are cuid), and an id is never empty: either is
 * refused as FORMAT, so two different contexts can never write the same string.
 */

import { SealError, type AadContext } from "./types";

export const AAD_VERSION = "v1";
const SEPARATOR = "|";

export function canonicalAad(a: AadContext): string {
  const ids = [a.organisationId, a.exerciseId, a.keyId, a.recordId];
  const fields = [a.purpose, ...ids, a.partKey ?? ""];
  if (fields.some((f) => typeof f !== "string" || f.includes(SEPARATOR))) throw new SealError("FORMAT");
  if (ids.some((id) => id.length === 0) || a.purpose.length === 0) throw new SealError("FORMAT");
  return [AAD_VERSION, ...fields].join(SEPARATOR);
}

export const aadBytes = (a: AadContext): Uint8Array => new TextEncoder().encode(canonicalAad(a));
