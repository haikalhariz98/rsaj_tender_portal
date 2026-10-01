// Scratch stand-in for `prisma migrate` while binaries.prisma.sh is unreachable.
// Uses the npm-hosted WASM schema engine through @prisma/adapter-pg.
//   node pmig.mjs deploy            apply pending migrations
//   node pmig.mjs diff              SQL from the live DB to prisma/schema.prisma
//   node pmig.mjs create <name>     write a new migration dir with that diff
//
// The tools directory is the one this file lives in (override: PEROLEHAN_TOOLS_DIR); it holds
// adapter-pg-patched.cjs and node_modules/@prisma/schema-engine-wasm. The repository defaults
// to /home/user/repo (override: PEROLEHAN_REPO). Run with NODE_PATH=<repo>/node_modules.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
const TOOLS = process.env.PEROLEHAN_TOOLS_DIR || path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.PEROLEHAN_REPO || "/home/user/repo";
const ENGINE = path.join(TOOLS, "node_modules/@prisma/schema-engine-wasm");
const ADAPTER = path.join(TOOLS, "adapter-pg-patched.cjs");
for (const f of [path.join(ENGINE, "schema_engine_bg.js"), path.join(ENGINE, "schema_engine_bg.wasm"), ADAPTER, path.join(REPO, "prisma/schema.prisma")]) {
  if (!fs.existsSync(f)) { console.error(`pmig.mjs: not found: ${f}. Set up the tools directory as docs/notes/cloud-build/ENV.md says (or set PEROLEHAN_TOOLS_DIR / PEROLEHAN_REPO).`); process.exit(1); }
}
const require = createRequire(REPO + "/package.json");
const bg = await import(pathToFileURL(path.join(ENGINE, "schema_engine_bg.js")).href);
const bytes = fs.readFileSync(path.join(ENGINE, "schema_engine_bg.wasm"));
const { instance } = await WebAssembly.instantiate(bytes, { "./schema_engine_bg.js": bg });
bg.__wbg_set_wasm(instance.exports);
instance.exports.__wbindgen_start?.();

const env = Object.fromEntries(fs.readFileSync(REPO + "/.env", "utf8").split("\n").filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const url = process.env.DATABASE_URL || env.DATABASE_URL;
const { PrismaPg } = require(ADAPTER);
const { bindMigrationAwareSqlAdapterFactory } = require("@prisma/driver-adapter-utils");
const factory = new PrismaPg({ connectionString: url });
const shadowUrl = url.replace(/\/([a-z_]+)\?/, "/$1_shadow?");
factory.connectToShadowDb = async () => new PrismaPg({ connectionString: shadowUrl }).connect();
const adapter = bindMigrationAwareSqlAdapterFactory(factory);

const schema = fs.readFileSync(REPO + "/prisma/schema.prisma", "utf8");
const schemas = { files: [{ path: REPO + "/prisma/schema.prisma", content: schema }] };
const engine = await bg.SchemaEngine.new({ datamodels: [[REPO + "/prisma/schema.prisma", schema]] }, (log) => { if (process.env.DEBUG) console.error(log); }, adapter);

const baseDir = REPO + "/prisma/migrations";
// The WASM path splits scripts on every ";" even inside comments. STRIP_COMMENTS=1 drops
// whole-line "--" comments (verify DB only; checksums then differ from the files).
const strip = (sql) => process.env.STRIP_COMMENTS ? sql.split("\n").filter(l => !/^\s*--/.test(l)).join("\n") : sql;
function migrationsList() {
  const dirs = fs.readdirSync(baseDir).filter(d => fs.statSync(path.join(baseDir, d)).isDirectory()).sort();
  return {
    baseDir,
    lockfile: { path: "migration_lock.toml", content: fs.readFileSync(path.join(baseDir, "migration_lock.toml"), "utf8") },
    shadowDbInitScript: "",
    migrationDirectories: dirs.map(d => ({ path: d, migrationFile: { path: "migration.sql", content: { tag: "ok", value: strip(fs.readFileSync(path.join(baseDir, d, "migration.sql"), "utf8")) } } })),
  };
}
const filters = { externalTables: [], externalEnums: [] };
const [cmd, name] = process.argv.slice(2);
if (cmd === "deploy") {
  const out = await engine.applyMigrations({ migrationsList: migrationsList(), filters });
  console.log("applied:", out.appliedMigrationNames);
} else if (cmd === "diff" || cmd === "create") {
  const out = await engine.diff({ from: { tag: "schemaDatasource", ...schemas, configDir: REPO }, to: { tag: "schemaDatamodel", ...schemas }, script: true, shadowDatabaseUrl: null, exitCode: null, filters });
  const sql = out.stdout ?? "";
  if (cmd === "diff") { console.log(sql); }
  else {
    if (!name) throw new Error("name required");
    if (/^-- This is an empty migration/.test(sql.trim()) || !sql.trim()) { console.log("no changes"); process.exit(0); }
    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const dir = path.join(baseDir, `${ts}_${name}`);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "migration.sql"), sql);
    console.log("wrote", dir);
  }
} else { console.error("usage: deploy | diff | create <name>"); process.exit(2); }
process.exit(0);
