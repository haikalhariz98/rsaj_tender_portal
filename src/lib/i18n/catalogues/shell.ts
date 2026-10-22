/**
 * The frame's own words (NFR-LNG-001, ADR 0040): the navigation, the breadcrumb, the top bar and the user menu. The Malay is drafted in the
 * N1 slice and not yet reviewed by the customer. Navigation labels sit with the navigation (`@/lib/nav`) and are gathered here for review.
 */

import { w, type Words } from "@/lib/contract/labels";
import { CONFIG_LABELS } from "@/lib/nav";


/** The words the sidebar, top bar and user menu write themselves. */
export const SHELL_WORDS = {
  backToDashboard: w("Back to dashboard"),
  configuration: w("Configuration"),
  viewingAs: w("Viewing as"),
  switchWorkspace: w("Switch workspace"),
  switchWorkspaceButton: w("Switch workspace"),
  supplierPortal: w("Supplier portal"),
  openNavigation: w("Open navigation"),
  closeNavigation: w("Close navigation"),
  soon: w("soon"),
  search: w("Search"),
  searchNotBuilt: w("Search is not built yet"),
  helpNotBuilt: w("Help is not built yet"),
  help: w("Help"),
  breadcrumb: w("Breadcrumb"),
  notifications: w("Notifications"),
  supplierNoticesNotBuilt: w("Notices to suppliers are not built yet"),
  inbox: w("Inbox"),
  inboxUnread: w("Inbox, with unread notices"),
  unreadNotices: w("You have unread notices"),
  yourInbox: w("Your inbox"),
  signIn: w("Sign in"),
  home: w("Home"),
  dashboard: w("Dashboard"),
  yourAccount: w("Your account"),
  signOut: w("Sign out"),
  userMenu: w("Account menu"),
} as const satisfies Record<string, Words>;

/// Path segment to the label the breadcrumb should read. A segment that only names a Configuration section takes its word from the rail
/// (`CONFIG_LABELS`), so the two cannot split; the key is still needed here, because a key is how a known section word is told from a record's key.
export const SEGMENT_LABEL: Readonly<Record<string, Words>> = {
  configuration: w("Configuration"),
  "approval-matrix": CONFIG_LABELS["approval-matrix"],
  committees: w("Committees"),
  organisation: CONFIG_LABELS["organisation"],
  users: CONFIG_LABELS["users"],
  budget: CONFIG_LABELS["budget"],
  numbering: CONFIG_LABELS["numbering"],
  templates: CONFIG_LABELS["templates"],
  "routing-sheets": CONFIG_LABELS["routing-sheets"],
  "reference-data": CONFIG_LABELS["reference-data"],
  "tender-documents": CONFIG_LABELS["tender-documents"],
  invitation: CONFIG_LABELS["invitation"],
  appendix: w("Appendix"),
  notifications: CONFIG_LABELS["notifications"],
  accounts: CONFIG_LABELS["accounts"],
  security: CONFIG_LABELS["security"],
  changes: CONFIG_LABELS["changes"],
  sourcing: w("Sourcing"),
  projects: w("Contracts"),
  suppliers: w("Suppliers"),
  documents: w("Documents"),
  requisitions: w("Requisitions"),
  awards: w("Awards"),
  securities: w("Securities"),
  approvals: w("My approvals"),
  inbox: w("Inbox"),
  account: w("Your account"),
  welcome: w("Welcome"),
  "sign-in": w("Sign in"),
  audit: CONFIG_LABELS["audit"],
  print: w("Print"),
  // Short: the crumb shares the bar with search. The page title says the rest.
  receive: w("Receive"),
  supplier: w("Supplier portal"),
  opportunities: w("Opportunities"),
  bids: w("My Bids"),
  company: w("Company"),
  // Phase 4e (FR-VND-014): the supplier portal's announcements board.
  announcements: w("Announcements"),
  // Phase 4d: the Tender Table Document a supplier inspects, under one exercise of My Bids.
  "table-document": w("Tender Table Document"),
  // Wave 3a (SR-10): the payment page of a document purchase, under one exercise of My Bids.
  pay: w("Payment"),
  // Wave 3b (SR-13, step 11): the page an online bid is submitted on, under one exercise of My Bids.
  submit: w("Submit a bid"),
};

/// What a record under a section is called, for its breadcrumb.
export const RECORD_LABEL: Readonly<Record<string, Words>> = {
  committees: w("Committee"),
  requisitions: w("Requisition"),
  awards: w("Award"),
  // 6.15a: a supplier on the register; the page names it (RecordCrumb).
  suppliers: w("Supplier"),
  // 6.14: a contract, a certificate under it, a form and a routing sheet type; each page names its record.
  projects: w("Contract"),
  certificates: w("Certificate"),
  // 6.13 Part A step 4: a variation under its contract.
  variations: w("Variation"),
  // The simple Project workspace: a document under its contract.
  documents: w("Document"),
  templates: w("Template"),
  "routing-sheets": w("Routing sheet type"),
  sourcing: w("Exercise"),
  // The public portal: an advertised opportunity; the page names it by its reference (RecordCrumb).
  opportunities: w("Opportunity"),
  // Phase 4d: one exercise in My Bids; the page names it by its reference (RecordCrumb).
  bids: w("Exercise"),
  online: w("Online application"),
  // Phase 5a (ruling item 9): an item of the inbox that asks for a signature, a back-dated signature to confirm.
  inbox: w("Back-dated signature"),
  evaluation: w("Evaluation model"),
  label: w("Sale label"),
};

/// Segments whose label depends on where they sit.
export const NESTED_LABEL: Readonly<Record<string, Words>> = {
  // Every Configuration section, named as the rail names it. Under Configuration "requisitions" is Requisition controls, not the requisitions list.
  ...Object.fromEntries(Object.entries(CONFIG_LABELS).map(([slug, label]) => [`configuration/${slug}`, label])),
  // The sign-in screens, shown without the frame but named for the breadcrumb test.
  "sign-in/code": w("Use a code"),
  "requisitions/new": w("New requisition"),
  "projects/new": w("New award"),
  // 6.15a: the register's configuration, and recording a paper application.
  "suppliers/new": w("New application"),
  // Online applications waiting for an officer: the list is the Online tab, one application sits under it.
  "suppliers/online": w("Online applications"),
  // 6.14 residual: every page names its crumbs (crumbs.test.ts walks every page).
  "sourcing/new": w("New exercise"),
  "evaluation/report": w("Evaluation report"),
  "evaluation/proposal": w("Proposal paper"),
  // The supplier portal's own words, where a segment is also a staff section's name ("projects" is Contracts there).
  "supplier/projects": w("My Projects"),
  "supplier/results": w("Results"),
  "supplier/register": w("Register as a supplier"),
  // Phase 4b: a signed-in supplier completing its registration.
  "supplier/registration": w("Registration"),
  // N2: the supplier's own data page. English in both slots (founder 2026-10-19: no Malay is added).
  "account/data": w("Your data"),
  // Phase 4a: a supplier activating the account an officer opened, and setting a new password with a reset code.
  "supplier/activate": w("Activate your account"),
  "supplier/reset": w("Set a new password"),
};

/// The crumbs `crumbTrail` writes itself, outside the three tables above.
export const CRUMB_WORDS = {
  committeeSittings: w("Committee sittings"),
  sitting: w("Sitting"),
  edit: w("Edit"),
  details: w("Details"),
  print: w("Print"),
  contracts: w("Contracts"),
  tenderDocuments: w("Tender documents"),
  exercise: w("Exercise"),
  evaluation: w("Evaluation"),
  sales: w("Sales"),
  bidOpening: w("Bid opening"),
  saleLabel: w("Sale label"),
  documents: w("Documents"),
  variations: w("Variations"),
  submissions: w("Submissions"),
} as const satisfies Record<string, Words>;

