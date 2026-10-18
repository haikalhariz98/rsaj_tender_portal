import { notFound, redirect } from "next/navigation";

import { oldAwardTarget } from "@/app/_auth/case";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";

/**
 * An old award address, kept for good because `StaffNotice` rows hold it (AC-23). The award is the first stage of a case now
 * (`/projects/{id}`): `oldAwardTarget` guards exactly as the award page did (a restricted exercise reads as gone, before and after
 * issue, and the attempt is logged), then maps `?tab=`. The redirect is temporary, because the target depends on the record's state.
 */
export default async function AwardPage(props: PageProps<"/awards/[id]">) {
  const actor = await requireStaff();
  const [{ id }, { tab }] = await Promise.all([props.params, props.searchParams]);
  const target = await oldAwardTarget(actor, id, typeof tab === "string" ? tab : undefined);
  if (target.kind === "NOT_FOUND") notFound();
  redirect(target.href);
}
