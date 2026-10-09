/**
 * The contracts of sign-in (ADR 0034). Types only: nothing here runs.
 *
 * Amended from the ADR's first draft: there is no `assurance` on a session and no `stepUpWindowSeconds`. The password
 * is asked again at every signature-class act, and a second sign-in factor, when the founder authorises one, attaches
 * at that same step.
 */

/// The closed list of product permissions. Product vocabulary, not policy: which role holds which is configuration
/// (Phase 2a, `permissions.ts`): no row is undecided, which is refused. The administrator flag grants only what ADR D8 says it does.
export type PermissionKey =
  | "accounts.manage"
  | "security.policy"
  | "permissions.grant"
  | "configuration.draft"
  | "configuration.issue"
  | "audit.read"
  | "supplierAccounts.manage"
  | "sulit.read.organisation"
  | "sulit.read.creditorProfile"
  | "acts.recordOnBehalf"
  | "sourcing.participants.manage"
  | "announcements.publish"
  | "corrections.decide";

export interface Office {
  roleCode: string;
  scope: string | null;
}

export interface StaffActor {
  kind: "STAFF";
  accountId: string;
  sessionId: string;
  personId: string;
  personName: string;
  /// The person's job title as recorded, for the shell. Null where none is.
  jobTitle: string | null;
  isAdministrator: boolean;
  organisationId: string;
  organisationCode: string;
  organisationTimeZone: string | null;
  /// The roles the person holds on the organisation's today. Empty where no zone is set (today is not known).
  offices: readonly Office[];
  /// What the person holds (`resolvePermissions`, Phase 2a): read on every request. A permission nobody has decided is refused. A loader run holds none.
  permissions: ReadonlySet<PermissionKey>;
  stepUpAt: Date | null;
  /// When this session began: the sign-in that made it, for "your previous sign-in" to be the one before.
  sessionCreatedAt: Date;
  sourceAddress: string | null;
  /// The account must choose a new password before anything else (it was reset or created with a temporary one).
  mustChangePassword: boolean;
  /// Set only for a loader run (the demo loaders call the product's own acts outside any request, with no sign-in): the acts then write their audit
  /// rows as this system actor. Never set for a request, and nothing a request carries can set it (see `src/app/_auth/loader.ts`).
  system?: { label: string };
}

/// A supplier contact, signed in to the portal (ADR 0034 D2). `supplierId` is the supplier the account belongs to and is read ONLY from the session: a supplier route never
/// takes one from the request (a source scan holds it to that), and another supplier's record answers "not found".
export interface SupplierActor {
  kind: "SUPPLIER";
  accountId: string;
  sessionId: string;
  contactId: string;
  /// Who is signed in, as the supplier named them: the contact's name. Shown to that contact on their own pages (never another's).
  displayName: string;
  supplierId: string;
  supplierName: string;
  loginName: string;
  organisationId: string;
  organisationTimeZone: string | null;
  stepUpAt: Date | null;
  /// When this session began: the sign-in that made it, for "your previous sign-in" to be the one before.
  sessionCreatedAt: Date;
  sourceAddress: string | null;
  /// The account must choose a new password before anything else (it was reset or created with a temporary one).
  mustChangePassword: boolean;
  /// A reset was done to this account and has not been acknowledged.
  resetNoticePending: boolean;
}

export type AuditActor =
  /// `sessionId` is null where the act is the account holder's own but no session exists yet: using a one-time code.
  | { kind: "STAFF"; personId: string; sessionId: string | null; offices: readonly Office[]; sourceAddress: string | null }
  | { kind: "SUPPLIER"; supplierAccountId: string; sessionId: string | null; sourceAddress: string | null }
  | { kind: "SYSTEM"; label: string };

/// The settings of an organisation's `SecurityPolicy`, each null while the customer has not decided. Nothing has a default.
export interface SecurityPolicyValues {
  staffIdleMinutes: number | null;
  staffAbsoluteMinutes: number | null;
  supplierIdleMinutes: number | null;
  supplierAbsoluteMinutes: number | null;
  maxConcurrentSessions: number | null;
  concurrentSessionAction: "REVOKE_OLDEST" | "REFUSE_NEW" | null;
  maxFailedAttempts: number | null;
  lockoutMinutes: number | null;
  addressThrottleAttempts: number | null;
  addressThrottleMinutes: number | null;
  passwordMinLength: number | null;
  resetCodeValidityMinutes: number | null;
  paperSignatureRecording: "ALLOWED" | "REFUSED" | null;
  signInDetailRetentionDays: number | null;
}

export type SecurityPolicyKey = keyof SecurityPolicyValues;

/// A fault found while checking an input, in both languages. `code` is for code to branch on, never shown.
export interface Fault {
  code: string;
  en: string;
  ms: string;
}
