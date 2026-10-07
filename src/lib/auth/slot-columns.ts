/**
 * The column each person slot of an act is held in, read from the schema's text (`prisma/schema.prisma`): a slot is a relation to Person (`recordedBy`), and
 * its column is the relation's foreign key (`recordedByPersonId`). Pure, so the coverage check and its test share it.
 */

export function slotColumns(schema: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    for (const f of m[2].matchAll(/^\s+(\w+)\s+Person\??\s+@relation\([^)]*?fields:\s*\[(\w+)\]/gm)) out.set(`${m[1]}.${f[1]}`, f[2]);
  }
  return out;
}
