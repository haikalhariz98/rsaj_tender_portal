import { redirect } from "next/navigation";
import { requireStaff } from "@/app/_auth/actor";

/// Configuration always opens on a section; the rail is the index.
export default async function ConfigurationPage() {
  await requireStaff();
  redirect("/configuration/approval-matrix");
}
