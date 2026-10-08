/**
 * Step 4 of the registration: the e-payment form, the Creditor's Profile (FR-VND-005). The beneficiary and the bank, the bank statement, and the GIRO authorisation. Pure.
 *
 * Nothing is policy. The banks and the account types are the customer's lists, the formats of an account number and a SWIFT code its CodeFormat rows (`bank_account_no`,
 * `swift_code`): no length rule is written here, and with no format set the field is accepted and told "format not checked", never "valid". The identity number is compared with the
 * company's registration number only to warn the reviewer, because a sole proprietor's beneficiary is a person.
 *
 * Required here is what the mock-up asks (an asterisk): the beneficiary's name, address, identity or company number, contact person, telephone and email, and the bank, the account
 * number, the kind of account and the bank's address. The fax, the tax registration number and the SWIFT code are optional. (Recorded as a decided reading of the mock-up.)
 */

import { matchesFormat } from "@/lib/integration/award-commitment";
import { normaliseRegistrationNo } from "@/lib/suppliers/identity";

import type { CreditorInput, RegistrationContext, StepFault } from "./types";
import { isBlank } from "./types";

export const CREDITOR_REQUIRED = [
  "beneficiaryName",
  "beneficiaryAddress",
  "beneficiaryIdentityNo",
  "beneficiaryContactPerson",
  "beneficiaryTelephone",
  "beneficiaryEmail",
  "bankCode",
  "bankAccountNo",
  "bankAccountTypeCode",
  "bankAddress",
] as const satisfies readonly (keyof CreditorInput)[];

/// What each field is called to the supplier.
export const CREDITOR_FIELD_LABEL: Readonly<Record<keyof CreditorInput, string>> = {
  beneficiaryName: "Beneficiary name",
  beneficiaryAddress: "Beneficiary address",
  beneficiaryIdentityNo: "Identity card or company number",
  beneficiaryContactPerson: "Contact person",
  beneficiaryTelephone: "Telephone",
  beneficiaryFax: "Fax",
  beneficiaryTaxRegistrationNo: "Tax registration number",
  beneficiaryEmail: "Email",
  bankCode: "Bank",
  bankAccountNo: "Account number",
  bankAccountTypeCode: "Account type",
  bankSwiftCode: "SWIFT code",
  bankAddress: "Bank address",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function creditorFaults(c: CreditorInput, statementCount: number, ctx: RegistrationContext): StepFault[] {
  const out: StepFault[] = [];
  const add = (f: Omit<StepFault, "step">) => out.push({ step: "epayment", ...f });
  const at = (k: keyof CreditorInput) => `creditor.${k}`;

  for (const k of CREDITOR_REQUIRED) {
    if (isBlank(c[k])) add({ code: "FIELD_REQUIRED", level: "block", field: at(k), data: { field: CREDITOR_FIELD_LABEL[k] } });
  }
  if (ctx.banks.length === 0) add({ code: "BANKS_NOT_SET", level: "block", field: at("bankCode") });
  else if (!isBlank(c.bankCode) && !ctx.banks.some((b) => b.code === c.bankCode)) add({ code: "BANK_NOT_LISTED", level: "block", field: at("bankCode") });
  if (ctx.accountTypes.length === 0) add({ code: "ACCOUNT_TYPES_NOT_SET", level: "block", field: at("bankAccountTypeCode") });
  else if (!isBlank(c.bankAccountTypeCode) && !ctx.accountTypes.some((b) => b.code === c.bankAccountTypeCode)) add({ code: "ACCOUNT_TYPE_NOT_LISTED", level: "block", field: at("bankAccountTypeCode") });

  if (!isBlank(c.beneficiaryEmail) && !EMAIL.test(c.beneficiaryEmail.trim())) add({ code: "EMAIL_NOT_VALID", level: "block", field: at("beneficiaryEmail") });

  const checkFormat = (k: "bankAccountNo" | "bankSwiftCode", pattern: string | null) => {
    if (isBlank(c[k])) return;
    const fits = matchesFormat(c[k].trim(), pattern);
    if (fits === false) add({ code: "FORMAT_MISMATCH", level: "block", field: at(k), data: { field: CREDITOR_FIELD_LABEL[k] } });
    else if (fits === null) add({ code: "FORMAT_NOT_CHECKED", level: "warn", field: at(k), data: { field: CREDITOR_FIELD_LABEL[k] } });
  };
  checkFormat("bankAccountNo", ctx.accountNoPattern);
  checkFormat("bankSwiftCode", ctx.swiftPattern);

  if (!isBlank(c.beneficiaryIdentityNo) && normaliseRegistrationNo(c.beneficiaryIdentityNo) !== ctx.supplier.registrationNoKey) {
    add({ code: "IDENTITY_DIFFERS", level: "warn", field: at("beneficiaryIdentityNo") });
  }
  if (statementCount === 0) add({ code: "STATEMENT_REQUIRED", level: "block", field: "creditor.statement" });
  return out;
}
