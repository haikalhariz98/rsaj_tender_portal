import { EXERCISE_STATUSES } from "@/lib/method/types";
import { isPublished } from "@/lib/window/phase";
import Link from "next/link";
import type { ReactNode } from "react";

import { requireStaff } from "@/app/_auth/actor";
import { hiddenExercises } from "@/app/_auth/sulit";
import { HistoryButton } from "@/components/history-drawer";
import { ShieldCheckIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { InfoChip } from "@/components/ui/info-chip";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues } from "@/components/ui/stat";
import { ActionsCol, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { scannerSetting } from "@/lib/documents/store";
import { demonstrationAllowedByDeployment, liveAllowedByDeployment, pepperConfigured } from "@/lib/integration/sealing-deployment";
import { PEPPER_LIST_WORDS, pepperListState } from "@/lib/sealing/pepper";
import { loadPepperList } from "@/lib/sealing/pepper-store";
import { exercisesStillTakingBids, sealingModeWords } from "@/lib/sealing/policy";
import { runtimeRoleFacts } from "@/lib/auth/runtime-role-store";
import { LIVE_ISSUE_WORDS, liveIssueFaults, RUNTIME_ROLE_UNKNOWN } from "@/lib/sealing/switch";

import { EditBidSealingPolicy } from "./editors";

export const dynamic = "force-dynamic";

/// The published statuses, from the one rule (`isPublished`), not restated.
const PUBLISHED = EXERCISE_STATUSES.filter(isPublished);

function Recorded({ text, at, by }: { text: string; at: Date | null; by?: string | null }) {
  if (!text) return <Badge tone="warn">Not recorded</Badge>;
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="break-words whitespace-pre-line">{text}</span>
      <span className="text-[12.5px] text-ink-3">{[at ? `Recorded ${formatDate(at)}` : null, by ? `by ${by}` : null].filter(Boolean).join(" ")}</span>
    </span>
  );
}

export default async function BidSealingPage() {
  const actor = await requireStaff();
  const org = actor.organisationId;
  // A restricted exercise the reader may not see is not listed (FR-MTD-007).
  const hidden = await hiddenExercises(actor);
  const [row, exercises] = await Promise.all([
    db.bidSealingPolicy.findUnique({ where: { organisationId: org }, include: { publicRoleAttestedBy: { select: { name: true } }, hardeningAttestedBy: { select: { name: true } } } }),
    db.sourcingExercise.findMany({
      where: { organisationId: org, submissionChannel: "ONLINE", status: { in: PUBLISHED }, ...(hidden.length ? { id: { notIn: hidden } } : {}) },
      orderBy: { reference: "asc" },
      select: { id: true, reference: true, title: true, status: true, closingAt: true, onlineSubmissionMode: true, submissionChannel: true },
    }),
  ]);
  const started = new Set((await db.opening.findMany({ where: { organisationId: org, kind: "MAIN", exerciseId: { in: exercises.map((e) => e.id) } }, select: { exerciseId: true } })).map((o) => o.exerciseId));
  const taking = exercisesStillTakingBids(exercises.map((e) => ({ ...e, channel: e.submissionChannel, mainOpeningStarted: started.has(e.id) })));

  // Read only (20y). A restricted exercise the reader may not see is not listed, as above.
  const pepperList = await loadPepperList(org);
  const pepperRows = pepperList.rows.filter((r) => !hidden.includes(r.id));
  // Judged on the rows this reader may see, with a fixed sentence (no number) that a restricted exercise is listed only to those named on it.
  const pepperState = pepperListState(pepperList.held, pepperRows.length);

  const scannerState = scannerSetting().state;
  const scanner = scannerState === "SET";
  const pepper = pepperConfigured();
  const liveFlag = liveAllowedByDeployment();
  const demoFlag = demonstrationAllowedByDeployment();
  // The app's database login (N6): an unknown login fails closed (J6).
  const runtimeRole = await runtimeRoleFacts().catch(() => RUNTIME_ROLE_UNKNOWN);
  const missing = liveIssueFaults({
    cryptoReviewReference: row?.cryptoReviewReference ?? "",
    procedureAmendmentReference: row?.procedureAmendmentReference ?? "",
    customerAcceptanceReference: row?.customerAcceptanceReference ?? "",
    scannerConfigured: scanner,
    liveAllowedByDeployment: liveFlag,
    pepperConfigured: pepper,
    publicRoleAttestation: row?.publicRoleAttestation ?? "",
    deploymentHardeningAttestation: row?.hardeningAttestation ?? "",
    runtimeRole,
  });
  const mode = row?.onlineSubmission ?? null;
  const values: Record<string, string> = {
    onlineSubmission: mode ?? "unset",
    cryptoReviewReference: row?.cryptoReviewReference ?? "",
    procedureAmendmentReference: row?.procedureAmendmentReference ?? "",
    customerAcceptanceReference: row?.customerAcceptanceReference ?? "",
    publicRoleAttestation: row?.publicRoleAttestation ?? "",
    hardeningAttestation: row?.hardeningAttestation ?? "",
    provenance: row?.provenance ?? "",
    notes: row?.notes ?? "",
    attestedByPersonId: actor.personId,
  };
  const item = (label: string, value: ReactNode) => ({ label, value });
  const yes = (on: boolean, yesText: string, noText: string) => (on ? <Badge tone="ok">{yesText}</Badge> : <Badge tone="warn">{noText}</Badge>);

  return (
    <>
      <PageHeader
        title="Bid sealing"
        badge={mode ? <Badge tone={mode === "LIVE" ? "ok" : "info"} dot>{mode === "LIVE" ? "Live" : "Demonstration"}</Badge> : <Badge tone="warn" dot>Not set</Badge>}
        info={{ title: "Bid sealing", text: "Whether bids may be submitted online and sealed, and what is recorded first." }}
        actions={
          <>
            {row && <HistoryButton entity="BidSealingPolicy" entityId={row.id} label="the bid sealing policy" />}
            <EditBidSealingPolicy values={values} />
          </>
        }
      />
      <div className="flex flex-col gap-6">
        <div><InfoChip tone="warn" detail="Encrypted under the opening officers' keys. The server reads each file once as it arrives. Who bid is not hidden from database users.">Independent review pending</InfoChip></div>

        <Card id="switch" className="scroll-mt-24">
          <CardHeader icon={<ShieldCheckIcon size={17} />} title="The switch" subtitle="One proposes, another decides" />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                item("Online submission of bids", mode ? sealingModeWords(mode) : <span className="flex flex-col items-start gap-1.5"><Badge tone="warn">Not set</Badge><span className="text-[12.5px] text-ink-3">Online submission is not set, so no exercise can be published for online bids.</span></span>),
                item("Where this comes from", <ProvenanceBadge value={row?.provenance} />),
                item("The outside cryptography review", <Recorded text={row?.cryptoReviewReference ?? ""} at={row?.cryptoReviewRecordedAt ?? null} />),
                item("The amendment of the bid procedure", <Recorded text={row?.procedureAmendmentReference ?? ""} at={row?.procedureAmendmentRecordedAt ?? null} />),
                item("The organisation's written acceptance of the limits", <Recorded text={row?.customerAcceptanceReference ?? ""} at={row?.customerAcceptanceRecordedAt ?? null} />),
                item("The public copy's database role (attested, not checked by the portal)", <Recorded text={row?.publicRoleAttestation ?? ""} at={row?.publicRoleAttestedAt ?? null} by={row?.publicRoleAttestedBy?.name} />),
                item("The deployment's hardening (attested, not checked by the portal)", <Recorded text={row?.hardeningAttestation ?? ""} at={row?.hardeningAttestedAt ?? null} by={row?.hardeningAttestedBy?.name} />),
              ]}
            />
            {row?.notes && <p className="mt-4 text-[13px] break-words whitespace-pre-line text-ink-2">{row.notes}</p>}
          </CardBody>
        </Card>

        <Card id="deployment" className="scroll-mt-24">
          <CardHeader title="This copy of the system" subtitle="Set by the operator. Read only." />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                item("Demonstration bids allowed", yes(demoFlag, "Allowed", "Not allowed")),
                item("Live bids allowed", yes(liveFlag, "Allowed", "Not allowed")),
                item("Malware scanner", yes(scanner, "Configured", scannerState === "FAULT" ? "Set wrongly" : "Not configured")),
                item("Sealing pepper", yes(pepper, "Configured", "Not configured")),
              ]}
            />
          </CardBody>
        </Card>

        <Card id="live" className="scroll-mt-24">
          <CardHeader title="What live bids still need" subtitle="Rechecked when decided" />
          <CardBody>
            {missing.length === 0 ? (
              <p className="text-[13px] text-ink-2">Every condition for live bids is recorded or present.</p>
            ) : (
              <ul className="list-disc pl-5 text-[13px] text-ink-2">
                {missing.map((f) => (
                  <li key={f}>{LIVE_ISSUE_WORDS[f]}</li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card id="pepper" className="scroll-mt-24 overflow-hidden">
          <CardHeader title="Exercises that still need the sealing pepper" subtitle="Read only" divided={pepperState !== "SOME"} />
          <CardBody className="flex flex-col gap-2">
            <p className="text-[13px] text-ink-2">{PEPPER_LIST_WORDS.scope}</p>
            <p className="text-[13px] text-ink-2">{PEPPER_LIST_WORDS.restricted}</p>
          </CardBody>
          {pepperState === "NOT_HELD" && <CardBody><Callout tone="warn" title="No pepper is held">{PEPPER_LIST_WORDS.notHeld}</Callout></CardBody>}
          {pepperState === "INVALID" && <CardBody><Callout tone="warn" title="The pepper held is not usable">{PEPPER_LIST_WORDS.invalid}</Callout></CardBody>}
          {pepperState === "NONE" && <EmptyState title="None you can see" />}
          {pepperState === "SOME" && (
            <>
              <CardBody>
                <p className="text-[13px] text-ink-2">{PEPPER_LIST_WORDS.some}</p>
              </CardBody>
              <Table minWidth={460}>
                <THead>
                  <Tr>
                    <Th>Exercise</Th>
                    <ActionsCol />
                  </Tr>
                </THead>
                <tbody>
                  {pepperRows.map((e) => (
                    <Tr key={e.id}>
                      <Td>{`${e.reference} · ${e.title}`}</Td>
                      <RowActions>
                        <Link href={`/sourcing/${e.id}`}>Open</Link>
                      </RowActions>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </>
          )}
        </Card>

        {mode !== "LIVE" && (
          <Card id="taking" className="scroll-mt-24 overflow-hidden">
            <CardHeader
              title="Online exercises still taking bids"
              subtitle="Published exercises keep their mode."
              divided={taking.length === 0}
            />
            {taking.length === 0 ? (
              <EmptyState title="None" />
            ) : (
              <Table minWidth={560}>
                <THead>
                  <Tr>
                    <Th>Exercise</Th>
                    <Th>Mode it was published with</Th>
                    <Th>Closing</Th>
                    <ActionsCol />
                  </Tr>
                </THead>
                <tbody>
                  {taking.map((e) => (
                    <Tr key={e.id}>
                      <Td>{`${e.reference} · ${e.title}`}</Td>
                      <Td>{e.onlineSubmissionMode === "LIVE" ? "Live" : e.onlineSubmissionMode === "DEMONSTRATION" ? "Demonstration" : "Not recorded"}</Td>
                      <Td>{e.closingAt ? formatDate(e.closingAt) : "Not set"}</Td>
                      <RowActions>
                        <Link href={`/sourcing/${e.id}`}>Open</Link>
                      </RowActions>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
