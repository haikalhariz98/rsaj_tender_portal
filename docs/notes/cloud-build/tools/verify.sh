#!/bin/bash
# Rebuild a throwaway database from prisma/migrations and diff it against schema.prisma.
# Empty diff = the committed migrations reproduce the schema. Never touches `perolehan`.
#
# The tools directory is the one this script lives in (override: PEROLEHAN_TOOLS_DIR); it must
# hold pmig.mjs, adapter-pg-patched.cjs and node_modules/@prisma/schema-engine-wasm (see ENV.md).
# The repository defaults to /home/user/repo (override: PEROLEHAN_REPO).
set -euo pipefail
TOOLS="${PEROLEHAN_TOOLS_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
REPO="${PEROLEHAN_REPO:-/home/user/repo}"

# Every helper is checked before anything is dropped: a missing one must not cost the database.
missing=0
for f in "$TOOLS/pmig.mjs" "$TOOLS/adapter-pg-patched.cjs" "$TOOLS/node_modules/@prisma/schema-engine-wasm/schema_engine_bg.js" "$TOOLS/node_modules/@prisma/schema-engine-wasm/schema_engine_bg.wasm" "$REPO/prisma/schema.prisma" "$REPO/node_modules/@prisma/driver-adapter-utils/package.json"; do
  if [ ! -f "$f" ]; then echo "verify.sh: not found: $f" >&2; missing=1; fi
done
if [ "$missing" -ne 0 ]; then
  echo "verify.sh: nothing was dropped. Set up the tools directory as docs/notes/cloud-build/ENV.md says (or set PEROLEHAN_TOOLS_DIR / PEROLEHAN_REPO), then run again." >&2
  exit 1
fi

su postgres -c "dropdb --if-exists perolehan_verify" && su postgres -c "createdb -O perolehan perolehan_verify"
export STRIP_COMMENTS=1
export DATABASE_URL="postgresql://perolehan:perolehan@localhost:5432/perolehan_verify?schema=public"
export PEROLEHAN_TOOLS_DIR="$TOOLS" PEROLEHAN_REPO="$REPO"
cd "$TOOLS"
NODE_PATH="$REPO/node_modules" node pmig.mjs deploy
psql "postgresql://perolehan:perolehan@localhost:5432/perolehan_verify" -Atc "select 'FAILED: '||migration_name from _prisma_migrations where finished_at is null"
NODE_PATH="$REPO/node_modules" node pmig.mjs diff
