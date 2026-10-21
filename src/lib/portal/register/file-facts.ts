/**
 * A whole online application read as the file the approval rules judge (ADR 0041 D5, plan section 2.2): `approveFaults`, `submitFaults` and `decisionSnapshot` read a `FileFacts`, and
 * this builds one from the rows held against the application, so the rules are not restated. A mandatory document stands only once a named officer has verified it on the held row
 * (FR-VND-004). Pure.
 *
 * Fixed by what the application is: a NEW registration, from an applicant, by the PORTAL channel. There is no paper declaration and no resubmission online (REG-3): the online false
 * declaration stands in for the paper only where the organisation has said so (`onlineDeclarationReplacesPaper`, O-8). No blacklisting or cancellation can be in effect on a company
 * that is not on the register: a number already on it is the register flag, judged separately.
 */

import type { DeclarationKind } from "@/lib/portal/registration/types";
import { fileFacts, type FileFacts } from "@/lib/suppliers/review";
import type { ApplicationStatus, DocumentTypeFacts, VerificationState } from "@/lib/suppliers/types";

/// What the online application is, for the rules.
export interface HeldApplicationFacts {
  status: "RECEIVED" | "RECORDED" | "DISCARDED" | "APPROVED" | "REJECTED";
  /// The organisation's day it was received (YYYY-MM-DD): the day its documents were lodged.
  receivedOn: string;
  /// A route on it is waiting for a decision.
  routePending: boolean;
}

/// A certificate held on it, as the officer has checked it.
export interface HeldDocumentFacts {
  id: string;
  typeId: string;
  typeLabel: string;
  expiresOn: string | null;
  notApplicable: boolean;
  verification: VerificationState;
  verifiedOn: string | null;
}

/// The application's status as the file's: open while received; decided otherwise (approved, or closed for any other reason).
const fileStatus = (s: HeldApplicationFacts["status"]): ApplicationStatus => (s === "RECEIVED" ? "RECEIVED" : s === "APPROVED" ? "APPROVED" : "REJECTED");

export function portalFileFacts(
  app: HeldApplicationFacts,
  docs: readonly HeldDocumentFacts[],
  creditor: { verification: VerificationState } | null,
  agreements: readonly { kind: DeclarationKind; signedAt: string }[],
  types: readonly DocumentTypeFacts[],
  policy: { onlineDeclarationReplacesPaper: boolean | null },
  today: string,
): FileFacts {
  const declared = agreements.find((a) => a.kind === "FALSE_DECLARATION");
  return fileFacts(
    {
      status: fileStatus(app.status),
      lapsedRecordedAt: null,
      resubmitBy: null,
      routePending: app.routePending,
      declarationSignedOn: null,
      declarationScanned: false,
      blacklist: null,
      kind: "NEW",
      supplierStatus: "APPLICANT",
      cancellation: null,
      channel: "PORTAL",
      onlineDeclaration: declared ? { signedAt: declared.signedAt } : null,
      onlineDeclarationReplacesPaper: policy.onlineDeclarationReplacesPaper,
      creditorProfile: creditor == null ? "NOT_ENTERED" : creditor.verification === "VERIFIED" ? "VERIFIED" : "NOT_VERIFIED",
    },
    types,
    docs.map((d) => ({ id: d.id, typeId: d.typeId, typeLabel: d.typeLabel, lodgedOn: app.receivedOn, issuedOn: null, validFrom: null, expiresOn: d.notApplicable ? null : d.expiresOn, notApplicable: d.notApplicable, verification: d.verification, verifiedOn: d.verifiedOn, supersedesId: null })),
    today,
  );
}
