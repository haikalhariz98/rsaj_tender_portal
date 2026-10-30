"use client";

import { addTeamMemberAction, changeProjectManagerAction, removeTeamMemberAction, type TeamResult } from "@/app/projects/[id]/team-actions";
import { RecordEditor, type FormState, type SaveAction } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";

/**
 * The Project team card's drawers (workspace 3b step 5, L1; WB-7): name someone in a role, take someone out with a reason, change the Project manager. Each posts to
 * `team-actions.ts`, which judges again under the contract's lock; nothing here knows who may. The person pickers are dropdowns of the organisation's active people.
 */

type Option = { value: string; label: string };
const toState = (r: TeamResult): FormState => (r.refused ? { ok: false, message: r.refused } : { ok: true });
const post = (act: (data: FormData) => Promise<TeamResult>): SaveAction => async (_prev, data) => toState(await act(data));

export function AddTeamMember({ contractId, roles, people }: { contractId: string; roles: Option[]; people: Option[] }) {
  return (
    <RecordEditor
      title="Add to the team"
      fields={[
        { kind: "hidden", name: "contractId" },
        { kind: "select", name: "role", label: "Role", required: true, placeholder: "Choose a role", options: roles },
        { kind: "select", name: "personId", label: "Person", required: true, placeholder: "Choose a person", options: people },
      ]}
      values={{ contractId }}
      action={post(addTeamMemberAction)}
      submitLabel="Add"
      trigger={{ label: "Add", icon: true, className: buttonClass("secondary", "sm") }}
      size="sm"
    />
  );
}

export function ChangeManager({ contractId, people, currentId }: { contractId: string; people: Option[]; currentId: string }) {
  return (
    <RecordEditor
      title="Change the Project manager"
      fields={[
        { kind: "hidden", name: "contractId" },
        { kind: "select", name: "personId", label: "New manager", required: true, placeholder: "Choose a person", options: people.filter((p) => p.value !== currentId) },
      ]}
      values={{ contractId }}
      action={post(changeProjectManagerAction)}
      submitLabel="Change"
      trigger={{ label: "Change", className: buttonClass("ghost", "sm"), ariaLabel: "Change the Project manager" }}
      size="sm"
    />
  );
}

export function RemoveTeamMember({ contractId, role, roleLabel, personId, name }: { contractId: string; role: string; roleLabel: string; personId: string; name: string }) {
  return (
    <RecordEditor
      title={`Remove ${name} as ${roleLabel}?`}
      description="They stay on record in the history."
      fields={[
        { kind: "hidden", name: "contractId" },
        { kind: "hidden", name: "role" },
        { kind: "hidden", name: "personId" },
      ]}
      values={{ contractId, role, personId }}
      destructive={{ reasonLabel: "Reason" }}
      action={post(removeTeamMemberAction)}
      submitLabel="Remove"
      cancelLabel="Keep them"
      trigger={{ label: "Remove", className: buttonClass("ghost", "sm"), ariaLabel: `Remove ${name} as ${roleLabel}` }}
      size="sm"
    />
  );
}
