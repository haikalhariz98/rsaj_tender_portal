import type { ReactNode } from "react";

import { SparkleIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";

/**
 * A module that is agreed but not yet built.
 *
 * It appears in the navigation because the shape of the portal is settled and hiding
 * it would misrepresent the plan. It says plainly that it is not here yet, because a
 * screen that looks finished and does nothing is worse than an empty one.
 */
export function NotBuilt({
  title,
  summary,
  willInclude,
  note,
  badgeLabel = "Not built yet",
  back = { href: "/", label: "Back to the dashboard" },
  reason = {
    title: "This module has not been built",
    text: "It is in the plan and it is in the navigation, so the shape of the portal is visible. Nothing here is working yet.",
  },
}: {
  title: string;
  summary: string;
  willInclude: string[];
  /// What a reader can do today instead, said above the plan (a link to where it lives now).
  note?: ReactNode;
  /// The badge beside the title, where "Not built yet" is not the whole story (a part that waits for sign-in).
  badgeLabel?: string;
  /// Where the way out leads. The dashboard for staff screens; the portal's home for the supplier side.
  back?: { href: string; label: string };
  /// What the empty card says: why nothing is here.
  reason?: { title: string; text: string };
}) {
  return (
    <>
      <PageHeader
        title={title}
        badge={
          <Badge tone="warn" dot>
            {badgeLabel}
          </Badge>
        }
        subtitle={summary}
      />

      {note && <Callout tone="info" className="mb-6">{note}</Callout>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <EmptyState
            icon={<SparkleIcon size={24} />}
            title={reason.title}
            action={
              <ButtonLink href={back.href} size="sm">
                {back.label}
              </ButtonLink>
            }
          >
            {reason.text}
          </EmptyState>
        </Card>

        <Card>
          <CardHeader title="What it will hold" />
          <CardBody>
            <ul className="flex flex-col gap-2.5">
              {willInclude.map((line) => (
                <li key={line} className="flex items-start gap-3 text-[14px] text-ink-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-500" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
