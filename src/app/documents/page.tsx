import { permanentRedirect } from "next/navigation";

import { requireStaff } from "@/app/_auth/actor";

/**
 * The Documents menu is gone (MN-02, AC-16). Only this page went; the document store's actions, `review-actions.ts` and `review-editors.tsx` stay, because every attachment panel and the
 * Submissions views use them. Stored notices link here and cannot be changed, so the address redirects permanently and reads no data (it asks who is signed in first, as every page does):
 * `?tab=review` lands on the Contracts list's "Submissions waiting" view, anything else on the Contracts list. The Contracts list's own sign-in and staff guard run on the target.
 * The Library, Distribution and Routing sheets tabs are not carried: the organisation-wide Library search is dropped (AC-16), and a contract's copies and routing sheets are counted on its Documents tab.
 */
export default async function DocumentsPage(props: PageProps<"/documents">) {
  await requireStaff();
  const { tab } = (await props.searchParams) as { tab?: string | string[] };
  permanentRedirect(tab === "review" ? "/projects?view=submissions" : "/projects");
}
