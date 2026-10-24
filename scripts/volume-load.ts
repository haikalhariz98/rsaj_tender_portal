/**
 * Step 7.8 (NFR-PRF-001): load a throwaway copy of a demo database to volume, so list pages, search, exports and the dashboard can be timed
 * against it. Every demo row of six tables is cloned N times into the same organisation, by `INSERT … SELECT` over `generate_series`: each clone
 * keeps its template's parents and states (so every foreign key and every screen's join still holds) and gets its own id and suffixed keys.
 * One exercise in 20 is restricted (FR-MTD-007), so the hidden-exercise guard runs over hundreds of ids. Awards point at their exercise's clone,
 * contracts at their award's clone.
 *
 *   DATABASE_URL=postgresql://…/perolehan_volume npx tsx scripts/volume-load.ts
 *
 * It refuses any database whose name does not start with `perolehan_volume`, and a database already loaded. Clones' ids start `vol_`.
 */
import { db } from "../src/lib/db";

/// Copies of each demo row: about 20,000 requisitions, 10,000 exercises (about 500 restricted), 4,000 awards, 2,200 contracts,
/// 8,000 suppliers and 2,000 committee sittings from the demo's 41, 23, 9, 5, 10 and 21.
const TIMES = { Requisition: 488, SourcingExercise: 445, Award: 445, Contract: 445, Supplier: 800, Meeting: 96 } as const;

const name = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
if (!name.startsWith("perolehan_volume")) throw new Error(`Refused: ${name || "no database"} is not a throwaway perolehan_volume database.`);

async function columns(table: string): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ column_name: string }[]>(`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, table);
  return rows.map((r) => r.column_name);
}

/// Clone every non-clone row of `table` `times` times; `set` replaces a column with an SQL expression over the template `t` and the copy number `g`.
async function clone(table: keyof typeof TIMES, set: Record<string, string>): Promise<number> {
  const cols = await columns(table);
  const select = cols.map((c) => set[c] ?? `t."${c}"`).join(", ");
  const sql = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) SELECT ${select} FROM "${table}" t CROSS JOIN generate_series(1, ${TIMES[table]}) g WHERE t.id NOT LIKE 'vol\\_%'`;
  return db.$executeRawUnsafe(sql);
}

const suffixed = (col: string) => `CASE WHEN t."${col}" IS NULL THEN NULL ELSE t."${col}" || '/V' || g END`;
const idOf = (prefix: string, col = "id") => `'vol_${prefix}_' || g || '_' || t."${col}"`;

async function main() {
  if ((await db.requisition.count({ where: { id: { startsWith: "vol_" } } })) > 0) throw new Error("Refused: this database is already loaded.");
  const t0 = Date.now();
  const done: string[] = [];
  done.push(`requisitions ${await clone("Requisition", { id: idOf("rq"), reference: suffixed("reference"), erpRequisitionNo: suffixed("erpRequisitionNo"), erpNoteNo: suffixed("erpNoteNo"), title: `t."title" || ' ' || g` })}`);
  done.push(`exercises ${await clone("SourcingExercise", { id: idOf("ex"), reference: suffixed("reference"), dossierReference: suffixed("dossierReference"), title: `t."title" || ' ' || g`, restricted: `(g % 20 = 0) OR t."restricted"` })}`);
  done.push(`awards ${await clone("Award", { id: idOf("aw"), reference: suffixed("reference"), erpCommitmentNo: suffixed("erpCommitmentNo"), exerciseId: `CASE WHEN t."exerciseId" IS NULL THEN NULL ELSE 'vol_ex_' || g || '_' || t."exerciseId" END` })}`);
  done.push(`contracts ${await clone("Contract", { id: idOf("con"), number: suffixed("number"), awardId: idOf("aw", "awardId") })}`);
  done.push(`suppliers ${await clone("Supplier", { id: idOf("sup"), reference: suffixed("reference"), registrationNoKey: suffixed("registrationNoKey"), erpVendorCode: suffixed("erpVendorCode"), registeredName: `t."registeredName" || ' ' || g` })}`);
  done.push(`sittings ${await clone("Meeting", { id: idOf("mt"), reference: suffixed("reference") })}`);
  await db.$executeRawUnsafe(`ANALYZE`);
  console.log(`Loaded ${name} in ${Math.round((Date.now() - t0) / 1000)} s: ${done.join(", ")}.`);
}

main().finally(() => db.$disconnect());
