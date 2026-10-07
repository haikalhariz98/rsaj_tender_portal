import { requireStaff } from "@/app/_auth/actor";
import { loadAttributions } from "@/lib/auth/attribution-read";
import { db } from "@/lib/db";

/**
 * Who did an act, in words, read from its attribution (ADR 0034 D12, Phase 2b). The one place a screen says whether an act was signed, recorded from paper, made
 * before sign-in or is missing its attribution: a screen that wrote "recorded on behalf of, not signed" beside a name would say it of every act, and it is
 * true of some.
 *
 *   <ActedBy entity="Award" id={award.id} slot="signatoryPerson" name={award.signatoryName} />
 *
 * A server component that reads the one act's attribution itself, for a screen that shows a few; a list reads them in one batch with `loadAttributions`.
 * An act missing its attribution reads in the warning colour, so it is seen.
 */
export async function ActedBy({ entity, id, slot, name }: { entity: string; id: string; slot: string; name: string | null | undefined }) {
  const actor = await requireStaff();
  const index = await loadAttributions(db, actor.organisationId, [{ entity, slot, ids: [id] }]);
  const read = index.read({ entity, id, slot }, name);
  return <span className={read.state === "MISSING" ? "text-amber-800" : undefined}>{read.en}</span>;
}
