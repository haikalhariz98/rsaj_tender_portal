import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import type { StaffActor } from "@/lib/auth/types";
import { dayOf } from "@/lib/dates";
import { db } from "@/lib/db";
import { loadReviewQueue, reviewCounts } from "@/lib/portal/projects/review-store";

import { SubmissionsPanel } from "./submissions-panel";

/**
 * "Submissions waiting" (FR-SUP-006, 009; AC-16): contractors' submissions across the organisation, as a view of the Contracts list. The bridge for the old Documents menu's review
 * queue, and so for the notices that still link to it. Not filtered by restricted exercise (AC-18, AC-19): the officer who answers is often not named on the exercise.
 */
export async function SubmissionsView({ actor, waiting, answered }: { actor: StaffActor; waiting: string | undefined; answered: string | undefined }) {
  const org = await db.organisation.findUnique({ where: { id: actor.organisationId }, select: { timeZone: true } });
  const today = org?.timeZone ? dayOf(new Date(), org.timeZone) : null;
  const [review, counts] = await Promise.all([loadReviewQueue(db, actor.organisationId, today, { waiting, answered }), reviewCounts(db, actor.organisationId, today)]);
  const href = (w: number, a: number) => {
    const q = new URLSearchParams({ view: "submissions", ...(w ? { waiting: String(w) } : {}), ...(a ? { answered: String(a) } : {}) });
    return `/projects?${q.toString()}`;
  };
  return (
    <>
      <PageHeader
        title="Contracts"
        subtitle="Contracts after award: formed, signed, stamped and distributed, on a fixed baseline."
        meta={[`${counts.waiting} submissions waiting`, today ? `${counts.overdue} past the due day` : "Overdue not judged: the time zone is not set", `${counts.answered} answered`]}
        actions={<ButtonLink href="/projects" size="sm" variant="secondary">All contracts</ButtonLink>}
      />
      {!today && (
        <Callout tone="warn" className="mb-6" title="Overdue is not judged">
          The organisation&apos;s time zone is not set, so no submission is called overdue. Set it under Configuration, Organisation.
        </Callout>
      )}
      <SubmissionsPanel review={review} judged={!!today} hrefOf={href} withContract />
    </>
  );
}
