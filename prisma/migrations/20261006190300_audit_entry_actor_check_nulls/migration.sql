-- Corrects AuditEntry_actor_matches_kind from 20261006190200. A CHECK passes when its expression is NULL, and the expression was NULL
-- for a row whose actorKind is null but which names an actor person (every branch compared the kind with a value). The database test found it.
-- COALESCE turns an unknown into a refusal. No existing row can fail it: the earlier migration's pre-check held every row to unattributed with no actor.
-- Pre-check (the SELECT CAST pattern), before anything is dropped: no row names an actor without a kind, or a kind without its actor.
SELECT CAST((SELECT 'Pre-check failed: an audit row names an actor but has no actor kind, or has a kind that does not match its actor references. Find where it came from first. Nothing was changed.' WHERE EXISTS (SELECT 1 FROM "AuditEntry" WHERE "actorKind" IS NULL AND ("actorPersonId" IS NOT NULL OR "actorSupplierAccountId" IS NOT NULL OR "actorSystemLabel" IS NOT NULL OR "actorSessionId" IS NOT NULL))) AS INTEGER);

ALTER TABLE "AuditEntry" DROP CONSTRAINT IF EXISTS "AuditEntry_actor_matches_kind";
ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_actor_matches_kind" CHECK (
  COALESCE(
    (("actorKind" IS NULL) = "unattributed")
    AND (
      ("actorKind" IS NULL AND "actorPersonId" IS NULL AND "actorSupplierAccountId" IS NULL AND "actorSystemLabel" IS NULL AND "actorSessionId" IS NULL)
      OR ("actorKind" = 'STAFF' AND "actorPersonId" IS NOT NULL AND "actorSupplierAccountId" IS NULL AND "actorSystemLabel" IS NULL)
      OR ("actorKind" = 'SUPPLIER' AND "actorSupplierAccountId" IS NOT NULL AND "actorPersonId" IS NULL AND "actorSystemLabel" IS NULL)
      OR ("actorKind" = 'SYSTEM' AND "actorSystemLabel" IS NOT NULL AND "actorPersonId" IS NULL AND "actorSupplierAccountId" IS NULL AND "actorSessionId" IS NULL)
    ),
    false
  )
);
