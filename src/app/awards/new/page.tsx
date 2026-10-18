import { redirect } from "next/navigation";

import { requireStaff } from "@/app/_auth/actor";
import { keepQuery } from "@/lib/contract/links";

export const dynamic = "force-dynamic";

/// An award is started at `/projects/new` now (AC-19); an old link here carries its query across.
export default async function OldNewAwardPage(props: PageProps<"/awards/new">) {
  await requireStaff();
  redirect(`/projects/new${keepQuery(await props.searchParams)}`);
}
