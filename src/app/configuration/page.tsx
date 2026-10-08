import { redirect } from "next/navigation";
import { requireStaff } from "@/app/_auth/actor";

/// Configuration opens on Organisation, which everything else hangs from (founder, 2026-10-08); the rail is the index. This stays a page, not a
/// config redirect, because the "Configuration" crumb must point at a page that exists.
export default async function ConfigurationPage() {
  await requireStaff();
  redirect("/configuration/organisation");
}
