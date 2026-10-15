import { revalidatePath } from "next/cache";

import { attributionRefusalState, beginAct } from "@/app/_auth/act";
import { requireStaff, toAuditActor } from "@/app/_auth/actor";
import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import type { OnlineSubmissionMode } from "@/lib/bids/online/types";
import { dayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { malwareScanner } from "@/lib/documents/store";
import {
  liveAllowedByDeployment,
  pepperConfigured,
} from "@/lib/integration/sealing-deployment";
import {
  attestationFor,
  sealingModeWords,
  sealingPolicyFaults,
  stampFor,
} from "@/lib/sealing/policy";
import { LIVE_ISSUE_WORDS } from "@/lib/sealing/switch";
import { FormReader } from "@/lib/validate";

/**
 * Configuration > Bid sealing: the switch for online sealed bids and the conditions recorded for LIVE (ADR 0036 D1, rulings 20i, 20o, 20v). Runs only when it is
 * rehearsed and when a second person applies it (`BID_SEALING_POLICY`). LIVE is re-judged on every save from the live deployment, so a condition that has lapsed since
 * the proposal blocks the apply. The person who attests is the one who proposed the change (the form is theirs); the one who decides it approves the change and
 * attests nothing.
 */

const PATH = "/configuration/bid-sealing";
const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
const NOT_SET = "Not set";
const PROVENANCE_WORDS: Record<(typeof PROVENANCE)[number], string> = { STATED: "Stated", OBSERVED: "Observed", ASSUMED: "Assumed" };
const prov = (p: string | null | undefined) => (p ? (PROVENANCE_WORDS[p as (typeof PROVENANCE)[number]] ?? NOT_SET) : NOT_SET);
/// The day as the organisation reads it (its own zone), never the UTC day: a reference recorded before 08:00 in Malaysia is still that morning's date.
const dayWords = (d: Date | null, timeZone: string | null) => (d ? dayIn(d, timeZone) : null);

export async function saveBidSealingPolicy(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const actor = await requireStaff();
  const r = new FormReader(data);
  const mode = r.choice("onlineSubmission", "Online submission", [
    "DEMONSTRATION",
    "LIVE",
    "unset",
  ] as const);
  const v = {
    onlineSubmission: (mode === "DEMONSTRATION" || mode === "LIVE"
      ? mode
      : null) as OnlineSubmissionMode | null,
    cryptoReviewReference: r.text(
      "cryptoReviewReference",
      "The outside cryptography review",
      { max: 240 },
    ),
    procedureAmendmentReference: r.text(
      "procedureAmendmentReference",
      "The amendment of the bid procedure",
      { max: 240 },
    ),
    customerAcceptanceReference: r.text(
      "customerAcceptanceReference",
      "The organisation's written acceptance",
      { max: 240 },
    ),
    publicRoleAttestation: r.text(
      "publicRoleAttestation",
      "The public copy's database role",
      { max: 2000 },
    ),
    hardeningAttestation: r.text(
      "hardeningAttestation",
      "The deployment's hardening",
      { max: 2000 },
    ),
    provenance: r.choice("provenance", "Where this comes from", PROVENANCE),
    notes: r.text("notes", "Notes", { max: 2000 }),
  };
  if (r.failed) return { ok: false, errors: r.errors };
  const reason = String(data.get("reason") ?? "");
  const scannerConfigured = malwareScanner().configured;

  // An attestation is an act of the person who attests: the proposer, who typed it, whose person the form names (hidden, theirs). It is attributed through the act registry,
  // at the proposal's rehearsal as themselves and at the apply as the proposer, never as the second person who only decides the change (ADR 0036 D1, ruling 20v).
  const current = await db.bidSealingPolicy.findUnique({
    where: { organisationId: actor.organisationId },
    select: { publicRoleAttestation: true, hardeningAttestation: true },
  });
  const changed = (next: string, was: string | undefined) =>
    next.trim() !== "" && next.trim() !== (was ?? "").trim();
  const publicAct = changed(
    v.publicRoleAttestation,
    current?.publicRoleAttestation,
  )
    ? await beginAct(actor, data, "BidSealingPolicy.publicRoleAttestedBy", {
        personField: "attestedByPersonId",
        namesSubject: true,
      })
    : null;
  if (publicAct && !publicAct.ok) return publicAct.state;
  const hardeningAct = changed(
    v.hardeningAttestation,
    current?.hardeningAttestation,
  )
    ? await beginAct(actor, data, "BidSealingPolicy.hardeningAttestedBy", {
        personField: "attestedByPersonId",
        namesSubject: true,
      })
    : null;
  if (hardeningAct && !hardeningAct.ok) return hardeningAct.state;
  // An attestation is the proposer's own (security review of stage B): the form's hidden field names the person, and a name other than the signed-in person's is refused here, so a
  // must-have condition of LIVE never reads as attested by someone who did not touch the form.
  for (const act of [publicAct, hardeningAct]) {
    if (act?.ok && act.act.subjectPersonId !== actor.personId) {
      return { ok: false, message: "An attestation is made by the person who records it. Sign in as the person who can state this, and record it yourself." };
    }
  }
  const publicBy = publicAct?.ok
    ? publicAct.act.subjectPersonId
    : actor.personId;
  const hardeningBy = hardeningAct?.ok
    ? hardeningAct.act.subjectPersonId
    : actor.personId;

  try {
    return await db.$transaction(async (tx): Promise<FormState> => {
      await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${actor.organisationId} FOR UPDATE`;
      const before = await tx.bidSealingPolicy.findUnique({
        where: { organisationId: actor.organisationId },
      });
      const faults = sealingPolicyFaults({
        mode: v.onlineSubmission,
        live: {
          cryptoReviewReference: v.cryptoReviewReference,
          procedureAmendmentReference: v.procedureAmendmentReference,
          customerAcceptanceReference: v.customerAcceptanceReference,
          scannerConfigured,
          liveAllowedByDeployment: liveAllowedByDeployment(),
          pepperConfigured: pepperConfigured(),
          publicRoleAttestation: v.publicRoleAttestation,
          deploymentHardeningAttestation: v.hardeningAttestation,
        },
      });
      if (faults.length)
        return {
          ok: false,
          message: `Live online bids cannot be issued yet. ${faults.map((f) => LIVE_ISSUE_WORDS[f]).join(" ")}`,
        };

      const now = new Date();
      const was = (
        text: string | undefined,
        at: Date | null | undefined,
        by: string | null | undefined = null,
      ) => ({ text: text ?? "", at: at ?? null, byPersonId: by });
      const crypto = stampFor(
        was(before?.cryptoReviewReference, before?.cryptoReviewRecordedAt),
        v.cryptoReviewReference,
        now,
      );
      const amendment = stampFor(
        was(
          before?.procedureAmendmentReference,
          before?.procedureAmendmentRecordedAt,
        ),
        v.procedureAmendmentReference,
        now,
      );
      const acceptance = stampFor(
        was(
          before?.customerAcceptanceReference,
          before?.customerAcceptanceRecordedAt,
        ),
        v.customerAcceptanceReference,
        now,
      );
      const publicRole = attestationFor(
        was(
          before?.publicRoleAttestation,
          before?.publicRoleAttestedAt,
          before?.publicRoleAttestedByPersonId,
        ),
        v.publicRoleAttestation,
        now,
        publicBy,
      );
      const hardening = attestationFor(
        was(
          before?.hardeningAttestation,
          before?.hardeningAttestedAt,
          before?.hardeningAttestedByPersonId,
        ),
        v.hardeningAttestation,
        now,
        hardeningBy,
      );

      const row = {
        onlineSubmission: v.onlineSubmission,
        cryptoReviewReference: v.cryptoReviewReference,
        cryptoReviewRecordedAt: crypto,
        procedureAmendmentReference: v.procedureAmendmentReference,
        procedureAmendmentRecordedAt: amendment,
        customerAcceptanceReference: v.customerAcceptanceReference,
        customerAcceptanceRecordedAt: acceptance,
        publicRoleAttestation: v.publicRoleAttestation,
        publicRoleAttestedAt: publicRole.at,
        publicRoleAttestedByPersonId: publicRole.byPersonId,
        hardeningAttestation: v.hardeningAttestation,
        hardeningAttestedAt: hardening.at,
        hardeningAttestedByPersonId: hardening.byPersonId,
        provenance: v.provenance,
        notes: v.notes,
      };
      const ids = [
        row.publicRoleAttestedByPersonId,
        row.hardeningAttestedByPersonId,
        before?.publicRoleAttestedByPersonId,
        before?.hardeningAttestedByPersonId,
      ].filter((x): x is string => !!x);
      const names = new Map(
        (
          await tx.person.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
          })
        ).map((p) => [p.id, p.name]),
      );
      const zone = (await tx.organisation.findUnique({ where: { id: actor.organisationId }, select: { timeZone: true } }))?.timeZone ?? null;
      const words = (p: typeof row | NonNullable<typeof before> | null) =>
        p
          ? {
              onlineSubmission: sealingModeWords(p.onlineSubmission),
              cryptoReview: p.cryptoReviewReference
                ? `${p.cryptoReviewReference} (recorded ${dayWords(p.cryptoReviewRecordedAt, zone)})`
                : NOT_SET,
              procedureAmendment: p.procedureAmendmentReference
                ? `${p.procedureAmendmentReference} (recorded ${dayWords(p.procedureAmendmentRecordedAt, zone)})`
                : NOT_SET,
              customerAcceptance: p.customerAcceptanceReference
                ? `${p.customerAcceptanceReference} (recorded ${dayWords(p.customerAcceptanceRecordedAt, zone)})`
                : NOT_SET,
              publicCopyRole: p.publicRoleAttestation
                ? `Attested, not checked by the portal: ${p.publicRoleAttestation} (${names.get(p.publicRoleAttestedByPersonId ?? "") ?? "a person"}, ${dayWords(p.publicRoleAttestedAt, zone)})`
                : NOT_SET,
              hardening: p.hardeningAttestation
                ? `Attested, not checked by the portal: ${p.hardeningAttestation} (${names.get(p.hardeningAttestedByPersonId ?? "") ?? "a person"}, ${dayWords(p.hardeningAttestedAt, zone)})`
                : NOT_SET,
              whereItComesFrom: prov(p.provenance),
              notes: p.notes || null,
            }
          : null;
      const entity = {
        actor: toAuditActor(actor),
        organisationId: actor.organisationId,
        entity: "BidSealingPolicy",
        entityLabel: "Bid sealing policy",
        reason,
      };
      if (!before) {
        const created = await tx.bidSealingPolicy.create({
          data: { organisationId: actor.organisationId, ...row },
        });
        await writeAudit(
          tx,
          { ...entity, entityId: created.id },
          "CREATE",
          diffFields(null, words(row)!),
        );
        if (publicAct?.ok)
          await publicAct.act.write(tx, created.id, {
            document: { entity: "BidSealingPolicy", id: created.id },
          });
        if (hardeningAct?.ok)
          await hardeningAct.act.write(tx, created.id, {
            document: { entity: "BidSealingPolicy", id: created.id },
          });
      } else {
        await tx.bidSealingPolicy.update({
          where: { id: before.id, organisationId: actor.organisationId },
          data: row,
        });
        const changes = diffFields(words(before), words(row)!);
        if (changes.length)
          await writeAudit(
            tx,
            { ...entity, entityId: before.id },
            "UPDATE",
            changes,
          );
        if (publicAct?.ok)
          await publicAct.act.write(tx, before.id, {
            document: { entity: "BidSealingPolicy", id: before.id },
          });
        if (hardeningAct?.ok)
          await hardeningAct.act.write(tx, before.id, {
            document: { entity: "BidSealingPolicy", id: before.id },
          });
      }
      revalidatePath(PATH);
      return { ok: true };
    });
  } catch (e) {
    const refused = attributionRefusalState(e);
    if (refused) return refused;
    throw e;
  }
}
