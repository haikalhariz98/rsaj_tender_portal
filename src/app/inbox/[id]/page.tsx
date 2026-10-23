import { notFound } from "next/navigation";

import { requireStaff } from "@/app/_auth/actor";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { KeyValues } from "@/components/ui/stat";
import { ButtonLink } from "@/components/ui/button";
import { Blocked } from "@/components/ui/blocked";
import { confirmRefusal } from "@/lib/auth/backdate-confirmation";
import { loadBackdateToConfirm } from "@/lib/auth/backdate-store";
import { db } from "@/lib/db";

import { ConfirmBackdating } from "./editors";

export const dynamic = "force-dynamic";

export const metadata = { title: "Confirm a back-dated signature" };

/**
 * A back-dated signature that names you as authorising it (NFR-AUD-006, ruling item 9, Phase 5a). The signer dated the act earlier than the day they recorded it and named you as
 * the one who authorised that; until you confirm it, in a signature of your own, every screen reads it as the signer's claim, not confirmed. Only the person named reads this
 * page: for anyone else, and for an act in another organisation, it is not there.
 */
export default async function ConfirmBackdatingPage(props: PageProps<"/inbox/[id]">) {
  const actor = await requireStaff();
  const { id } = await props.params;
  const a = await loadBackdateToConfirm(db, actor, id);
  if (!a || a.effectiveOn == null || a.authorisedByPersonId !== actor.personId) notFound();
  // An administrator account is refused the confirmation (ruling on log line 2027(1)): the control is shown disabled with the act's own reason, and no password field.
  const refusal = confirmRefusal(a, actor);
  return (
    <>
      <PageHeader title="Confirm a back-dated signature" meta={[a.signerName]} actions={<ButtonLink href="/inbox" size="sm" variant="secondary">Back to the inbox</ButtonLink>} />
      <Card className="mb-6">
        <CardHeader title="What was signed" />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              { label: "Signed by", value: a.signerName },
              { label: "What was signed", value: a.whatWords },
              { label: "Dated", value: a.effectiveOn },
              { label: "Recorded on", value: a.recordedOn },
              { label: "Why it was dated earlier", value: a.reason },
            ]}
          />
        </CardBody>
      </Card>
      {a.alreadyConfirmed ? (
        <Callout tone="ok" title="You have confirmed this">
          Confirmed on {a.confirmedOn}.
        </Callout>
      ) : (
        <Callout tone="warn" title="Not confirmed yet" action={refusal ? <Blocked label="Confirm the back-dating" reason={refusal} primary /> : <ConfirmBackdating attributionId={a.id} signerName={a.signerName} whatWords={a.whatWords} effectiveOn={a.effectiveOn} />}>
          Confirm only if you authorised the earlier date.
        </Callout>
      )}
    </>
  );
}
