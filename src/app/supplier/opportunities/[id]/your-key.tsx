import { ShieldIcon } from "@/components/icons";
import { DataList } from "@/components/data-list";
import { Bi } from "@/components/ui/bilingual";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { SCREEN_WORDS } from "@/lib/bids/online/screen-words";
import { stampText } from "@/lib/bids/online/stamp-text";
import { loadBidContext } from "@/lib/portal/bids/context-store";
import { loadKeyHistory } from "@/lib/sealing/key-history";

import { currentSupplierOrNull } from "../../../_auth/supplier";

const both = (x: { en: string }) => x.en;

/**
 * The sealing key of an online exercise and the history of its fingerprint, for a signed-in supplier who may see the exercise (SR-13, ADR 0036 D11; build plan step 11, moved from step 8).
 * It sits beside the fingerprint printed on every receipt: a supplier compares the two. It lists when the key changed and the two fingerprints, and never why or by whom. Someone not
 * signed in, or a supplier who may not see the exercise, sees nothing here. Another exercise's history is never read: `loadKeyHistory` asks the same question the exercise page asks.
 */
export async function YourKey({ exerciseId }: { exerciseId: string }) {
  const actor = await currentSupplierOrNull();
  if (!actor) return null;
  const history = await loadKeyHistory(db, actor, exerciseId);
  if (!history) return null;
  const ctx = await loadBidContext(db, actor, exerciseId);
  const tz = ctx?.org.timeZone ?? null;
  return (
    <Card className="mb-6">
      <CardHeader icon={<ShieldIcon size={17} />} title={<Bi words={SCREEN_WORDS.keyTitle} inline />} subtitle={<Bi words={SCREEN_WORDS.keySubtitle} inline />} />
      <CardBody className="flex flex-col gap-4">
        <p className="text-[13.5px] text-ink-2">
          {history.fingerprint ? (
            <>
              <Bi words={SCREEN_WORDS.keyLive} inline />: <span className="font-mono break-all">{history.fingerprint}</span>
            </>
          ) : (
            <Bi words={SCREEN_WORDS.keyNone} />
          )}
        </p>
        <p className="text-[12.5px] font-semibold text-ink-2"><Bi words={SCREEN_WORDS.keyHistory} inline /></p>
        <div className="overflow-hidden rounded-2xl border border-line">
          <DataList
            flat
            selectable={false}
            searchable={false}
            toolbar={false}
            exportName="sealing-key-changes"
            emptyTitle={both(SCREEN_WORDS.keyNoChanges)}
            columns={[
              { key: "at", label: both(SCREEN_WORDS.keyWhen), width: "230px", mobile: "primary" },
              { key: "from", label: both(SCREEN_WORDS.keyFrom), mobile: "meta" },
              { key: "to", label: both(SCREEN_WORDS.keyTo), mobile: "meta" },
            ]}
            rows={history.changes.map((c) => ({
              id: c.id,
              search: `${c.fromFingerprint} ${c.toFingerprint}`,
              cells: {
                at: { kind: "text", text: stampText(c.at, tz) },
                from: { kind: "text", text: c.fromFingerprint, dim: true },
                to: { kind: "text", text: c.toFingerprint, dim: true },
              },
            }))}
          />
        </div>
      </CardBody>
    </Card>
  );
}
