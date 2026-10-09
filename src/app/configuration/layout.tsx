import { requireStaff } from "@/app/_auth/actor";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { mayReadQueue } from "@/lib/auth/configuration-change";
import { EDIT_KINDS, editKindsReadBy } from "@/lib/auth/configuration-edit";
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
  const waiting = editKindsReadBy(actor.permissions).length > 0 ? await db.configurationChange.count({ where: { organisationId: actor.organisationId, status: "PROPOSED", kind: { in: [...EDIT_KINDS] } } }) : 0;
  return (
    <div className="min-w-0">
      {waiting > 0 && (
        <Callout
          tone="info"
          className="mb-5"
          title={`${waiting} ${waiting === 1 ? "change to configuration is" : "changes to configuration are"} waiting for a second person`}
          action={mayReadQueue(actor.permissions) ? <ButtonLink href="/configuration/changes" variant="secondary" size="sm">See what is waiting</ButtonLink> : undefined}
        >
          A save on these screens is a proposal until a second person decides it. What is shown below is what is in force now.
        </Callout>
      )}
      {children}
    </div>
  );
}
