import { requireStaff } from "@/app/_auth/actor";
import { AtOnceProvider } from "@/components/auth/actor-context";
import { MayDraft } from "@/components/setup/may-draft";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { mayReadQueue } from "@/lib/auth/configuration-change";
import { editKindsReadBy } from "@/lib/auth/configuration-edit";
import { twoPersonOn } from "@/lib/auth/policy-store";
import { db } from "@/lib/db";

/**
 * Every Configuration screen shares one frame. The section navigator is the sidebar
 * itself — it switches to Configuration's sections while you are in here — so this
 * frame adds nothing but a width that suits forms and registers, and one thing every
 * section needs said (sign-in programme Phase 5): a save here is a proposal, and what
 * is on the screen is what is in force. The page head belongs to the section, so each
 * screen states its own purpose and actions.
 */
export default async function ConfigurationLayout({ children }: LayoutProps<"/configuration">) {
  const actor = await requireStaff();
  // Read only by those who read the queue (a maker, a checker, a reader of the audit trail): the number of saves waiting for a second person.
  const readable = editKindsReadBy(actor.permissions);
  const waiting = readable.length > 0 ? await db.configurationChange.count({ where: { organisationId: actor.organisationId, status: "PROPOSED", kind: { in: readable } } }) : 0;
  const atOnce = !(await twoPersonOn(db, actor.organisationId));
  // Those who decide queued changes (configuration.issue) keep their buttons too; only a viewer who can neither draft nor decide loses Edit.
  const mayDraft = actor.isAdministrator || actor.permissions.has("configuration.draft") || actor.permissions.has("configuration.issue");
  return (
    <AtOnceProvider atOnce={atOnce}>
    <MayDraft allowed={mayDraft}>
      <div className="min-w-0">
        {waiting > 0 && (
          <Callout
            tone="warn"
            className="mb-5"
            title={`${waiting} ${waiting === 1 ? "change waits" : "changes wait"} for a second person. Shown is in force.`}
            action={mayReadQueue(actor.permissions) ? <ButtonLink href="/approvals?tab=changes" variant="secondary" size="sm">See changes</ButtonLink> : undefined}
          />
        )}
        {children}
      </div>
    </MayDraft>
    </AtOnceProvider>
  );
}
