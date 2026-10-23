import { requireStaff } from "@/app/_auth/actor";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  // While the switch is off, those who may put changes in force are told, quietly (ADR 0043 D3).
  const switchOff = actor.permissions.has("configuration.issue") && !(await twoPersonOn(db, actor.organisationId));
  return (
    <div className="min-w-0">
      {switchOff && <div className="mb-3"><Badge tone="neutral">Approval by another admin: off</Badge></div>}
      {waiting > 0 && (
        <Callout
          tone="warn"
          className="mb-5"
          title={`${waiting} ${waiting === 1 ? "change waits" : "changes wait"} for a second person. Shown is in force.`}
          action={mayReadQueue(actor.permissions) ? <ButtonLink href="/configuration/changes" variant="secondary" size="sm">See changes</ButtonLink> : undefined}
        />
      )}
      {children}
    </div>
  );
}
