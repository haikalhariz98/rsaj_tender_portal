import { redirect } from "next/navigation";

/// Configuration always opens on a section; the rail is the index.
export default function ConfigurationPage() {
  redirect("/configuration/approval-matrix");
}
