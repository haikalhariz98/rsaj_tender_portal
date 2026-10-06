import { redirect } from "next/navigation";

/// The online applications are a tab of the register, not a screen of their own: this path only exists so that an application's breadcrumb has a page to link to.
export default function OnlineApplicationsPage() {
  redirect("/suppliers?tab=portal");
}
