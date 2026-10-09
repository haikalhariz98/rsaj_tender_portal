import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";

/**
 * What a supplier sees when a page that logs an inspection was reached from another site (Phase 4d). Nothing was read and nothing was logged; the way back is its own list.
 */
export function CrossSiteRefusal({ headline, detail }: { headline: string; detail: string }) {
  return (
    <>
      <PageHeader title="Tender documents" subtitle="Open it from My Bids" />
      <Card>
        <EmptyState title={headline} action={<ButtonLink href="/supplier/bids" variant="secondary" size="sm">Go to My Bids</ButtonLink>}>{detail}</EmptyState>
      </Card>
    </>
  );
}
