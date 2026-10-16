import { ShieldIcon } from "@/components/icons";
import { DataList } from "@/components/data-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { KeyValues } from "@/components/ui/stat";
import { loadSecurityPolicy } from "@/lib/auth/policy-store";
import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { sealingPepper } from "@/lib/integration/sealing-deployment";
import { KEY_CHANGE_ORDER } from "@/lib/sealing/key-history";
import { formatOrgDateTime } from "@/lib/format";
import type { ExerciseRow, ExerciseOrg } from "@/lib/method/repo";
import { publishSealingWords } from "@/lib/sealing/ceremony";
import { REKEY_WORDS, rekeyRefusals, SHARE_WORDS, shareFaults } from "@/lib/sealing/share";
import { loadCeremony } from "@/lib/sealing/store";
import { AMBIGUOUS_SUBSTITUTION_WORDS, pendingSubstitutionWords, SUBSTITUTION_WORDS } from "@/lib/sealing/substitution";
import { loadPendingSubstitution } from "@/lib/sealing/substitution-store";
import { rosterChange } from "@/lib/opening/roster";

import { ChangeKeyDrawer, CheckUnlockDrawer, ReleaseShareDrawer, SetShareDrawer } from "./key-editors";

/**
 * The sealing key of an online exercise, under Opening officers on Scope and estimate (ADR 0036 D3, D4, D11): who has set their share, whether the key is made, the
 * fingerprint it was published with and every change of it. It states that every named officer is needed (ruling 20k) and that a forgotten passphrase cannot be recovered.
 * Each control is offered by the same pure rule the action runs.
 */
export async function KeySection({ ex, org, actor }: { ex: ExerciseRow; org: ExerciseOrg; actor: StaffActor }) {
  if (ex.submissionChannel !== "ONLINE" || !ex.openingRosterRequired) return null;
  const facts = await loadCeremony(db, org.id, ex.id);
  const policy = await loadSecurityPolicy(db, org.id);
  const minLength = policy?.sealingPassphraseMinLength ?? null;
  const changes = await db.publishedKeyChange.findMany({ where: { exerciseId: ex.id, organisationId: org.id }, orderBy: [...KEY_CHANGE_ORDER], include: { by: { select: { name: true } } } });
  const now = new Date();
  const mine = facts.roster.find((r) => r.personId === actor.personId) ?? null;
  // Under LIVE, a share wrapped under a pepper this copy no longer holds could not be opened at the unseal: said here as well as at publication.
  const sealingMode = (await db.bidSealingPolicy.findUnique({ where: { organisationId: org.id }, select: { onlineSubmission: true } }))?.onlineSubmission ?? null;
  const reading = sealingPepper();
  const pepperChangedFor = sealingMode === "LIVE" && reading.status === "SET" ? facts.officerKeys.filter((k) => k.pepperId !== reading.pepper.id).map((k) => facts.roster.find((r) => r.id === k.openingOfficerId)?.name ?? "an officer") : [];
  const hasShare = !!mine && facts.shareHolderRowIds.includes(mine.id);

  // A substitution waiting (step 17): the incoming officer may set their share, the departing officer releases theirs, and past the closing the screen says re-tender.
  const { pending } = facts.published ? await loadPendingSubstitution(db, org.id, ex.id) : { pending: { state: "NONE" as const } };
  const incomingOfSubstitution = pending.state === "PENDING" && !!mine && pending.incoming.rosterRowId === mine.id;
  const departingIsMe = pending.state === "PENDING" && pending.departing.personId === actor.personId;
  const afterClosing = rosterChange({ status: ex.status, closing: ex.closingAt, now, openingStarted: (await db.opening.count({ where: { exerciseId: ex.id } })) > 0 });
  const share = shareFaults({ channel: ex.submissionChannel, status: ex.status, namedOfficer: !!mine, now, closing: ex.closingAt, published: facts.published, hasLiveShare: hasShare, submissions: facts.submissions, substitutionIncoming: incomingOfSubstitution });
  const shareAllowed = share.length ? { allowed: false as const, reason: SHARE_WORDS[share[0]] } : { allowed: true as const };
  const rekey = rekeyRefusals({ channel: ex.submissionChannel, status: ex.status, published: facts.published, namedOfficer: !!mine, reason: "x", hasLiveKey: !!facts.liveKey, officers: facts.roster.length, stale: facts.state.stale, submissions: facts.submissions, now, closing: ex.closingAt });
  const rekeyAllowed = rekey.length ? { allowed: false as const, reason: REKEY_WORDS[rekey[0]] } : { allowed: true as const };

  const keyWords = pending.state === "PENDING"
    ? "Moving to another officer: the substitution is not complete"
    : !facts.liveKey
    ? facts.roster.length < 2
      ? "Not made: at least two opening officers must be named"
      : `Not made: ${facts.state.missing.length === 1 ? "one officer has" : `${facts.state.missing.length} officers have`} still to set their share`
    : facts.state.stale
      ? "Out of date: the officers named have changed, so each must set their share again"
      : "Made, and held by every named officer";
  const tone = facts.liveKey && !facts.state.stale ? "ok" : "warn";
  const heldBy = new Set(facts.shareHolderRowIds);
  const hasOwnKey = new Set(facts.officerKeys.map((k) => k.openingOfficerId));

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ShieldIcon size={17} />}
        title="Sealing key"
        subtitle="Online bids are sealed to a key that only all the named opening officers can open together."
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={tone}>{facts.liveKey && !facts.state.stale ? "Key made" : "Key not ready"}</Badge>
            {mine && <SetShareDrawer exerciseId={ex.id} allowed={shareAllowed} minLength={minLength} again={hasOwnKey.has(mine.id)} />}
            {mine && hasOwnKey.has(mine.id) && <CheckUnlockDrawer exerciseId={ex.id} />}
            {facts.published && <ChangeKeyDrawer exerciseId={ex.id} allowed={rekeyAllowed} />}
            {departingIsMe && pending.state === "PENDING" && (
              <ReleaseShareDrawer exerciseId={ex.id} to={pending.incoming.name} allowed={afterClosing.change === "REFUSED" ? { allowed: false, reason: SUBSTITUTION_WORDS.AFTER_CLOSING_RETENDER } : pending.incoming.hasKey ? { allowed: true } : { allowed: false, reason: SUBSTITUTION_WORDS.INCOMING_KEY_NOT_SET }} />
            )}
          </span>
        }
      />
      <CardBody className="flex flex-col gap-4">
        <KeyValues
          columns={2}
          items={[
            { label: "The key", value: keyWords },
            { label: "Fingerprint", value: facts.liveKey ? <span className="font-mono text-[12.5px]">{facts.liveKey.fingerprint}</span> : "Not made yet" },
            { label: "Published with fingerprint", value: ex.publishedKeyFingerprint ? <span className="font-mono text-[12.5px]">{ex.publishedKeyFingerprint}</span> : "Not published yet" },
            { label: "Shortest passphrase", value: minLength == null ? <Badge tone="warn">Not set</Badge> : `${minLength} characters` },
          ]}
        />
        <Callout tone="info" title="Every named officer is needed">
          The bids can be opened only when every named officer takes part with their own passphrase. A forgotten passphrase cannot be recovered by anyone. Before any bid is submitted the key is made again; once a bid has been submitted, the exercise is re-tendered.
        </Callout>
        {pending.state === "PENDING" && (
          <Callout tone="warn" title="A substitution is waiting">
            {pendingSubstitutionWords(pending)}
            {afterClosing.change === "REFUSED" ? ` ${SUBSTITUTION_WORDS.AFTER_CLOSING_RETENDER}` : ""}
          </Callout>
        )}
        {pending.state === "AMBIGUOUS" && (
          <Callout tone="err" title="Substitutions cannot be told apart">
            {AMBIGUOUS_SUBSTITUTION_WORDS}
          </Callout>
        )}
        {pepperChangedFor.length > 0 && (
          <Callout tone="warn" title="A share was set under another sealing pepper">
            {publishSealingWords({ code: "PEPPER_CHANGED", level: "block", data: { label: pepperChangedFor.join(", ") } })}
          </Callout>
        )}
        {facts.roster.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-line">
            <DataList
              flat
              selectable={false}
              searchable={false}
              toolbar={false}
              exportName="opening-officer-shares"
              emptyTitle="Nobody is named yet"
              columns={[
                { key: "officer", label: "Officer", mobile: "primary" },
                { key: "share", label: "Share", width: "260px", mobile: "meta" },
              ]}
              rows={facts.roster.map((r) => ({
                id: r.id,
                search: r.name,
                cells: {
                  officer: { kind: "text", text: r.name },
                  share: { kind: "text", text: heldBy.has(r.id) ? "Set" : hasOwnKey.has(r.id) ? "Set, but the key must be made again" : "Not set yet", dim: !heldBy.has(r.id) },
                },
              }))}
            />
          </div>
        )}
        {changes.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[12.5px] font-semibold text-ink-2">Changes of the key since it was published</p>
            <div className="overflow-hidden rounded-2xl border border-line">
              <DataList
                flat
                selectable={false}
                searchable={false}
                toolbar={false}
                exportName="published-key-changes"
                emptyTitle="No changes"
                columns={[
                  { key: "at", label: "When", width: "200px", mobile: "primary" },
                  { key: "by", label: "By", width: "180px", mobile: "meta" },
                  { key: "fingerprints", label: "Fingerprint", mobile: "meta" },
                  { key: "reason", label: "Why", mobile: "meta" },
                ]}
                rows={changes.map((c) => ({
                  id: c.id,
                  search: c.reason,
                  cells: {
                    at: { kind: "text", text: formatOrgDateTime(c.at, org.timeZone) },
                    by: { kind: "text", text: c.by.name },
                    fingerprints: { kind: "text", text: `${c.fromFingerprint} to ${c.toFingerprint}`, dim: true },
                    reason: { kind: "text", text: c.reason, dim: true },
                  },
                }))}
              />
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
