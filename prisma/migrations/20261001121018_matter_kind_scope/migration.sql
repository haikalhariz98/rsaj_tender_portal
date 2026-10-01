-- 6.2 increment 2, OD-9 and X-6: the scope matter kind arrives in its own migration, before
-- any column, constraint or row uses it (Postgres refuses a new enum value in the
-- transaction that adds it).
ALTER TYPE "MatterKind" ADD VALUE 'SCOPE';
