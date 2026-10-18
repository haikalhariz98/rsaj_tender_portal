import { redirect } from "next/navigation";

import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";

/// The Awards list is the Contracts list now: every award is a case there, from the day it is started (AC-17). Kept for old links.
export default async function OldAwardsPage() {
  await requireStaff();
  redirect("/projects");
}
