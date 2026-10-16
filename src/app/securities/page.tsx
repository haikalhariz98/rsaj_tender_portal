import { redirect } from "next/navigation";

import { requireStaff } from "@/app/_auth/actor";

/**
 * The Securities menu is gone (MN-01, AC-15). The old address lands on the Contracts list's "Securities expiring or not
 * verified" view, which carries its own guard. A temporary redirect (F-2): the target moves when the Contracts list does.
 * The old `?view=expiring|unverified|all` and `?page=n` carry over (C-6: old links keep working), only the known values, never a path from the request.
 */
const OLD_VIEWS = ["expiring", "unverified", "all"] as const;

export default async function SecuritiesPage(props: PageProps<"/securities">) {
  await requireStaff();
  const { view, page } = (await props.searchParams) as { view?: string | string[]; page?: string | string[] };
  const q = new URLSearchParams({ view: "securities" });
  const v = OLD_VIEWS.find((x) => x === view);
  if (v) q.set("sv", v);
  const n = typeof page === "string" && /^\d{1,6}$/.test(page) ? Number(page) : 0;
  if (n > 0) q.set("page", String(n));
  redirect(`/projects?${q.toString()}`);
}
