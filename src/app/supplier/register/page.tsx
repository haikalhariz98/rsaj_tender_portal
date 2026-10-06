import { NotBuilt } from "@/components/not-built";
import { BACK_TO_PORTAL, PORTAL_PATH } from "@/lib/portal/labels";

export default function SupplierRegisterPage() {
  return (
    <NotBuilt
      title="Register as a supplier"
      summary="Apply to join the supplier register."
      willInclude={[
        "A form for a new supplier: the company, its registration and a contact",
        "A reference number to quote, once the application is sent",
        "The application joins the procurement office's review queue",
      ]}
      back={{ href: PORTAL_PATH.home, label: BACK_TO_PORTAL.en }}
    />
  );
}
