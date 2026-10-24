import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The Prisma schema read as text, for source scans that must know what a dotted path (`exercise.requisition.reference`) reaches:
 * each hop's model, whether it is a to-one relation, and the leaf column's type. Test support only.
 */

export interface SchemaField {
  name: string;
  /// The type without `?` or `[]`: a scalar (`String`, `Decimal`), an enum, or a model.
  type: string;
  list: boolean;
}

/// The models a search or a list's sort must never reach: evaluation, opening, bid, sealing, estimate, creditor and bank records.
/// `OpeningPosition` is a contract's payment position, not a bid opening.
export const SENSITIVE_MODEL = /Evaluat|Opening(?!Position)|OpenedBid|Bid|Seal|Estimate|Creditor|Bank|BoxEvent/;

export type SchemaModels = ReadonlyMap<string, ReadonlyMap<string, SchemaField>>;

export function parseModels(schema: string): SchemaModels {
  const models = new Map<string, Map<string, SchemaField>>();
  for (const m of schema.matchAll(/\nmodel (\w+) \{([\s\S]*?)\n\}/g)) {
    const fields = new Map<string, SchemaField>();
    for (const line of m[2].split("\n")) {
      const f = /^\s*(\w+)\s+(\w+)(\[\])?(\?)?/.exec(line);
      if (f && !line.trim().startsWith("//") && !line.trim().startsWith("@@")) fields.set(f[1], { name: f[1], type: f[2], list: !!f[3] });
    }
    models.set(m[1], fields);
  }
  return models;
}

export const readModels = (root = process.cwd()): SchemaModels => parseModels(readFileSync(join(root, "prisma/schema.prisma"), "utf8"));

export type Walk = { ok: true; models: string[]; leaf: SchemaField } | { ok: false; why: string };

/// Walk a dotted path from a model: every hop but the last must be a to-one relation; the last must be a column (not a relation).
export function walkPath(models: SchemaModels, from: string, path: string): Walk {
  const hops = path.split(".");
  const seen = [from];
  let model = from;
  for (const [i, hop] of hops.entries()) {
    const field = models.get(model)?.get(hop);
    if (!field) return { ok: false, why: `${model} has no field ${hop}` };
    const last = i === hops.length - 1;
    if (last) return models.has(field.type) ? { ok: false, why: `${model}.${hop} is a relation, not a column` } : { ok: true, models: seen, leaf: field };
    if (!models.has(field.type)) return { ok: false, why: `${model}.${hop} is not a relation` };
    if (field.list) return { ok: false, why: `${model}.${hop} is a to-many relation` };
    model = field.type;
    seen.push(model);
  }
  return { ok: false, why: "empty path" };
}
