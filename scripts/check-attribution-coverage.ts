/**
 * Read-only: for every person slot of an act (`src/lib/auth/act-slots.ts`), counts the rows that hold a person and have no attribution (ADR 0034 D12, Phase 2b).
 * A row written before sign-in has none, and reads "(before sign-in)" on a screen; a row written by an act since has one, always. A row made after sign-in that
 * has none (a seed that wrote the table directly, an act no one wired) reads "Attribution missing", and this finds them. It changes nothing.
 *
 *   npm run auth:attribution
 *
 * Exit status 1 when any slot has rows with no attribution, so a deployment can run it as a check.
 */
import "dotenv/config";

import { readFileSync } from "node:fs";
import path from "node:path";

import { ACT_SLOTS } from "../src/lib/auth/act-slots";
import { slotColumns } from "../src/lib/auth/slot-columns";
import { db } from "../src/lib/db";

async function main() {
  const columns = slotColumns(readFileSync(path.join(__dirname, "..", "prisma", "schema.prisma"), "utf8"));
  let lacking = 0;
  let held = 0;
  const lines: string[] = [];
  for (const s of ACT_SLOTS) {
    const key = `${s.entity}.${s.field}`;
    const column = columns.get(key);
    if (!column) {
      lines.push(`  ${key}: no column found in the schema`);
      lacking++;
      continue;
    }
    // The names come from the registry and the schema, never from a request.
    const rows = await db.$queryRawUnsafe<{ held: bigint; lacking: bigint }[]>(
      `SELECT count(*) FILTER (WHERE t."${column}" IS NOT NULL) AS held,
              count(*) FILTER (WHERE t."${column}" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ActAttribution" a WHERE a."entity" = $1 AND a."slot" = $2 AND a."entityId" = t."id")) AS lacking
         FROM "${s.entity}" t`,
      s.entity,
      s.field,
    );
    const h = Number(rows[0]?.held ?? 0n);
    const l = Number(rows[0]?.lacking ?? 0n);
    held += h;
    lacking += l;
    if (l > 0) lines.push(`  ${key}: ${l} of ${h} with no attribution`);
  }
  console.log(`${held} acts hold a person in ${ACT_SLOTS.length} slots; ${lacking} have no attribution.`);
  for (const l of lines) console.log(l);
  if (lacking > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
