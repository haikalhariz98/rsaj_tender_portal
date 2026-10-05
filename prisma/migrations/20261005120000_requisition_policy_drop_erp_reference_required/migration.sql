-- Founder, 2026-10-05: the customer does not use the finance system's requisition and note
-- numbers. The act that recorded them and the setting that could make registration wait for
-- them are removed, and registration no longer reads this column. Dropping it loses only the
-- setting's own value (yes, no or not set). Numbers already on requisitions stay
-- (Requisition.erpRequisitionNo and erpNoteNo are untouched).

-- AlterTable
ALTER TABLE "RequisitionPolicy" DROP COLUMN "erpReferenceRequired";