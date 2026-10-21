/**
 * The public form's body read as the signed-in wizard's `Draft`, so the same pure rules judge both (ADR 0041 D1, REG-1, plan section 2.2). Shared by the browser, at each Next, and by
 * the server, at Submit: the same input gives the same faults. Pure, and safe for the browser.
 *
 * The browser holds the files, so a row's `fileCount` and the statement's count are what was sent with it (the parts named `doc.<clientKey>` and `statement`), never what the body says.
 * The signatory is the one the applicant gave on step 4 (the `declarationsAsSigned` rule): each agreement is recorded under that name and position, whatever else the body says.
 */

import type { DeclarationInput, Draft } from "@/lib/portal/registration/types";

import type { PublicApplicationBody } from "./contract";

const orNull = (s: string): string | null => (s.trim() === "" ? null : s.trim());

/// The body as a draft: the documents keyed by the browser's row key, the bank details, the signatory, and the GIRO tick with the hash of the wording it was made on.
export function heldDraft(body: PublicApplicationBody, fileCounts: ReadonlyMap<string, number>, statementCount: number): Draft {
  const giro = body.agreements.find((a) => a.kind === "GIRO_AUTHORISATION");
  return {
    documents: body.documents.map((d) => ({
      id: d.clientKey,
      typeId: d.typeId,
      title: d.title,
      reference: d.reference,
      issuingAuthority: d.issuingAuthority,
      expiresOn: orNull(d.expiresOn),
      notApplicable: d.notApplicable,
      ratePercent: orNull(d.ratePercent),
      fileCount: fileCounts.get(d.clientKey) ?? 0,
      valueIds: d.valueIds,
    })),
    creditor: body.creditor,
    statementCount,
    signatoryName: body.signatory.name,
    signatoryDesignation: body.signatory.designation,
    giroConfirmed: giro?.confirmed === true,
    giroTextSha256: giro?.confirmed === true ? giro.textSha256 : null,
  };
}

/// The agreements as they will be recorded: each names the wording it was shown (id and hash) and whether it was ticked, under the signatory of step 4.
export function heldDeclarations(body: PublicApplicationBody): DeclarationInput[] {
  return body.agreements.map((a) => ({ kind: a.kind, textVersionId: a.textVersionId, textSha256: a.textSha256, signatoryName: body.signatory.name, signatoryDesignation: body.signatory.designation, confirmed: a.confirmed }));
}
