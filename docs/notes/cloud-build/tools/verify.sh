#!/bin/bash
# Rebuild a throwaway database from prisma/migrations and diff it against schema.prisma.
# Empty diff = the committed migrations reproduce the schema. Never touches `perolehan`.
set -e
su postgres -c "dropdb --if-exists perolehan_verify" && su postgres -c "createdb -O perolehan perolehan_verify"
export STRIP_COMMENTS=1
export DATABASE_URL="postgresql://perolehan:perolehan@localhost:5432/perolehan_verify?schema=public"
cd /tmp/claude-0/sew
NODE_PATH=/home/user/repo/node_modules node pmig.mjs deploy
psql "postgresql://perolehan:perolehan@localhost:5432/perolehan_verify" -Atc "select 'FAILED: '||migration_name from _prisma_migrations where finished_at is null"
NODE_PATH=/home/user/repo/node_modules node pmig.mjs diff
