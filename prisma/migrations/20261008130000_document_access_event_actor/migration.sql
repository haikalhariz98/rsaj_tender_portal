-- Phase 3b (ADR 0034 D14, OD-2): every download of a document, and every refusal, names who asked. Additive: four nullable columns on the access log. A row written before sign-in
-- keeps all four null, and so does a row for an act nobody was signed in to ask. The columns mirror SulitAccessEvent's: a signed-in person with their session and address, or a loader run
-- by its label. The table stays append-only for the app login (the revoked UPDATE, DELETE and TRUNCATE in scripts/db-roles.ts), so no new grant is needed.
-- The CHECK says a row never names both a person and a loader, and is written so that an unknown value refuses rather than passes ("IS TRUE").

-- AlterTable
ALTER TABLE "DocumentAccessEvent" ADD COLUMN     "actorPersonId" TEXT,
ADD COLUMN     "actorSessionId" TEXT,
ADD COLUMN     "actorSystemLabel" TEXT,
ADD COLUMN     "sourceAddress" TEXT;

-- AddForeignKey
ALTER TABLE "DocumentAccessEvent" ADD CONSTRAINT "DocumentAccessEvent_actorPersonId_fkey" FOREIGN KEY ("actorPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A person or a loader, never both.
ALTER TABLE "DocumentAccessEvent" ADD CONSTRAINT "DocumentAccessEvent_one_actor_at_most" CHECK ((NOT ("actorPersonId" IS NOT NULL AND "actorSystemLabel" IS NOT NULL)) IS TRUE);
