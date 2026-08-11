import { NotBuilt } from "@/components/not-built";

export default function DocumentsPage() {
  return (
    <NotBuilt
      title="Documents"
      summary="Classification, retention and controlled-copy rules — what a document is, who may hold it, and how long it must survive."
      willInclude={[
        "The classification each document carries, captured once and changed only through a controlled amendment",
        "Retention periods by class, and what happens at the end of one — a record kept for audit is not a record kept for convenience",
        "Controlled copies: who is issued one, how it is recalled, and how a superseded revision is marked",
        "Access by classification, so a document's sensitivity and not its folder decides who may open it",
        "The evidentiary rules an audit trail must satisfy: append-only, attributable, and timestamped",
      ]}
    />
  );
}
