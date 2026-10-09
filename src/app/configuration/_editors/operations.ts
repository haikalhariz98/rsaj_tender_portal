import { awardsOperations } from "../awards/operations";
import { budgetOperations } from "../budget/operations";
import { committeesOperations } from "../committees/operations";
import { contractsOperations } from "../contracts/operations";
import { awardsRecordsOperations, documentsRecordsOperations, projectsRecordsOperations } from "./record-operations";
import { documentsOperations } from "../documents/operations";
import { evaluationOperations } from "../evaluation/operations";
import { invitationOperations } from "../invitation/operations";
import { notificationsOperations } from "../notifications/operations";
import { numberingOperations } from "../numbering/operations";
import { organisationOperations } from "../organisation/operations";
import { organisationSignInOperations } from "../organisation/sign-in-operations";
import { postAwardOperations } from "../post-award/operations";
import { referenceDataOperations } from "../reference-data/operations";
import { requisitionsOperations } from "../requisitions/operations";
import { routingSheetsOperations } from "../routing-sheets/operations";
import { scopeOperations } from "../scope/operations";
import { suppliersOperations } from "../suppliers/operations";
import { templatesFormsOperations } from "../templates/form-operations";
import { templatesGlossaryOperations } from "../templates/glossary-operations";
import { templatesOperations } from "../templates/operations";
import { tenderDocumentsConditionsOperations } from "../tender-documents/conditions-operations";
import { tenderDocumentsOperations } from "../tender-documents/operations";
import { usersOperations } from "../users/operations";

/**
 * Every editor a two-person change can carry (sign-in programme Phase 5). Each section lists its own in `operations.ts` beside its `core.ts`; this gathers them.
 * `registry-scan.test.ts` holds every Configuration action file to being a proposal of an editor named here, or to having a rule of its own, named with its reason.
 */
export const OPERATIONS = {
  ...awardsOperations,
  ...budgetOperations,
  ...committeesOperations,
  ...contractsOperations,
  ...documentsRecordsOperations,
  ...projectsRecordsOperations,
  ...awardsRecordsOperations,
  ...documentsOperations,
  ...evaluationOperations,
  ...invitationOperations,
  ...notificationsOperations,
  ...numberingOperations,
  ...organisationOperations,
  ...organisationSignInOperations,
  ...postAwardOperations,
  ...referenceDataOperations,
  ...requisitionsOperations,
  ...routingSheetsOperations,
  ...scopeOperations,
  ...suppliersOperations,
  ...templatesFormsOperations,
  ...templatesGlossaryOperations,
  ...templatesOperations,
  ...tenderDocumentsConditionsOperations,
  ...tenderDocumentsOperations,
  ...usersOperations,
} as const;

export type EditKey = keyof typeof OPERATIONS;
