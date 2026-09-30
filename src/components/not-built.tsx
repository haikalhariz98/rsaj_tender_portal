import { SparkleIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
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
}: {
  title: string;
  summary: string;
  willInclude: string[];
}) {
  return (
    <>
      <PageHeader
        title={title}
        badge={
          <Badge tone="warn" dot>
            Not built yet
          </Badge>
        }
        subtitle={summary}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <EmptyState
            icon={<SparkleIcon size={24} />}
            title="This module has not been built"
            action={
              <ButtonLink href="/" size="sm">
                Back to the dashboard
              </ButtonLink>
            }
          >
            It is in the plan and it is in the navigation, so the shape of the portal is visible.
            Nothing here is working yet.
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
