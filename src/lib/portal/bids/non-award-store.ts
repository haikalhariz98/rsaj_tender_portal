import type { Tx } from "@/lib/audit/record";
import { storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import type { Provenance } from "@/lib/window/types";

import { awardStands, carriesReason, nonAwardSetting, nonAwardSettingWords, unsuccessfulPartyIds, type NonAwardPolicy, type NonAwardSetting } from "./non-award";

/**
 * What the award page shows of the notices of non-award (FR-AWD-010, policy D7, Phase 4d), and the policy they are issued under. Reads only. The tenderers are the parties named on the exercise's opened bids,
 * other than the awardee; each is shown with whether a notice was issued, and whether the portal can show it (it can only to a tenderer the office has linked to a supplier's register entry).
 */

export async function loadNonAwardPolicy(client: Tx, organisationId: string): Promise<NonAwardPolicy & { provenance: Provenance | null }> {
  const p = await client.awardPolicy.findUnique({ where: { organisationId }, select: { nonAwardNotices: true, debriefIncludesReason: true, nonAwardProvenance: true } });
  return { nonAwardNotices: p?.nonAwardNotices ?? null, debriefIncludesReason: p?.debriefIncludesReason ?? null, provenance: (p?.nonAwardProvenance as Provenance | null) ?? null };
}

export interface NonAwardRow {
  partyId: string;
  name: string;
  /// The register supplier the tenderer is linked to, or null: then the portal cannot show it the notice.
  supplier: string | null;
  notice: { id: string; issuedOn: string; reasonText: string; issuedBy: string } | null;
}

export interface NonAwardPanel {
  setting: NonAwardSetting;
  words: string;
  carriesReason: boolean;
  provenance: Provenance | null;
  /// The award stands as issued, so tenderers can be told apart.
  awardStands: boolean;
  awardeeNamed: boolean;
  rows: NonAwardRow[];
}

export async function loadNonAwardPanel(client: Tx, organisationId: string, award: { id: string; exerciseId: string; status: string; awardeePartyId: string | null }): Promise<NonAwardPanel> {
  const policy = await loadNonAwardPolicy(client, organisationId);
  const base = { setting: nonAwardSetting(policy), words: nonAwardSettingWords(policy), carriesReason: carriesReason(policy), provenance: policy.provenance, awardStands: awardStands(award.status), awardeeNamed: award.awardeePartyId != null };
  if (!base.awardStands) return { ...base, rows: [] };
  const bids = await client.openedBid.findMany({ where: { exerciseId: award.exerciseId, organisationId }, select: { partyId: true } });
  const ids = unsuccessfulPartyIds(bids, award.awardeePartyId);
  if (ids.length === 0) return { ...base, rows: [] };
  const [parties, notices] = await Promise.all([
    client.exerciseParty.findMany({ where: { id: { in: ids }, organisationId }, select: { id: true, name: true, vendor: { select: { reference: true, registeredName: true } } }, orderBy: { name: "asc" } }),
    client.nonAwardNotice.findMany({ where: { awardId: award.id, exerciseId: award.exerciseId, organisationId, partyId: { in: ids } }, select: { id: true, partyId: true, issuedOn: true, reasonText: true, issuedBy: { select: { name: true } } } }),
  ]);
  return {
    ...base,
    rows: parties.map((p) => {
      const n = notices.find((x) => x.partyId === p.id) ?? null;
      return { partyId: p.id, name: p.name, supplier: p.vendor ? `${p.vendor.reference} · ${p.vendor.registeredName}` : null, notice: n ? { id: n.id, issuedOn: formatDate(storedDay(n.issuedOn)), reasonText: n.reasonText, issuedBy: n.issuedBy.name } : null };
    }),
  };
}
