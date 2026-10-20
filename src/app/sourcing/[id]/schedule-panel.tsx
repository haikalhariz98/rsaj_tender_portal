import { FileIcon } from "@/components/icons";
import { OwnerAttachments } from "@/components/attachments/owner-attachments";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";

/**
 * "Schedule of tenders for Results" on the exercise's Award tab (go-live R4, founder 2026-10-20): the officer uploads the schedule that marks which tender won, and it is
 * published on the public Results page. A document of the store, kept on the exercise as PUBLISHED_SCHEDULE: upload, replace (a new version) and withdraw (with a reason) are the store's own
 * audited acts, which judge the exercise again under its lock: advertised, not confidential, opening finalised, award issued. The file must be Public, and a classification is
 * never lowered, so only Public classes are offered. With no Public class there is nothing to offer, and the card says so.
 */
export async function SchedulePanel({ actor, exerciseId }: { actor: Pick<StaffActor, "organisationId">; exerciseId: string }) {
  const publicClasses = await db.documentClass.count({ where: { organisationId: actor.organisationId, classification: "PUBLIC" } });
  if (publicClasses === 0) {
    return (
      <Card>
        <CardHeader icon={<FileIcon size={17} />} title="Schedule of tenders for Results" subtitle="Public" />
        <div className="px-5 pb-5 sm:px-6">
          <Callout tone="warn" title="Public class not set" action={<ButtonLink href="/configuration/documents" size="sm" variant="secondary">Set classes</ButtonLink>}>
            No document class is Public. An administrator adds one under Documents.
          </Callout>
        </div>
      </Card>
    );
  }
  return (
    <OwnerAttachments
      owner={{ kind: "exercise", id: exerciseId }}
      only={["PUBLISHED_SCHEDULE"]}
      title="Schedule of tenders for Results"
      subtitle="Public. Shown on Results with the day it was published."
      classifiedAs="PUBLIC"
      statuses={{ PUBLISHED_SCHEDULE: { text: "Not published", tone: "neutral" } }}
    />
  );
}
