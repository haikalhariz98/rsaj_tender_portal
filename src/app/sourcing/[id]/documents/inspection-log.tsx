import { EyeIcon } from "@/components/icons";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { db } from "@/lib/db";
import { exerciseOrg } from "@/lib/method/repo";
import { inspectionLogOf } from "@/lib/portal/bids/staff-read";

/**
 * The inspection log of the Tender Table Document (FR-DOC-010, Phase 4d): who opened it, or the documents released to them, from a supplier portal account, and when. It is the portal's own record, written
 * before anything was shown, and nobody can change it. It holds suppliers' openings only: an officer's print is not a supplier's inspection, and a visit to the tender table is not logged here.
 */
export async function InspectionLogCard({ organisationId, exerciseId }: { organisationId: string; exerciseId: string }) {
  const window = await db.exerciseWindow.findUnique({ where: { exerciseId, organisationId }, select: { id: true } });
  if (!window) return null;
  const org = await exerciseOrg(organisationId);
  const log = await inspectionLogOf(db, organisationId, window.id, org?.timeZone ?? null);
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<EyeIcon size={17} />}
        title="Inspection log"
        subtitle={log.total === 0 ? "Nobody has opened the Tender Table Document from a supplier portal account." : `${log.total} ${log.total === 1 ? "opening" : "openings"} by ${log.suppliers} ${log.suppliers === 1 ? "supplier" : "suppliers"}${log.total > log.rows.length ? `. The latest ${log.rows.length} are shown.` : "."}`}
        divided={log.rows.length > 0}
      />
      {log.rows.length > 0 && (
        <ul className="divide-y divide-line/70">
          {log.rows.map((r, i) => (
            <li key={`${r.at}-${i}`} className="flex flex-col gap-0.5 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <span className="font-semibold break-words text-ink">{r.supplier}</span>
              <span className="text-[12.5px] text-ink-3">{r.kind}, version {r.version} · {r.at}</span>
            </li>
          ))}
        </ul>
      )}
      {log.total === 0 && (
        <div className="px-5 pb-5 sm:px-6">
          <Callout tone="neutral">The log fills once the exercise is published and a supplier opens the Tender Table Document from its portal account.</Callout>
        </div>
      )}
    </Card>
  );
}
