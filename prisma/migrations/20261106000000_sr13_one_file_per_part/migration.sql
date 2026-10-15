-- Sourcing Requirements v2, wave 3b: SR-13 (ADR 0036 D5, ruling 20al). Migrations through 20261105100000 are applied, so nothing in them is edited: this adds one trigger and no column.
--
-- One returned part takes one file in one submission. The SR-14 matrix is a row per opening-check part and a column per bid, so a cell is one file. Two files under one part would
-- make Pass or Reject ambiguous and the receipt unclear. The door refuses a submission naming two files for one part, and this holds the same rule at the commit.
-- It is not the missing-part rule: a mandatory part with no file is still warned about and never refused (FR-BID-007).
--
-- SQLSTATE PA030: a submission with two files for one pack part. A deferred constraint trigger, so it reads every part row the transaction wrote, in whatever order they were written.
-- The function pins its search_path and names its tables in the public schema. It reads no clock.

CREATE FUNCTION public."sealed_one_file_per_part"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public."OnlineBidPart" p JOIN public."OnlineBidFile" f ON f."id" = p."fileId"
    WHERE p."onlineBidId" = NEW."onlineBidId"
    GROUP BY f."packPartId" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'A submission % is refused at the commit: it takes two files for one part', NEW."onlineBidId"
      USING ERRCODE = 'PA030', HINT = 'ADR 0036 D5, ruling 20al. One returned part takes one file in one submission.';
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER "OnlineBidPart_one_file_per_part" AFTER INSERT ON "OnlineBidPart" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public."sealed_one_file_per_part"();
ALTER TABLE "OnlineBidPart" ENABLE ALWAYS TRIGGER "OnlineBidPart_one_file_per_part";
