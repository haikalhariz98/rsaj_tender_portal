import { NotBuilt } from "@/components/not-built";

export default function SupplierHomePage() {
  return (
    <NotBuilt
      title="Supplier portal"
      summary="Opportunities, bids and contracts for a registered supplier."
      willInclude={[
        "Open opportunities they are eligible for, filtered by their grade and field code",
        "Their bids: documents purchased, briefings attended, addenda acknowledged, offers submitted",
        "Their contracts: progress, certificates issued and payments made",
        "Their company: registration, statutory documents and renewal reminders",
      ]}
    />
  );
}
