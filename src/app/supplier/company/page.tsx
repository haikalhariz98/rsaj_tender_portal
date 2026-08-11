import { NotBuilt } from "@/components/not-built";

export default function SupplierCompanyPage() {
  return (
    <NotBuilt
      title="Company"
      summary="Registration details, supporting documents and standing."
      willInclude={[
        "Registration and the statutory document set: SSM, CIDB, MOF, SPAN and the rest",
        "Expiry monitoring, with reminders before a document lapses",
        "Bumiputera status and its expiry",
        "The e-payment and creditor profile used for disbursement",
        "Current standing: active, suspended or blacklisted, and what that means for eligibility",
      ]}
    />
  );
}
