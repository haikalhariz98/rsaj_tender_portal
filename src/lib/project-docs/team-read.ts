/**
 * The two sides of a contract, read-only (PW-16, PW-17; plan step 7 §8.1). No schema: no stored staff members, no roles, no per-contract contractor membership.
 *
 * - Staff, Team tab: the contractor's portal accounts, the awardee's ACTIVE accounts whose contact is not retired (the accounts that may act on the contractor's side,
 *   `supplierHoldsContract`). A contact's name is SULIT (6.15 condition 2, scope supplier): it is shown only through the existing SULIT read, which the caller asks
 *   (`sulitGate`, `src/app/_auth/sulit.ts`, logged once) and hands in as `gate`. Without it each row reads "Portal account", with its status. The link to manage the
 *   accounts is given only to a reader who holds `supplierAccounts.manage` (accounts are still opened only by staff, PW-17).
 * - Portal, Overview: the S.O. (and anyone acting in the office) and the representatives in force on the organisation's today (`organisationSideOn`), by name and office
 *   only: no contact details, no ids, and nothing of who may act.
 *
 * Readers, not pure: they write nothing (the SULIT log is the gate's) and take no lock.
 */

import type { Tx } from "@/lib/audit/record";
import type { Sulit } from "@/lib/auth/sulit-access";
import type { StaffActor, SupplierActor } from "@/lib/auth/types";
import { ACCOUNT_STATUS_WORDS } from "@/lib/auth/words";
import { loadContract, type LoadedContract } from "@/lib/contract/repo";
import type { ProjectContext } from "@/lib/portal/projects/context-store";
import { loadSupervision } from "@/lib/supervision/load";

import { organisationSideOn } from "./side-store";

// ------------------------------------------------------------------ staff: the contractor's portal accounts

/// The record a contact's name is SULIT on: the awardee's supplier (scope supplier). The caller asks the gate with it (`sulitGate(actor, subject, ["contactName"])`).
export type ContactSubject = { scope: "supplier"; entity: "Supplier"; id: string; label: string };
export type ContactNamesGate = (subject: ContactSubject) => Promise<Sulit<true>>;

/// The one field asked: names only, never the contact's email, telephone or designation.
export const CONTACT_NAME_FIELDS = ["contactName"] as const;

/// A row's words when the reader may not read the contact's name.
export const UNNAMED_ACCOUNT = "Portal account";

export interface PortalAccountRow {
  accountId: string;
  /// The contact's name where the SULIT read was granted, else "Portal account".
  label: string;
  named: boolean;
  /// "Active".
  statusLabel: string;
}

export interface ContractorAccounts {
  rows: PortalAccountRow[];
  /// Why the names are not shown, in words, where they are not; null where they are, or where there is no row to name.
  namesWithheld: string | null;
  /// The supplier's page, where its accounts are managed, for a reader who holds `supplierAccounts.manage`; else null (no link).
  manageHref: string | null;
  /// The award names no supplier on the register, so the contractor has no portal account here.
  noContractor: boolean;
}

/// The awardee's active accounts, ordered as the supplier's contacts are (the primary contact first, then the oldest). A supplier has a handful of accounts, so the
/// status is judged here, as the session read judges it (`account.status === "ACTIVE"`).
async function activeAccounts(client: Tx, organisationId: string, supplierId: string) {
  const rows = await client.supplierAccount.findMany({
    where: { organisationId, supplierId, contact: { retiredOn: null } },
    orderBy: [{ contact: { isPrimary: "desc" } }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, status: true, contact: { select: { name: true } } },
  });
  return rows.filter((a) => a.status === "ACTIVE");
}

/// The awardee's supplier record (its id and reference, the SULIT subject), or null where the award names none on the register.
export async function awardeeSubject(client: Tx, l: LoadedContract): Promise<ContactSubject | null> {
  if (!l.award.vendorId) return null;
  const s = await client.supplier.findFirst({ where: { id: l.award.vendorId, organisationId: l.org.id }, select: { id: true, reference: true } });
  return s ? { scope: "supplier", entity: "Supplier", id: s.id, label: s.reference } : null;
}

/**
 * The contractor's active portal accounts, for staff, with names only where the SULIT read is granted. The gate is asked once, and only when there is an account to name.
 * `viewer` is the signed-in reader: whether they hold `supplierAccounts.manage` decides the link.
 */
export async function loadContractorAccounts(client: Tx, l: LoadedContract, viewer: Pick<StaffActor, "permissions">, gate: ContactNamesGate): Promise<ContractorAccounts> {
  const subject = await awardeeSubject(client, l);
  if (!subject) return { rows: [], namesWithheld: null, manageHref: null, noContractor: true };
  const accounts = await activeAccounts(client, l.org.id, subject.id);
  const manageHref = viewer.permissions.has("supplierAccounts.manage") ? `/suppliers/${subject.id}` : null;
  if (accounts.length === 0) return { rows: [], namesWithheld: null, manageHref, noContractor: false };
  const read = await gate(subject);
  const named = read.state === "GRANTED";
  return {
    rows: accounts.map((a) => ({ accountId: a.id, label: named ? a.contact.name : UNNAMED_ACCOUNT, named, statusLabel: ACCOUNT_STATUS_WORDS[a.status] ?? a.status })),
    namesWithheld: read.state === "WITHHELD" ? read.words.en : null,
    manageHref,
    noContractor: false,
  };
}

// ------------------------------------------------------------------ portal: the organisation's side, by name and office

export interface PortalTeamMember {
  name: string;
  /// The office as the organisation configures it ("Superintending Officer", "Acting: ..."), or the representative's kind ("Principal Representative").
  office: string;
}

export interface PortalTeam {
  members: PortalTeamMember[];
  /// The organisation's day is not known (no time zone is set), so who is in force today is not said.
  dayUnknown: boolean;
}

/**
 * The S.O. and the representatives in force on the organisation's today, for the contractor (PW-16): names and offices only. `ctx` is the contract as this supplier holds it
 * (`loadProjectContext`); a contract it does not hold never reaches here. A representative whose letter was revoked is gone from the day of the revocation.
 */
export async function loadPortalTeam(client: Tx, actor: Pick<SupplierActor, "organisationId">, ctx: ProjectContext): Promise<PortalTeam> {
  const today = ctx.org.today;
  if (!today) return { members: [], dayUnknown: true };
  const l = await loadContract(actor.organisationId, ctx.contract.id, client);
  if (!l) return { members: [], dayUnknown: false };
  const s = await loadSupervision(l.contract.id, client);
  const side = await organisationSideOn(l, s, today, client);
  return { members: side.map((m) => ({ name: m.name, office: m.capacity === "ACTING" ? `Acting: ${m.officeLabel}` : m.officeLabel })), dayUnknown: false };
}
