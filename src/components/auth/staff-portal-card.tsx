import { ExternalLinkIcon, GlobeIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { publicPortalHref, SET_PORTAL_HREF } from "@/lib/organisation/portal-page";

/**
 * What the officers' copy shows in place of a supplier's form (design note 0006, section 3.4): suppliers sign in on the public portal, and a link to the same
 * page there. A link, never a sign-in, so nothing here can sign a supplier in. With no public address configured it says so, and who can set it: a person who
 * may propose configuration gets the way there, anyone else is told who to ask.
 */
export function StaffPortalCard({ path, address, canSet }: { path: string; address: string | null; canSet: boolean }) {
  const href = publicPortalHref(address, path);
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-700">
        <GlobeIcon size={24} />
      </span>
      <h1 className="text-[22px] leading-tight font-extrabold tracking-[-0.01em] text-ink">Suppliers use the public portal</h1>
      {href ? (
        <ButtonLink href={href} target="_blank" rel="noopener noreferrer" variant="primary" size="lg" block icon={<ExternalLinkIcon size={18} />}>
          Open supplier portal
          <span className="sr-only"> (opens in a new tab)</span>
        </ButtonLink>
      ) : (
        <>
          <p className="text-[14px] text-ink-2">Public portal address not set.</p>
          {canSet ? (
            <ButtonLink href={SET_PORTAL_HREF} variant="link">
              Set it
            </ButtonLink>
          ) : (
            <p className="text-[13.5px] text-ink-2">An administrator sets it in Configuration.</p>
          )}
        </>
      )}
    </div>
  );
}
