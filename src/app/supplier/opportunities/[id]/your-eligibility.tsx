import Link from "next/link";

import { ScaleIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SUPPLIER_SIGN_IN_PATH } from "@/lib/auth/routes";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { loadEligibilityFor } from "@/lib/portal/company/company-store";
import { SUPPLIER_VERDICT } from "@/lib/portal/company/eligibility-view";
import { SURFACE_ENV, surfaceOf } from "@/lib/portal/surface";

import { currentSupplierOrNull } from "../../../_auth/supplier";

/**
 * "Do you qualify?" on an opportunity's own page (Phase 4c; FR-VND-011, after 615-C1): for a signed-in supplier, each condition of the exercise with a pass or a fail and the reason, the
 * failing one named. The judgement is the one the office's screens and a bid's opening use (`eligibilityOf`), for THIS supplier only, and only for an exercise the public may read: the page
 * is already that, and the loader answers nothing for any other. Someone not signed in is offered the sign-in, on the public copy; the staff copy, where nobody is a supplier, says nothing.
 */
export async function YourEligibility({ exerciseId }: { exerciseId: string }) {
  const actor = await currentSupplierOrNull();
  if (!actor) {
    if (surfaceOf(process.env[SURFACE_ENV]) !== "public") return null;
    return (
      <Card className="mb-6">
        <CardHeader icon={<ScaleIcon size={17} />} title="Do you qualify?" actions={<ButtonLink href={SUPPLIER_SIGN_IN_PATH} variant="secondary" size="sm">Sign in</ButtonLink>} divided={false} />
      </Card>
    );
  }
  const e = await loadEligibilityFor(db, actor, exerciseId);
  if (!e) return null;
  const verdict = SUPPLIER_VERDICT[e.verdict];
  return (
    <Card className="mb-6">
      <CardHeader icon={<ScaleIcon size={17} />} title="Do you qualify?" subtitle={`${actor.supplierName}, judged ${formatDate(e.judgedOn)}`} actions={<Badge tone={verdict.tone} dot>{verdict.text}</Badge>} />
      <CardBody className="flex flex-col gap-4">
        <p className="text-[13.5px] text-ink-2">{verdict.detail}</p>
        <ul className="divide-y divide-line/70 rounded-2xl border border-line">
          {e.conditions.map((c) => (
            <li key={c.key} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-ink">{c.label}{c.about ? ` · ${c.about}` : ""}</p>
                <p className="text-[13px] text-ink-2">{c.reason}</p>
              </div>
              <Badge tone={c.tone} className="shrink-0 self-start">{c.resultText}</Badge>
            </li>
          ))}
        </ul>
        <p className="text-[12.5px] text-ink-3">
          Your documents are under <Link href="/supplier/company?tab=documents">Company</Link>. An unchecked document does not count.
        </p>
      </CardBody>
    </Card>
  );
}
