/**
 * Loads a customer's master-data workbook (RSAJ's template) into that customer's own organisation, beside any other in the same database:
 *
 *   npm run rsaj:data -- "<file.xlsx>"                                say what would be written, skipped and refused, per tab; writes nothing
 *   npm run rsaj:data -- "<file.xlsx>" --apply                        load it (creates the organisation first if it is missing)
 *   npm run rsaj:data -- "<file.xlsx>" --apply --organisation-only    create the organisation only, so the starter pack can be loaded before the workbook
 *
 * The organisation is RSAJ (--organisation <code> names another). The file is only read. One fault anywhere refuses the whole run and exits 1.
 * Faults name the tab, row and column and never repeat a cell: the staff tab is personal data. Order for a new database: --organisation-only, then
 * `ORGANISATION_CODE=RSAJ npm run pack -- rsaj,generic --apply`, then --apply (the pack fills only empty lists, and the offices and committees the
 * holders and members tabs name come from it).
 */
import "dotenv/config";

import { db } from "../src/lib/db";
import { loadMasterData } from "../src/lib/master-data/apply";
import { readWorkbook } from "../src/lib/master-data/read-workbook";

async function main() {
  const args = process.argv.slice(2);
  const flag = (n: string) => args.includes(`--${n}`);
  const at = args.indexOf("--organisation");
  const code = at >= 0 ? args[at + 1] : "RSAJ";
  const file = args.find((a, i) => !a.startsWith("--") && (at < 0 || i !== at + 1));
  if (!file || !code) throw new Error('Name the workbook: npm run rsaj:data -- "<file.xlsx>" [--apply] [--organisation-only] [--organisation <code>]');
  const apply = flag("apply");

  const [{ current_database }] = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  console.log(`Database ${current_database}, organisation ${code}, ${apply ? "APPLY" : "dry run (nothing is written)"}${flag("organisation-only") ? ", organisation only" : ""}.`);
  const result = await loadMasterData(db, { organisationCode: code, book: await readWorkbook(file), apply, organisationOnly: flag("organisation-only") });

  for (const r of result.plan.reports) {
    const verdict = r.empty ? "empty, skipped (the file is incomplete)" : `read ${r.read}, ${result.applied ? "written" : "would write"} ${r.write}, already there ${r.skipped}, faults ${r.faults}`;
    console.log(`  ${r.tab.padEnd(20)} ${verdict}`);
  }
  const shown = result.plan.faults.slice(0, 200);
  for (const f of shown) console.log(`  FAULT ${f.tab}, row ${f.row}${f.column ? `, column "${f.column}"` : ""}: ${f.reason}`);
  if (result.plan.faults.length > shown.length) console.log(`  ... and ${result.plan.faults.length - shown.length} more faults.`);
  if (result.plan.faults.length > 0) {
    console.log(`Refused: ${result.plan.faults.length} fault(s). Nothing was written.`);
    process.exitCode = 1;
  } else if (apply) console.log(result.organisationCreated ? "Applied. The organisation was created." : "Applied.");
  else console.log("Dry run only. Add --apply to write.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
