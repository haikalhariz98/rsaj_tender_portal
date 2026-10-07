-- Phase 3a (ADR 0034 D14, NFR-AUD-004): the log of every access to a SULIT value, allowed or refused. Additive: a new table, empty.
-- The record is text (entity, entityId, entityLabel), as the audit trail's is, so the log outlives the row it names.
-- Every CHECK is written so that an unknown value refuses rather than passes (a CHECK passes on NULL, which migration 20261006190300
-- had to correct once): each is wrapped in "IS TRUE". The lists are the closed lists in src/lib/sulit-fields.ts (SULIT_SCOPES) and
-- src/lib/auth/sulit-access.ts (SULIT_GRANT_BASES, SULIT_REFUSAL_BASES without NOT_LOGGED, which is never stored because the write is what
-- failed). A source test holds this file to those lists, so neither can move alone. The append-only trigger follows in the next migration.

-- CreateTable
CREATE TABLE "SulitAccessEvent" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "actorPersonId" TEXT,
    "actorSystemLabel" TEXT,
    "actorSessionId" TEXT,
    "sourceAddress" TEXT,
    "scope" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityLabel" TEXT NOT NULL DEFAULT '',
    "fields" TEXT[],
    "outcome" "SulitOutcome" NOT NULL,
    "basis" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SulitAccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SulitAccessEvent_organisationId_at_idx" ON "SulitAccessEvent"("organisationId", "at");

-- CreateIndex
CREATE INDEX "SulitAccessEvent_entity_entityId_idx" ON "SulitAccessEvent"("entity", "entityId");

-- CreateIndex
CREATE INDEX "SulitAccessEvent_actorPersonId_at_idx" ON "SulitAccessEvent"("actorPersonId", "at");

-- AddForeignKey
ALTER TABLE "SulitAccessEvent" ADD CONSTRAINT "SulitAccessEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SulitAccessEvent" ADD CONSTRAINT "SulitAccessEvent_actorPersonId_fkey" FOREIGN KEY ("actorPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exactly one actor: a signed-in person, or a loader run by its label.
ALTER TABLE "SulitAccessEvent" ADD CONSTRAINT "SulitAccessEvent_one_actor" CHECK (((("actorPersonId" IS NOT NULL)::int + ("actorSystemLabel" IS NOT NULL)::int) = 1) IS TRUE);

-- The kind of record is one of the registry's scopes.
ALTER TABLE "SulitAccessEvent" ADD CONSTRAINT "SulitAccessEvent_scope_known" CHECK (("scope" IN ('exercise', 'requisition', 'contract', 'supplier', 'evaluation')) IS TRUE);

-- At least one field (or the record itself) was asked for.
ALTER TABLE "SulitAccessEvent" ADD CONSTRAINT "SulitAccessEvent_has_fields" CHECK ((cardinality("fields") >= 1) IS TRUE);

-- A shown value has a granting basis, a withheld one a refusing basis, and no other pairing is stored.
ALTER TABLE "SulitAccessEvent" ADD CONSTRAINT "SulitAccessEvent_basis_matches_outcome" CHECK ((("outcome" = 'GRANTED' AND "basis" IN ('NAMED_ON_RECORD', 'ORGANISATION_PERMISSION', 'IN_CUSTODY')) OR ("outcome" = 'WITHHELD' AND "basis" IN ('ADMINISTRATOR', 'NOT_A_PERSON', 'RESTRICTED_NOT_NAMED', 'NOT_NAMED_PERMISSION_UNDECIDED', 'NOT_NAMED_PERMISSION_WITHHELD', 'NOT_NAMED_PERMISSION_SCOPED', 'NOT_NAMED_PERMISSION_NOT_HELD', 'FIELD_NOT_FOR_THIS_RECORD', 'SEALED', 'CUSTODY_NOT_SET', 'NOT_IN_CUSTODY', 'CUSTODY_DAY_UNKNOWN'))) IS TRUE);
