import { redirect } from "next/navigation";

/**
 * The Securities menu is gone (MN-01, AC-15). The old address lands on the Contracts list's "Securities expiring or not
 * verified" view, which carries its own guard. A temporary redirect (F-2): the target moves when the Contracts list does.
 */
export default function SecuritiesPage() {
  redirect("/projects?view=securities");
}
