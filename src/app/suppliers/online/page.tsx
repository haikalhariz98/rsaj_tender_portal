import { redirect } from "next/navigation";
import { requireStaff } from "@/app/_auth/actor";

/// The online applications are a tab of the register, not a screen of their own: this path only exists so that an application's breadcrumb has a page to link to.
export default async function OnlineApplicationsPage() {
  await requireStaff();
  redirect("/suppliers?tab=portal");
}
