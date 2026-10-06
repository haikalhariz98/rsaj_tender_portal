-- Sign-in (ADR 0034 D11, Phase 1a): the audit trail gains an actor. All six columns are nullable, so every existing row stays as it is.
-- AlterTable
ALTER TABLE "AuditEntry" ADD COLUMN     "actorKind" "ActorKind",
ADD COLUMN     "actorOffices" JSONB,
ADD COLUMN     "actorSessionId" TEXT,
ADD COLUMN     "actorSupplierAccountId" TEXT,
ADD COLUMN     "actorSystemLabel" TEXT,
ADD COLUMN     "sourceAddress" TEXT;


-- Pre-check (the SELECT CAST pattern): the CHECK below holds for every existing row only if none claims an actor.
-- Every row written before sign-in is unattributed with no actor person. Nothing is changed if one is not.
SELECT CAST((SELECT 'Pre-check failed: an audit row is attributed or names an actor person, but no sign-in existed to attribute it to. Find where it came from first. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM "AuditEntry" WHERE NOT "unattributed" OR "actorPersonId" IS NOT NULL)) AS INTEGER);

-- actorKind is null if and only if the row is unattributed, and exactly one actor reference matches the kind.
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_actor_matches_kind" CHECK (
  (("actorKind" IS NULL) = "unattributed")
  AND (
    ("actorKind" IS NULL AND "actorPersonId" IS NULL AND "actorSupplierAccountId" IS NULL AND "actorSystemLabel" IS NULL AND "actorSessionId" IS NULL)
    OR ("actorKind" = 'STAFF' AND "actorPersonId" IS NOT NULL AND "actorSupplierAccountId" IS NULL AND "actorSystemLabel" IS NULL)
    OR ("actorKind" = 'SUPPLIER' AND "actorSupplierAccountId" IS NOT NULL AND "actorPersonId" IS NULL AND "actorSystemLabel" IS NULL)
    OR ("actorKind" = 'SYSTEM' AND "actorSystemLabel" IS NOT NULL AND "actorPersonId" IS NULL AND "actorSupplierAccountId" IS NULL AND "actorSessionId" IS NULL)
  )
);
