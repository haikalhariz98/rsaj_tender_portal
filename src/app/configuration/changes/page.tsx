import { redirect } from "next/navigation";

import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";

/// The queue is a tab of My approvals now (plan 5.7); the old address, and every link and bookmark to it, lands there.
export default async function ChangesPage() {
  await requireStaff();
  redirect("/approvals?tab=changes");
}
