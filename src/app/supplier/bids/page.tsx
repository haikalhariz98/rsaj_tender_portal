import { NotBuilt } from "@/components/not-built";

export default function SupplierBidsPage() {
  return (
    <NotBuilt
      title="My Bids"
      summary="Offers a supplier has prepared, submitted or withdrawn."
      willInclude={[
        "Bid preparation against the mandatory document checklist",
        "Sealed submission before the closing time, with a server-side receipt",
        "Withdrawal before the deadline",
        "Written responses to clarification requests",
        "The award or non-award outcome once the decision is taken",
      ]}
    />
  );
}
