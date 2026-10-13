-- Sourcing Requirements v2, wave 3b: SR-13 (ADR 0036 D12, rulings 20aa). The security audit and code review of stage A, applied to migration B's triggers.
-- Migration 20261103110000 is applied, so nothing in it is edited: every function here is replaced, and every new rule is a new trigger.
--
-- What changes, by finding:
--   1  search_path. Every sealed trigger function runs with search_path = pg_catalog, public, pg_temp and names its tables in the public schema, so a temporary
--      table called "SourcingExercise", "Opening" or "PublishedKeyChange" cannot stand in for the real one. Every other trigger function of the repository gets
--      the same search_path (ALTER FUNCTION, bodies unchanged). The app's login also loses TEMPORARY on the database (src/lib/auth/db-role.ts, db:roles).
--   2  "written in this transaction". It was read from a row version's xmin, which any later UPDATE resets, even one that changes nothing. It is now read from
--      columns of type xid8 that only a trigger writes: insertedXact on BidEnvelope, OnlineBid and PublishedKeyChange, statusXact on OnlineBid, and
--      unsealedXact and finalisedXact on Opening. An UPDATE of an ONLINE envelope that changes nothing is refused. Every ONLINE envelope has its OnlineBid by the
--      commit (deferred). A submission's envelope is stamped within the skew of the clock when the submission is written.
--   3  the clock. sealed_clock() reads clock_timestamp(), the moment of the act, not now(), the start of the transaction, and is VOLATILE (ruling 20aa).
--   4  the channel and the bid rules. submissionChannel never changes once the exercise is published, and onlineBidRules never changes once written or published.
--   5  a share release. A release is checked when it is written: its keys belong to its exercise, and a substitution names the incoming officer's live roster
--      row and live key, takes a share the departing officer still holds, and is written before the closing.
--   7  one standing main bid. A supplier holds at most one SUBMITTED bid of kind BID per exercise, in time or late, checked at the commit.
--   M1, S3  a replacement is of the replaced submission's kind, and an alternative's parent is a bid.
--
-- SQLSTATEs added (PA010 to PA029 are wave 3b's): PA025 the channel and the bid rules frozen at publication, PA026 a share release, PA027 one standing main bid.
-- PA013 also covers an ONLINE envelope left without its submission at the commit.
-- MAX_STAMP_SKEW_SECONDS is the product constant in src/lib/portal/bids/limits.ts, written here as the literal 30. A test pins the two equal.
-- The tables are new and hold no ONLINE rows outside the scratch database. The new xid8 columns are NULL on the rows that exist, which reads as "not written in
-- this transaction", and that is true of every one of them.

-- AlterTable
ALTER TABLE "BidEnvelope" ADD COLUMN     "insertedXact" xid8;

-- AlterTable
ALTER TABLE "Opening" ADD COLUMN     "finalisedXact" xid8,
ADD COLUMN     "unsealedXact" xid8;

-- AlterTable
ALTER TABLE "OnlineBid" ADD COLUMN     "insertedXact" xid8,
ADD COLUMN     "statusXact" xid8;

-- AlterTable
ALTER TABLE "PublishedKeyChange" ADD COLUMN     "insertedXact" xid8;


-- ================================================================== hand-written

-- ------------------------------------------------------------------ helpers

-- Ruling 20aa: the moment of the act. Read once by each trigger, into its own variable.
CREATE OR REPLACE FUNCTION public."sealed_clock"() RETURNS timestamp LANGUAGE sql VOLATILE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp
$$;

ALTER FUNCTION public."sealed_unchanged"(jsonb, jsonb, text[]) SET search_path = pg_catalog, public, pg_temp;

-- ------------------------------------------------------------------ trigger 1: the stamp on an ONLINE envelope (H2)

CREATE OR REPLACE FUNCTION public."sealed_envelope_stamp"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  clock timestamp := public."sealed_clock"();
  closing timestamp;
  channel_pin text;
BEGIN
  -- The inserting transaction, whatever the writer sent.
  NEW."insertedXact" := pg_current_xact_id();
  IF NEW."channel" <> 'ONLINE' THEN
    RETURN NEW;
  END IF;
  IF NEW."receivedAt" <> date_trunc('second', NEW."receivedAt") OR NEW."receivedAt" > clock OR NEW."receivedAt" < clock - make_interval(secs => 30) THEN
    RAISE EXCEPTION 'INSERT of an ONLINE envelope is refused: its stamp % is not a whole second within 30 seconds before the database clock %', NEW."receivedAt", clock
      USING ERRCODE = 'PA010', HINT = 'ADR 0036 D5, H2, S24, ruling 20aa. The submission takes its stamp from the database clock, to the second, and inserts within the skew of the moment of the insert.';
  END IF;
  SELECT e."closingAt", e."submissionChannel"::text INTO closing, channel_pin FROM public."SourcingExercise" e WHERE e."id" = NEW."exerciseId";
  IF channel_pin IS DISTINCT FROM 'ONLINE' OR closing IS NULL THEN
    RAISE EXCEPTION 'INSERT of an ONLINE envelope is refused: the exercise is not pinned ONLINE, or has no closing'
      USING ERRCODE = 'PA010', HINT = 'ADR 0036 D1. An online submission is taken only on an exercise pinned ONLINE, judged against its closing.';
  END IF;
  IF EXISTS (SELECT 1 FROM public."Opening" o WHERE o."exerciseId" = NEW."exerciseId" AND o."kind" = 'MAIN') THEN
    RAISE EXCEPTION 'INSERT of an ONLINE envelope is refused: the main opening has started, and the register is now the opening''s'
      USING ERRCODE = 'PA011', HINT = 'ADR 0036 D7, ruling 20b. Late submissions are taken until the main opening is started.';
  END IF;
  NEW."closingAtJudged" := closing;
  NEW."late" := NEW."receivedAt" > closing;
  NEW."recordedAfterClosing" := NEW."late";
  RETURN NEW;
END
$$;

-- Deferred to the commit: an ONLINE envelope is written with its submission, never alone, so none waits to be claimed by a later transaction (audit 2).
CREATE FUNCTION public."sealed_envelope_has_bid"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."OnlineBid" b WHERE b."envelopeId" = NEW."id") THEN
    RAISE EXCEPTION 'An ONLINE envelope % is refused at the commit: its submission was not written with it', NEW."id"
      USING ERRCODE = 'PA013', HINT = 'ADR 0036 D5, S11, security audit 2. The envelope and the submission are written by one act, in one transaction.';
  END IF;
  RETURN NULL;
END
$$;

-- ------------------------------------------------------------------ trigger 2 on the envelope: status moves, forward only, with its submission

CREATE OR REPLACE FUNCTION public."sealed_envelope_move"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  bid_status text;
BEGIN
  IF OLD."channel" <> 'ONLINE' AND NEW."channel" <> 'ONLINE' THEN
    NEW."insertedXact" := OLD."insertedXact";
    RETURN NEW;
  END IF;
  IF NOT public."sealed_unchanged"(to_jsonb(OLD), to_jsonb(NEW), ARRAY['status', 'partyId']) THEN
    RAISE EXCEPTION 'UPDATE of an ONLINE envelope is refused: its channel, stamp, sequence, late flag and closing judged are the database''s and never change'
      USING ERRCODE = 'PA012', HINT = 'ADR 0036 D12, H2. Only its status moves, with its submission''s, and its party is named at the unseal.';
  END IF;
  IF NEW."status" IS NOT DISTINCT FROM OLD."status" AND NEW."partyId" IS NOT DISTINCT FROM OLD."partyId" THEN
    RAISE EXCEPTION 'UPDATE of an ONLINE envelope that changes nothing is refused'
      USING ERRCODE = 'PA012', HINT = 'Security audit 2. An ONLINE envelope is updated only to move its status or name its party.';
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    SELECT b."status"::text INTO bid_status FROM public."OnlineBid" b WHERE b."envelopeId" = NEW."id";
    IF OLD."status" <> 'RECEIVED'
       OR NOT ((NEW."status" = 'SUPERSEDED' AND bid_status = 'REPLACED') OR (NEW."status" = 'WITHDRAWN' AND bid_status = 'WITHDRAWN') OR (NEW."status" = 'OPENED' AND bid_status = 'OPENED')) THEN
      RAISE EXCEPTION 'UPDATE of an ONLINE envelope from % to % is refused: it moves forward only, and only with its submission (now %)', OLD."status", NEW."status", coalesce(bid_status, 'none')
        USING ERRCODE = 'PA012', HINT = 'ADR 0036 D7. The submission moves first, judged by its own stamp, and the envelope follows it.';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- ------------------------------------------------------------------ triggers 2 to 6 on OnlineBid

CREATE OR REPLACE FUNCTION public."sealed_online_bid_change"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  clock timestamp := public."sealed_clock"();
  closing timestamp;
  replacement_stamp timestamp;
  old_parent_status text;
  old_parent_moved_here boolean;
BEGIN
  IF NOT public."sealed_unchanged"(to_jsonb(OLD), to_jsonb(NEW), ARRAY['status', 'statusAt', 'parentOnlineBidId', 'statusXact']) THEN
    RAISE EXCEPTION 'UPDATE of "OnlineBid" % is refused: a submission''s ciphertext, digests, keys and identity never change', OLD."id"
      USING ERRCODE = 'PA014', HINT = 'ADR 0036 D12, S8. Ciphertext is immutable.';
  END IF;
  -- The transaction that moved the status, kept by this trigger whatever the writer sent.
  NEW."statusXact" := CASE WHEN NEW."status" IS DISTINCT FROM OLD."status" THEN pg_current_xact_id() ELSE OLD."statusXact" END;

  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF OLD."status" <> 'SUBMITTED' THEN
      RAISE EXCEPTION 'UPDATE of "OnlineBid" % from % to % is refused: a status moves forward only', OLD."id", OLD."status", NEW."status"
        USING ERRCODE = 'PA012', HINT = 'ADR 0036 D7, S12. A replaced, withdrawn or opened submission never moves again.';
    END IF;
    SELECT e."closingAt" INTO closing FROM public."SourcingExercise" e WHERE e."id" = NEW."exerciseId";
    IF NEW."status" = 'REPLACED' THEN
      -- Judged by the replacement's own stamp: the replacement and its envelope inserted in this transaction, in time.
      SELECT ne."receivedAt" INTO replacement_stamp
        FROM public."OnlineBid" r JOIN public."BidEnvelope" ne ON ne."id" = r."envelopeId"
        WHERE r."replacesOnlineBidId" = OLD."id" AND r."kind" = OLD."kind" AND r."insertedXact" = pg_current_xact_id() AND ne."insertedXact" = pg_current_xact_id()
          AND NOT ne."late" AND ne."receivedAt" <= closing;
      IF replacement_stamp IS NULL OR NEW."statusAt" IS DISTINCT FROM replacement_stamp THEN
        RAISE EXCEPTION 'UPDATE of "OnlineBid" % to REPLACED is refused: no in-time replacement was submitted in this transaction, or the stamp is not the replacement''s', OLD."id"
          USING ERRCODE = 'PA012', HINT = 'ADR 0036 D7, FR-BID-002. A replace is allowed up to and including the closing second, judged by the replacement''s stamp.';
      END IF;
    ELSIF NEW."status" = 'WITHDRAWN' THEN
      IF NEW."statusAt" IS NULL OR NEW."statusAt" <> date_trunc('second', NEW."statusAt") OR NEW."statusAt" > clock OR NEW."statusAt" < clock - make_interval(secs => 30) OR closing IS NULL OR NEW."statusAt" > closing THEN
        RAISE EXCEPTION 'UPDATE of "OnlineBid" % to WITHDRAWN is refused: the withdrawal''s stamp % is not a whole second within 30 seconds before the database clock, at or before the closing', OLD."id", NEW."statusAt"
          USING ERRCODE = 'PA012', HINT = 'ADR 0036 D7, FR-BID-004, ruling 20aa. A withdrawal is allowed up to and including the closing second, judged by its own stamp.';
      END IF;
    ELSIF NEW."status" = 'OPENED' THEN
      IF NOT EXISTS (SELECT 1 FROM public."Opening" o WHERE o."exerciseId" = NEW."exerciseId" AND o."unsealedAt" IS NOT NULL AND o."finalisedAt" IS NULL AND o."unsealedXact" = pg_current_xact_id()) THEN
        RAISE EXCEPTION 'UPDATE of "OnlineBid" % to OPENED is refused: no unseal of this exercise''s opening is being written in this transaction', OLD."id"
          USING ERRCODE = 'PA022', HINT = 'ADR 0036 D10, security audit 2. Only the last authorisation of the unseal opens a submission.';
      END IF;
    END IF;
  ELSIF NEW."statusAt" IS DISTINCT FROM OLD."statusAt" THEN
    RAISE EXCEPTION 'UPDATE of "OnlineBid" % is refused: a status stamp changes only with its status', OLD."id"
      USING ERRCODE = 'PA012', HINT = 'ADR 0036 D7.';
  END IF;

  -- Trigger 6 (20h, M2): the parent moves only in the transaction that moved the old parent's status, to its replacement or to none.
  IF NEW."parentOnlineBidId" IS DISTINCT FROM OLD."parentOnlineBidId" THEN
    SELECT p."status"::text, (p."statusXact" = pg_current_xact_id()) INTO old_parent_status, old_parent_moved_here FROM public."OnlineBid" p WHERE p."id" = OLD."parentOnlineBidId";
    IF OLD."parentOnlineBidId" IS NULL
       OR old_parent_moved_here IS NOT TRUE
       OR NOT ((NEW."parentOnlineBidId" IS NULL AND old_parent_status = 'WITHDRAWN')
            OR (old_parent_status = 'REPLACED' AND EXISTS (SELECT 1 FROM public."OnlineBid" r WHERE r."id" = NEW."parentOnlineBidId" AND r."replacesOnlineBidId" = OLD."parentOnlineBidId"))) THEN
      RAISE EXCEPTION 'UPDATE of "OnlineBid" % is refused: an alternative''s parent moves only to its parent''s replacement, or to none on its parent''s withdrawal, in that act', OLD."id"
        USING ERRCODE = 'PA016', HINT = 'ADR 0036 D7, ruling 20h, M2. No link ever points at a replaced or withdrawn bid, and none is added after submission.';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- ------------------------------------------------------------------ trigger 3: a submission is written whole, in its own transaction

CREATE OR REPLACE FUNCTION public."sealed_online_bid_insert"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  clock timestamp := public."sealed_clock"();
BEGIN
  NEW."insertedXact" := pg_current_xact_id();
  NEW."statusXact" := NULL;
  IF NEW."status" <> 'SUBMITTED' OR NEW."statusAt" IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM public."BidEnvelope" e WHERE e."id" = NEW."envelopeId" AND e."channel" = 'ONLINE' AND e."status" = 'RECEIVED'
                      AND e."exerciseId" = NEW."exerciseId" AND e."organisationId" = NEW."organisationId" AND e."kind"::text = NEW."kind"::text
                      AND e."insertedXact" = pg_current_xact_id() AND e."receivedAt" <= clock AND e."receivedAt" >= clock - make_interval(secs => 30)) THEN
    RAISE EXCEPTION 'INSERT of "OnlineBid" is refused: its ONLINE envelope, of the same kind and stamped within 30 seconds before the database clock, was not inserted in this transaction'
      USING ERRCODE = 'PA013', HINT = 'ADR 0036 D5, S11, security audit 2. The envelope and the submission are written by one act, in one transaction.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."ExerciseSealingKey" k WHERE k."id" = NEW."keyId" AND k."exerciseId" = NEW."exerciseId" AND k."retiredAt" IS NULL) THEN
    RAISE EXCEPTION 'INSERT of "OnlineBid" is refused: it is not sealed under the exercise''s live key'
      USING ERRCODE = 'PA013', HINT = 'ADR 0036 D3, S10.';
  END IF;
  IF NEW."parentOnlineBidId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."OnlineBid" p WHERE p."id" = NEW."parentOnlineBidId" AND p."exerciseId" = NEW."exerciseId" AND p."supplierId" = NEW."supplierId" AND p."status" = 'SUBMITTED' AND p."kind" = 'BID') THEN
    RAISE EXCEPTION 'INSERT of "OnlineBid" is refused: the parent it names is not the same supplier''s live bid on this exercise'
      USING ERRCODE = 'PA013', HINT = 'ADR 0036 D7, ruling 20h (PARENT_NOT_YOUR_LIVE_BID), review S3. An alternative''s parent is a bid, never another alternative.';
  END IF;
  IF NEW."replacesOnlineBidId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."OnlineBid" p WHERE p."id" = NEW."replacesOnlineBidId" AND p."exerciseId" = NEW."exerciseId" AND p."supplierId" = NEW."supplierId" AND p."status" = 'SUBMITTED' AND p."kind" = NEW."kind") THEN
    RAISE EXCEPTION 'INSERT of "OnlineBid" is refused: the submission it replaces is not the same supplier''s live submission of the same kind on this exercise'
      USING ERRCODE = 'PA013', HINT = 'ADR 0036 D7, review M1. A bid replaces a bid, and an alternative an alternative.';
  END IF;
  RETURN NEW;
END
$$;

-- Deferred to the commit, under a lock on the supplier and the exercise: at most one SUBMITTED bid of kind BID, in time or late (FR-BID-005, audit 7, review S1).
-- The count is a fresh statement after the lock, so at READ COMMITTED it sees a rival transaction that committed while this one waited. A transaction at a
-- stricter isolation would read its own older snapshot, so it is refused here: the submit and the replace run at READ COMMITTED, the database's default.
CREATE FUNCTION public."sealed_one_standing_main_bid"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  standing bigint;
BEGIN
  IF NEW."kind" <> 'BID' OR NEW."status" <> 'SUBMITTED' THEN
    RETURN NULL;
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'A submitted bid on exercise % is refused: it is written at READ COMMITTED only', NEW."exerciseId"
      USING ERRCODE = 'PA027', HINT = 'Security audit 7. The one-bid check must see a rival that committed while it waited.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('perolehan.one-standing-main-bid|' || NEW."exerciseId" || '|' || NEW."supplierId", 0));
  SELECT count(*) INTO standing FROM public."OnlineBid" b WHERE b."exerciseId" = NEW."exerciseId" AND b."supplierId" = NEW."supplierId" AND b."kind" = 'BID' AND b."status" = 'SUBMITTED';
  IF standing > 1 THEN
    RAISE EXCEPTION 'A second standing bid of one supplier on exercise % is refused at the commit', NEW."exerciseId"
      USING ERRCODE = 'PA027', HINT = 'FR-BID-005, security audit 7, review S1. A supplier holds one bid, in time or late. A replace is the way to change it.';
  END IF;
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION public."sealed_online_bid_part"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION '% on "OnlineBidPart" is refused: the files a submission took never change', TG_OP
      USING ERRCODE = CASE WHEN TG_OP = 'DELETE' THEN 'PA020' ELSE 'PA014' END, HINT = 'ADR 0036 D5, H2.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."OnlineBid" b JOIN public."OnlineBidFile" f ON f."id" = NEW."fileId"
                 WHERE b."id" = NEW."onlineBidId" AND b."insertedXact" = pg_current_xact_id() AND b."organisationId" = NEW."organisationId"
                   AND f."organisationId" = b."organisationId" AND f."exerciseId" = b."exerciseId" AND f."supplierId" = b."supplierId" AND f."keyId" = b."keyId" AND f."state" = 'DRAFT') THEN
    RAISE EXCEPTION 'INSERT of "OnlineBidPart" is refused: the file is not the same supplier''s draft under the same key, or the submission was not written in this transaction'
      USING ERRCODE = 'PA013', HINT = 'ADR 0036 D5, H2. Each file belongs to one submission.';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public."sealed_online_bid_file_insert"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW."state" <> 'DRAFT' OR NEW."releasedDek" IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM public."ExerciseSealingKey" k WHERE k."id" = NEW."keyId" AND k."exerciseId" = NEW."exerciseId" AND k."organisationId" = NEW."organisationId" AND k."retiredAt" IS NULL) THEN
    RAISE EXCEPTION 'INSERT of "OnlineBidFile" is refused: a part is uploaded as a draft, with no released key, under the exercise''s live key'
      USING ERRCODE = 'PA024', HINT = 'ADR 0036 D5, S10.';
  END IF;
  RETURN NEW;
END
$$;

-- ------------------------------------------------------------------ triggers 4 and 5 on OnlineBidFile (step 15 replaces this function for the shred)

CREATE OR REPLACE FUNCTION public."sealed_online_bid_file_change"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT public."sealed_unchanged"(to_jsonb(OLD), to_jsonb(NEW), ARRAY['state', 'releasedDek']) THEN
    RAISE EXCEPTION 'UPDATE of "OnlineBidFile" % is refused: a bid file''s ciphertext, sealed key, metadata and identity never change', OLD."id"
      USING ERRCODE = 'PA014', HINT = 'ADR 0036 D12, S8. Ciphertext is immutable.';
  END IF;
  IF NEW."state" IS DISTINCT FROM OLD."state" AND (OLD."state" <> 'DRAFT' OR NEW."state" NOT IN ('SUBMITTED', 'DISCARDED')) THEN
    RAISE EXCEPTION 'UPDATE of "OnlineBidFile" % from % to % is refused: a draft is taken by a submission or discarded, once', OLD."id", OLD."state", NEW."state"
      USING ERRCODE = 'PA012', HINT = 'ADR 0036 D5.';
  END IF;
  IF NEW."releasedDek" IS DISTINCT FROM OLD."releasedDek" THEN
    IF OLD."releasedDek" IS NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public."OnlineBidPart" p
                       JOIN public."OnlineBid" b ON b."id" = p."onlineBidId"
                       JOIN public."OpenedBid" ob ON ob."envelopeId" = b."envelopeId"
                       JOIN public."Opening" o ON o."id" = ob."openingId"
                     WHERE p."fileId" = NEW."id" AND b."status" = 'OPENED' AND o."finalisedAt" IS NOT NULL AND o."finalisedXact" = pg_current_xact_id()) THEN
        RAISE EXCEPTION 'UPDATE of "OnlineBidFile" % is refused: a data key is released only while its opening is being finalised', OLD."id"
          USING ERRCODE = 'PA015', HINT = 'ADR 0036 D10, M5, security audit 2. The finalise sets finalisedAt first, then the released keys.';
      END IF;
    ELSE
      -- The shred waits for the file's document link, built with the mover in wave 3b step 15, which replaces this function in a new migration.
      RAISE EXCEPTION 'UPDATE of "OnlineBidFile" % is refused: a released data key is shredded only once the file''s document link exists', OLD."id"
        USING ERRCODE = 'PA015', HINT = 'ADR 0036 D10, M5. The mover writes the link, then shreds the key.';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- ------------------------------------------------------------------ the opening's acts: which transaction unsealed it, and which finalised it

CREATE FUNCTION public."sealed_opening_xacts"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."unsealedXact" := CASE WHEN NEW."unsealedAt" IS NULL THEN NULL ELSE pg_current_xact_id() END;
    NEW."finalisedXact" := CASE WHEN NEW."finalisedAt" IS NULL THEN NULL ELSE pg_current_xact_id() END;
  ELSE
    NEW."unsealedXact" := CASE WHEN NEW."unsealedAt" IS NULL THEN NULL WHEN NEW."unsealedAt" IS DISTINCT FROM OLD."unsealedAt" THEN pg_current_xact_id() ELSE OLD."unsealedXact" END;
    NEW."finalisedXact" := CASE WHEN NEW."finalisedAt" IS NULL THEN NULL WHEN NEW."finalisedAt" IS DISTINCT FROM OLD."finalisedAt" THEN pg_current_xact_id() ELSE OLD."finalisedXact" END;
  END IF;
  RETURN NEW;
END
$$;

-- ------------------------------------------------------------------ trigger 4 on the key tables, the releases, the grants and the lodgement

CREATE OR REPLACE FUNCTION public."sealed_officer_key_change"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT public."sealed_unchanged"(to_jsonb(OLD), to_jsonb(NEW), ARRAY['failedAttempts', 'lockedUntil', 'retiredAt', 'retiredReason'])
     OR (OLD."retiredAt" IS NOT NULL AND (NEW."retiredAt" IS DISTINCT FROM OLD."retiredAt" OR NEW."retiredReason" IS DISTINCT FROM OLD."retiredReason")) THEN
    RAISE EXCEPTION 'UPDATE of "OfficerExerciseKey" % is refused: the key material never changes, and a retirement is final', OLD."id"
      USING ERRCODE = 'PA014', HINT = 'ADR 0036 D3, D4. Only the lockout counter moves, and a new passphrase is a new key.';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public."sealed_exercise_key_change"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  clock timestamp := public."sealed_clock"();
  closing timestamp;
BEGIN
  IF NOT public."sealed_unchanged"(to_jsonb(OLD), to_jsonb(NEW), ARRAY['retiredAt', 'retiredReason']) OR OLD."retiredAt" IS NOT NULL THEN
    RAISE EXCEPTION 'UPDATE of "ExerciseSealingKey" % is refused: the key and its fingerprint never change, and a retirement is final', OLD."id"
      USING ERRCODE = 'PA014', HINT = 'ADR 0036 D3, D11.';
  END IF;
  IF NEW."retiredAt" IS NOT NULL THEN
    SELECT e."closingAt" INTO closing FROM public."SourcingExercise" e WHERE e."id" = NEW."exerciseId";
    IF closing IS NOT NULL AND date_trunc('second', clock) > closing THEN
      RAISE EXCEPTION 'UPDATE of "ExerciseSealingKey" % is refused: no key is retired after the closing', OLD."id"
        USING ERRCODE = 'PA017', HINT = 'ADR 0036 D11, rulings 11 and 20g. After the closing a lost share means re-tender.';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public."sealed_key_share_change"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT public."sealed_unchanged"(to_jsonb(OLD), to_jsonb(NEW), ARRAY['sealedShare', 'endedAt', 'endedReason'])
     OR (OLD."sealedShare" IS NULL AND NEW."sealedShare" IS NOT NULL)
     OR (OLD."sealedShare" IS NOT NULL AND NEW."sealedShare" IS NOT NULL AND NEW."sealedShare" <> OLD."sealedShare")
     OR (OLD."endedAt" IS NOT NULL AND (NEW."endedAt" IS DISTINCT FROM OLD."endedAt" OR NEW."endedReason" IS DISTINCT FROM OLD."endedReason")) THEN
    RAISE EXCEPTION 'UPDATE of "ExerciseKeyShare" % is refused: a share never changes, and a shred goes from set to NULL only, once', OLD."id"
      USING ERRCODE = 'PA014', HINT = 'ADR 0036 D3, C-2.';
  END IF;
  IF OLD."sealedShare" IS NOT NULL AND NEW."sealedShare" IS NULL
     AND NOT EXISTS (SELECT 1 FROM public."ExerciseSealingKey" k WHERE k."id" = OLD."keyId" AND k."retiredAt" IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM public."ShareRelease" r WHERE r."keyId" = OLD."keyId" AND r."purpose" = 'SUBSTITUTION' AND r."fromOfficerKeyId" = OLD."officerKeyId") THEN
    RAISE EXCEPTION 'UPDATE of "ExerciseKeyShare" % is refused: a share is shredded only when its key is retired or its officer has released it at a substitution', OLD."id"
      USING ERRCODE = 'PA014', HINT = 'ADR 0036 D11, ruling 20g.';
  END IF;
  RETURN NEW;
END
$$;

-- A release is checked as it is written (audit 5), so a forged substitution cannot license the shred of a share, which would lose the key for good.
CREATE FUNCTION public."sealed_share_release_insert"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  clock timestamp := public."sealed_clock"();
  key_exercise text;
  closing timestamp;
BEGIN
  SELECT k."exerciseId" INTO key_exercise FROM public."ExerciseSealingKey" k WHERE k."id" = NEW."keyId" AND k."organisationId" = NEW."organisationId";
  IF key_exercise IS NULL OR NEW."fromOfficerKeyId" = NEW."toOfficerKeyId" OR NEW."sealedShares" IS NULL OR NEW."usedAt" IS NOT NULL OR NEW."lapsedAt" IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM public."OfficerExerciseKey" f WHERE f."id" = NEW."fromOfficerKeyId" AND f."exerciseId" = key_exercise)
     OR NOT EXISTS (SELECT 1 FROM public."OfficerExerciseKey" t WHERE t."id" = NEW."toOfficerKeyId" AND t."exerciseId" = key_exercise)
     OR (NEW."purpose" = 'UNSEAL' AND NOT EXISTS (SELECT 1 FROM public."Opening" o JOIN public."OpeningAuthorisation" a ON a."openingId" = o."id"
                                                  WHERE o."id" = NEW."openingId" AND a."id" = NEW."authorisationId" AND o."exerciseId" = key_exercise)) THEN
    RAISE EXCEPTION 'INSERT of "ShareRelease" is refused: its keys, its opening or its authorisation are not of its exercise, or it is not written unused'
      USING ERRCODE = 'PA026', HINT = 'ADR 0036 D10, D11, security audit 5.';
  END IF;
  IF NEW."purpose" = 'SUBSTITUTION' THEN
    SELECT e."closingAt" INTO closing FROM public."SourcingExercise" e WHERE e."id" = key_exercise;
    IF NOT EXISTS (SELECT 1 FROM public."ExerciseSealingKey" k WHERE k."id" = NEW."keyId" AND k."retiredAt" IS NULL)
       OR NOT EXISTS (SELECT 1 FROM public."ExerciseOpeningOfficer" r WHERE r."id" = NEW."substitutionOfficerId" AND r."exerciseId" = key_exercise AND r."endedAt" IS NULL)
       OR NOT EXISTS (SELECT 1 FROM public."OfficerExerciseKey" t WHERE t."id" = NEW."toOfficerKeyId" AND t."openingOfficerId" = NEW."substitutionOfficerId" AND t."retiredAt" IS NULL)
       OR NOT EXISTS (SELECT 1 FROM public."OfficerExerciseKey" f WHERE f."id" = NEW."fromOfficerKeyId" AND f."openingOfficerId" <> NEW."substitutionOfficerId" AND f."retiredAt" IS NULL)
       OR NOT EXISTS (SELECT 1 FROM public."ExerciseKeyShare" s WHERE s."keyId" = NEW."keyId" AND s."officerKeyId" = NEW."fromOfficerKeyId" AND s."sealedShare" IS NOT NULL)
       OR closing IS NULL OR clock >= closing THEN
      RAISE EXCEPTION 'INSERT of a SUBSTITUTION "ShareRelease" is refused: it must name the incoming officer''s live roster row and live key, take a share the departing officer still holds under the live key, and be written before the closing'
        USING ERRCODE = 'PA026', HINT = 'ADR 0036 D11, ruling 11, security audit 5. At or after the closing the roster does not change.';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public."sealed_share_release_change"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT public."sealed_unchanged"(to_jsonb(OLD), to_jsonb(NEW), ARRAY['sealedShares', 'usedAt', 'lapsedAt'])
     OR (OLD."sealedShares" IS NULL AND NEW."sealedShares" IS NOT NULL)
     OR (OLD."sealedShares" IS NOT NULL AND NEW."sealedShares" IS NOT NULL AND NEW."sealedShares" <> OLD."sealedShares")
     OR (OLD."usedAt" IS NOT NULL AND NEW."usedAt" IS DISTINCT FROM OLD."usedAt")
     OR (OLD."lapsedAt" IS NOT NULL AND NEW."lapsedAt" IS DISTINCT FROM OLD."lapsedAt") THEN
    RAISE EXCEPTION 'UPDATE of "ShareRelease" % is refused: a release never changes, and a shred goes from set to NULL only, once used or lapsed', OLD."id"
      USING ERRCODE = 'PA014', HINT = 'ADR 0036 D10, M1, C-2.';
  END IF;
  RETURN NEW;
END
$$;

ALTER FUNCTION public."sealed_never_changes"() SET search_path = pg_catalog, public, pg_temp;

-- ------------------------------------------------------------------ trigger 8: LODGEMENT_CLOSED

CREATE OR REPLACE FUNCTION public."sealed_lodgement_rules"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  clock timestamp := public."sealed_clock"();
  closing timestamp;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NOT public."sealed_unchanged"(to_jsonb(OLD), to_jsonb(NEW), ARRAY['supersededAt', 'supersededReason']) OR OLD."supersededAt" IS NOT NULL THEN
      RAISE EXCEPTION 'UPDATE of "SealedEstimateLodgement" % is refused: a lodgement never changes, and is superseded once', OLD."id"
        USING ERRCODE = 'PA014', HINT = 'ADR 0036 D10, FR-EST-007.';
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM public."ExerciseSealingKey" k WHERE k."id" = NEW."keyId" AND k."exerciseId" = NEW."exerciseId" AND k."retiredAt" IS NULL) THEN
    RAISE EXCEPTION 'INSERT of "SealedEstimateLodgement" is refused: it is not sealed under the exercise''s live key'
      USING ERRCODE = 'PA018', HINT = 'ADR 0036 D10, ruling 20g.';
  END IF;
  SELECT e."closingAt" INTO closing FROM public."SourcingExercise" e WHERE e."id" = NEW."exerciseId";
  IF closing IS NOT NULL AND date_trunc('second', clock) > closing THEN
    RAISE EXCEPTION 'LODGEMENT_CLOSED: the sealed estimate is not lodged or superseded after the closing'
      USING ERRCODE = 'PA018', HINT = 'ADR 0036 D10, ruling 20g, FR-EST-007.';
  END IF;
  RETURN NEW;
END
$$;

-- ------------------------------------------------------------------ triggers 7 and 9: the keys, the fingerprint and the pepper

CREATE OR REPLACE FUNCTION public."sealed_officer_key_insert"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  mode text;
  channel_pin text;
BEGIN
  SELECT e."onlineSubmissionMode"::text, e."submissionChannel"::text INTO mode, channel_pin FROM public."SourcingExercise" e WHERE e."id" = NEW."exerciseId";
  IF channel_pin IS DISTINCT FROM 'ONLINE' OR NEW."retiredAt" IS NOT NULL OR NEW."failedAttempts" <> 0 OR NEW."lockedUntil" IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM public."ExerciseOpeningOfficer" r WHERE r."id" = NEW."openingOfficerId" AND r."exerciseId" = NEW."exerciseId" AND r."personId" = NEW."personId" AND r."endedAt" IS NULL) THEN
    RAISE EXCEPTION 'INSERT of "OfficerExerciseKey" is refused: an officer key is set by the named officer on their own live roster row, on an ONLINE exercise'
      USING ERRCODE = 'PA017', HINT = 'ADR 0036 D3, 20d.';
  END IF;
  IF NEW."pepperId" IS NULL AND mode IS NOT DISTINCT FROM 'LIVE' THEN
    RAISE EXCEPTION 'INSERT of "OfficerExerciseKey" is refused: a key on a LIVE exercise is wrapped with the deployment''s pepper'
      USING ERRCODE = 'PA019', HINT = 'ADR 0036 D4, ruling 20v. A wrap without a pepper is for DEMONSTRATION only.';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public."sealed_exercise_key_insert"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  clock timestamp := public."sealed_clock"();
  closing timestamp;
  channel_pin text;
BEGIN
  SELECT e."closingAt", e."submissionChannel"::text INTO closing, channel_pin FROM public."SourcingExercise" e WHERE e."id" = NEW."exerciseId";
  IF channel_pin IS DISTINCT FROM 'ONLINE' OR NEW."retiredAt" IS NOT NULL THEN
    RAISE EXCEPTION 'INSERT of "ExerciseSealingKey" is refused: a live exercise key is made only on an ONLINE exercise'
      USING ERRCODE = 'PA017', HINT = 'ADR 0036 D3.';
  END IF;
  IF closing IS NOT NULL AND date_trunc('second', clock) > closing THEN
    RAISE EXCEPTION 'INSERT of "ExerciseSealingKey" is refused: no key is made after the closing'
      USING ERRCODE = 'PA017', HINT = 'ADR 0036 D11, rulings 11 and 20g.';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public."sealed_exercise_key_published_change"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."SourcingExercise" e WHERE e."id" = NEW."exerciseId" AND e."publishedKeyFingerprint" IS NOT NULL) THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' AND NOT EXISTS (SELECT 1 FROM public."PublishedKeyChange" c WHERE c."toKeyId" = NEW."id" AND c."insertedXact" = pg_current_xact_id()) THEN
    RAISE EXCEPTION 'INSERT of "ExerciseSealingKey" % on a published exercise is refused: a new key after publication needs a recorded key change in the same transaction', NEW."id"
      USING ERRCODE = 'PA017', HINT = 'ADR 0036 D11, rulings 20g, 20p, S10.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD."retiredAt" IS NULL AND NEW."retiredAt" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public."PublishedKeyChange" c WHERE c."fromKeyId" = NEW."id" AND c."insertedXact" = pg_current_xact_id()) THEN
      RAISE EXCEPTION 'UPDATE of "ExerciseSealingKey" % on a published exercise is refused: retiring the key after publication needs a recorded key change in the same transaction', NEW."id"
        USING ERRCODE = 'PA017', HINT = 'ADR 0036 D11, rulings 20g, 20p, S10.';
    END IF;
  END IF;
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION public."sealed_key_change_insert"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  NEW."insertedXact" := pg_current_xact_id();
  IF NOT EXISTS (SELECT 1 FROM public."ExerciseSealingKey" f, public."ExerciseSealingKey" t
                 WHERE f."id" = NEW."fromKeyId" AND t."id" = NEW."toKeyId" AND f."exerciseId" = NEW."exerciseId" AND t."exerciseId" = NEW."exerciseId"
                   AND f."fingerprint" = NEW."fromFingerprint" AND t."fingerprint" = NEW."toFingerprint") THEN
    RAISE EXCEPTION 'INSERT of "PublishedKeyChange" is refused: it names keys of another exercise, or fingerprints that are not theirs'
      USING ERRCODE = 'PA017', HINT = 'ADR 0036 D11.';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public."sealed_exercise_pins"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD."onlineSubmissionMode" IS NOT NULL AND NEW."onlineSubmissionMode" IS DISTINCT FROM OLD."onlineSubmissionMode" THEN
    RAISE EXCEPTION 'UPDATE of "SourcingExercise" % is refused: the online mode frozen at publication never changes', OLD."id"
      USING ERRCODE = 'PA023', HINT = 'ADR 0036 D1, ruling 20i. A demonstration exercise is never promoted to a real one.';
  END IF;
  IF NEW."onlineSubmissionMode" = 'LIVE' AND OLD."onlineSubmissionMode" IS NULL
     AND EXISTS (SELECT 1 FROM public."OfficerExerciseKey" k WHERE k."exerciseId" = NEW."id" AND k."retiredAt" IS NULL AND k."pepperId" IS NULL) THEN
    RAISE EXCEPTION 'UPDATE of "SourcingExercise" % is refused: it cannot be frozen LIVE while an officer key is wrapped without the pepper', OLD."id"
      USING ERRCODE = 'PA019', HINT = 'ADR 0036 D4, ruling 20v.';
  END IF;
  IF NEW."publishedKeyFingerprint" IS DISTINCT FROM OLD."publishedKeyFingerprint" THEN
    IF NEW."publishedKeyFingerprint" IS NULL THEN
      RAISE EXCEPTION 'UPDATE of "SourcingExercise" % is refused: a published fingerprint is never cleared', OLD."id"
        USING ERRCODE = 'PA017', HINT = 'ADR 0036 D3, S10.';
    END IF;
    IF OLD."publishedKeyFingerprint" IS NULL AND NOT EXISTS (SELECT 1 FROM public."ExerciseSealingKey" k WHERE k."exerciseId" = NEW."id" AND k."retiredAt" IS NULL AND k."fingerprint" = NEW."publishedKeyFingerprint") THEN
      RAISE EXCEPTION 'UPDATE of "SourcingExercise" % is refused: the fingerprint frozen at publication is the live key''s', OLD."id"
        USING ERRCODE = 'PA017', HINT = 'ADR 0036 D3, S10.';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public."sealed_fingerprint_change"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD."publishedKeyFingerprint" IS NOT NULL AND NEW."publishedKeyFingerprint" IS DISTINCT FROM OLD."publishedKeyFingerprint"
     AND NOT EXISTS (SELECT 1 FROM public."PublishedKeyChange" c WHERE c."exerciseId" = NEW."id" AND c."fromFingerprint" = OLD."publishedKeyFingerprint"
                       AND c."toFingerprint" = NEW."publishedKeyFingerprint" AND c."insertedXact" = pg_current_xact_id()) THEN
    RAISE EXCEPTION 'UPDATE of "SourcingExercise" % is refused: the published fingerprint moves only with a recorded key change in the same transaction', NEW."id"
      USING ERRCODE = 'PA017', HINT = 'ADR 0036 D11, rulings 20g, 20p, S10.';
  END IF;
  RETURN NULL;
END
$$;

-- Audit 4: how bids are submitted is frozen once the exercise is published, and the bid rules once written or published. Published reads the exercise's own
-- status (ADVERTISED or INVITED, and every state after), so the publication act writes its pins before, or with, the status move.
CREATE FUNCTION public."sealed_channel_frozen"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  published boolean := OLD."status"::text NOT IN ('DRAFT', 'DOCUMENTS_IN_PREPARATION', 'PENDING_APPROVAL_FOR_TENDERING', 'APPROVED_FOR_TENDERING');
BEGIN
  IF published AND NEW."submissionChannel" IS DISTINCT FROM OLD."submissionChannel" THEN
    RAISE EXCEPTION 'UPDATE of "SourcingExercise" % is refused: how bids are submitted is frozen at publication', OLD."id"
      USING ERRCODE = 'PA025', HINT = 'ADR 0036 D1, ruling 12e, security audit 4.';
  END IF;
  IF NEW."onlineBidRules" IS DISTINCT FROM OLD."onlineBidRules" AND (published OR OLD."onlineBidRules" IS NOT NULL) THEN
    RAISE EXCEPTION 'UPDATE of "SourcingExercise" % is refused: the bid rules are frozen once written, at publication', OLD."id"
      USING ERRCODE = 'PA025', HINT = 'ADR 0036 D7, security audit 4.';
  END IF;
  RETURN NEW;
END
$$;

-- ------------------------------------------------------------------ the price, and the deletes

CREATE OR REPLACE FUNCTION public."sealed_price_at_finalise"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD."finalisedAt" IS NULL AND NEW."finalisedAt" IS NOT NULL AND EXISTS (SELECT 1 FROM public."OpenedBid" b WHERE b."openingId" = NEW."id" AND b."priceAsRead" IS NULL) THEN
    RAISE EXCEPTION 'UPDATE of "Opening" % is refused: it is not finalised while any of its bids has no price as read', NEW."id"
      USING ERRCODE = 'PA021', HINT = 'ADR 0036 D10, ruling 20. The finalise writes the declared figures first, then finalisedAt.';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public."sealed_price_null_online_only"() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW."priceAsRead" IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public."BidEnvelope" e WHERE e."id" = NEW."envelopeId" AND e."channel" = 'ONLINE')
       OR EXISTS (SELECT 1 FROM public."Opening" o WHERE o."id" = NEW."openingId" AND o."finalisedAt" IS NOT NULL) THEN
      RAISE EXCEPTION 'A bid with no price as read is refused: only an online bid, between its unseal and the finalising, has none'
        USING ERRCODE = 'PA021', HINT = 'ADR 0036 D10, ruling 20.';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

ALTER FUNCTION public."refuse_sealed_delete"() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public."refuse_online_envelope_delete"() SET search_path = pg_catalog, public, pg_temp;

-- ------------------------------------------------------------------ every other trigger function of the repository (audit 1): bodies unchanged

ALTER FUNCTION public."certificate_signature_portal_kept"() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public."check_paid_purchase_has_sale"() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public."contractor_submission_frozen"() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public."contractor_submission_line_frozen"() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public."creditor_profile_frozen"() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public."guard_backdate_confirmation"() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public."guard_configuration_change"() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public."guard_configuration_change_insert"() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public."guard_document_purchase_change"() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public."guard_document_sale_purchase_link"() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public."guard_document_version"() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public."guard_draft_issue"() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public."guard_matrix_issue"() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public."guard_matrix_maker"() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public."guard_sign_in_event_detail"() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public."guard_supplier_account"() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public."refuse_blob_change"() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public."refuse_staff_notice_change"() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public."refuse_trail_change"() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public."registration_draft_child_frozen"() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public."registration_draft_frozen"() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public."site_diary_portal_acts_kept"() SET search_path = pg_catalog, public, pg_temp;

-- ------------------------------------------------------------------ the new triggers

CREATE CONSTRAINT TRIGGER "BidEnvelope_online_has_bid" AFTER INSERT ON "BidEnvelope" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW."channel" = 'ONLINE') EXECUTE FUNCTION public."sealed_envelope_has_bid"();
ALTER TABLE "BidEnvelope" ENABLE ALWAYS TRIGGER "BidEnvelope_online_has_bid";

CREATE CONSTRAINT TRIGGER "OnlineBid_one_standing_main_bid" AFTER INSERT OR UPDATE OF "status", "kind" ON "OnlineBid" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public."sealed_one_standing_main_bid"();
ALTER TABLE "OnlineBid" ENABLE ALWAYS TRIGGER "OnlineBid_one_standing_main_bid";

CREATE TRIGGER "Opening_sealed_xacts" BEFORE INSERT OR UPDATE ON "Opening" FOR EACH ROW EXECUTE FUNCTION public."sealed_opening_xacts"();
ALTER TABLE "Opening" ENABLE ALWAYS TRIGGER "Opening_sealed_xacts";

CREATE TRIGGER "ShareRelease_insert" BEFORE INSERT ON "ShareRelease" FOR EACH ROW EXECUTE FUNCTION public."sealed_share_release_insert"();
ALTER TABLE "ShareRelease" ENABLE ALWAYS TRIGGER "ShareRelease_insert";

CREATE TRIGGER "SourcingExercise_channel_frozen" BEFORE UPDATE OF "submissionChannel", "onlineBidRules" ON "SourcingExercise" FOR EACH ROW EXECUTE FUNCTION public."sealed_channel_frozen"();
ALTER TABLE "SourcingExercise" ENABLE ALWAYS TRIGGER "SourcingExercise_channel_frozen";
