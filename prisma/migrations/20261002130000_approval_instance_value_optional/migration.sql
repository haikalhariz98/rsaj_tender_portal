-- 6.15 OD-2 A (against accepted 6.9): a supplier matter is routed with no value. The column stays
-- written by every existing writer; null means "not routed on a value", never zero.
ALTER TABLE "ApprovalInstance" ALTER COLUMN "value" DROP NOT NULL;
