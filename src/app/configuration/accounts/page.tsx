import { redirect } from "next/navigation";

import { requireStaff } from "@/app/_auth/actor";

/// Sign-in accounts live in the People list now (simplification 5.3); the old address still works.
export default async function AccountsPage() {
  await requireStaff();
  redirect("/configuration/users?tab=people");
}
