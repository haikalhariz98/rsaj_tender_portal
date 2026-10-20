import type { FormPurpose } from "@/lib/auth/form-token";
import { loadPortalBranding, type PortalBranding } from "@/lib/organisation/portal-load";
import { loadSupplierAuthPage } from "@/lib/portal/supplier-auth-page";
import type { ClosedWords } from "@/lib/auth/supplier-closed";

/**
 * What the supplier portal's sign-in, activation and reset pages need to draw the front door (design note 0006): the form's state from `loadSupplierAuthPage`
 * (why it is closed, or the signed token), and the organisation's picture and words, which never close the form. On the officers' copy `publicCopy` is false and
 * the page draws the card that points to the public portal instead of any form, so `token` is only ever issued where the form is drawn.
 */
export async function loadSupplierDoor(purpose: FormPurpose): Promise<{ closed: ClosedWords | null; token: string | null; publicCopy: boolean; branding: PortalBranding }> {
  const { organisationId, ...auth } = await loadSupplierAuthPage(purpose);
  const branding = await loadPortalBranding(organisationId);
  return { ...auth, branding };
}
