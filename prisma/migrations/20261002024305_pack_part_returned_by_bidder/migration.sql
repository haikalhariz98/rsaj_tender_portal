-- AlterTable
ALTER TABLE "TenderDocumentPart" ADD COLUMN     "returnedByBidder" BOOLEAN,
ADD COLUMN     "returnedByBidderProvenance" "Provenance";

-- AlterTable
ALTER TABLE "TenderPackPart" ADD COLUMN     "returnedByBidder" BOOLEAN,
ADD COLUMN     "returnedByBidderProvenance" "Provenance";
