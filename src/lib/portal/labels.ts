/**
 * The public supplier portal's words, in English and Malay. Screens render `.en` today (there is no
 * language toggle); the Malay line is kept beside it so the bilingual pass needs no rewording.
 *
 * Nothing here is policy. Where a figure, a place or a time varies (the fee, where to buy, where to
 * submit, the closing time), the words point at the notice, which carries what the organisation set.
 */

import { w, type Words } from "@/lib/contract/labels";

export type { Words };

/// The portal's routes, so a link is written once.
export const PORTAL_PATH = {
  home: "/supplier",
  opportunities: "/supplier/opportunities",
  results: "/supplier/results",
  register: "/supplier/register",
  bids: "/supplier/bids",
  projects: "/supplier/projects",
  company: "/supplier/company",
  announcements: "/supplier/announcements",
} as const;

export const HOME_TITLE = w("Supplier portal");

export const homeSubtitle = (organisation: string): Words =>
  w(`Tenders and quotations from ${organisation}`);

export const OPEN_ACCESS_NOTE = w(
  "No account needed to read opportunities or to apply.",
);

export interface HomeLink {
  key: "opportunities" | "results" | "register";
  href: string;
  title: Words;
  text: Words;
  action: Words;
}

export const HOME_LINKS: readonly HomeLink[] = [
  {
    key: "opportunities",
    href: PORTAL_PATH.opportunities,
    title: w("Opportunities"),
    text: w(
      "Open tenders and quotations.",
    ),
    action: w("View opportunities"),
  },
  {
    key: "results",
    href: PORTAL_PATH.results,
    title: w("Results"),
    text: w(
      "Awarded exercises and who won.",
    ),
    action: w("View results"),
  },
  {
    key: "register",
    href: PORTAL_PATH.register,
    title: w("Register as a supplier"),
    text: w(
      "Apply to join the supplier register.",
    ),
    action: w("Apply to register"),
  },
];

export const TAKE_PART_TITLE = w("How to take part");
export const TAKE_PART_SUBTITLE = w(
  "The same steps for every opportunity.",
);

export const TAKE_PART_STEPS: readonly { title: Words; text: Words }[] = [
  {
    title: w("Check you qualify"),
    text: w(
      "Check the registrations it asks for. Not registered? Apply first.",
    ),
  },
  {
    title: w("Buy the documents"),
    text: w(
      "Buy them where and when the opportunity states.",
    ),
  },
  {
    title: w("Attend any briefing, and read the addenda"),
    text: w(
      "Note any briefing or site visit. Read the addenda.",
    ),
  },
  {
    title: w("Submit your bid on paper"),
    text: w(
      "Hand in a sealed bid at the stated place before the closing.",
    ),
  },
];

export const SIGN_IN_TITLE = w("Arrives with sign-in");
export const SIGN_IN_SUBTITLE = w(
  "These wait for sign-in.",
);

// Phase 4e: My Projects and the announcements board are built, so nothing is left arriving with sign-in. The list stays (empty) so the home page and the navigation test keep one source.
export const SIGN_IN_ITEMS: readonly { href: string; title: Words; text: Words }[] = [];

/// The parts of the portal a supplier signs in for, each built: the home page lists them, and each sends a visitor who is not signed in to the sign-in page.
export const SIGNED_IN_TITLE = w("With sign-in");
export const SIGNED_IN_SUBTITLE = w("Sign in with your company's account to reach these.");
export const SIGNED_IN_LINKS: readonly { key: "bids" | "projects" | "company" | "announcements"; href: string; title: Words; text: Words }[] = [
  { key: "bids", href: PORTAL_PATH.bids, title: w("My Bids"), text: w("Your exercises and notices.") },
  { key: "projects", href: PORTAL_PATH.projects, title: w("My Projects"), text: w("Your contracts: diary, claims, certificates.") },
  { key: "company", href: PORTAL_PATH.company, title: w("Company"), text: w("Your registration, documents, bank details and eligibility.") },
  { key: "announcements", href: PORTAL_PATH.announcements, title: w("Announcements"), text: w("Notices from the procurement office.") },
];

export const SIGN_IN_REASON = w(
  "Sign in to reach this part of the portal.",
);
export const SIGN_IN_BADGE = w("Arrives with sign-in");
export const BACK_TO_PORTAL = w("Back to the supplier portal");

/* Opportunities (the public board and an opportunity's page) */

export const OPPORTUNITIES_TITLE = w("Opportunities");
export const opportunitiesSubtitle = (organisation: string): Words =>
  w(`Advertised by ${organisation}`);
export const OPPORTUNITIES_INFO = w(
  "Only advertised exercises are listed. Exercises that invite named suppliers are not shown. Awarded ones move to Results.",
);

export type OpportunityStateKey = "OPEN" | "CLOSED" | "AWARDED" | "CANCELLED";

export const OPPORTUNITY_STATE: Record<OpportunityStateKey, { label: Words; tone: "ok" | "warn" | "err" | "info" | "brand" | undefined }> = {
  OPEN: { label: w("Open"), tone: "brand" },
  CLOSED: { label: w("Closed"), tone: undefined },
  AWARDED: { label: w("Awarded"), tone: "ok" },
  CANCELLED: { label: w("Cancelled"), tone: "warn" },
};

export const OPPORTUNITY_VIEWS: Record<"open" | "closed" | "cancelled", { label: Words; emptyTitle: Words }> = {
  open: {
    label: w("Open"),
    emptyTitle: w("Nothing open now"),
  },
  closed: {
    label: w("Closed"),
    emptyTitle: w("Nothing closed yet"),
  },
  cancelled: {
    label: w("Cancelled"),
    emptyTitle: w("Nothing cancelled"),
  },
};

export const OPPORTUNITY_COLUMNS = {
  opportunity: w("Opportunity"),
  method: w("Method"),
  closing: w("Closing"),
  status: w("Status"),
};
export const OPPORTUNITIES_SEARCH = w("Search by title or reference");
export const OPPORTUNITIES_ALL_TITLE = w("Advertised opportunities");
export const OPPORTUNITIES_ALL_SUBTITLE = w(
  "Open ones by soonest closing.",
);
export const openCount = (n: number): Words => w(`${n} open`);
export const OPEN_ROW_ACTION = w("View");
export const NOT_SET_UP = {
  title: w("Opportunities are not available yet"),
  body: w(
    "Not set up in the system. Contact the procurement office.",
  ),
};
export const METHOD_NOT_STATED = w("Method not stated");

export const DETAIL = {
  back: w("Back to opportunities"),
  atAGlance: w("At a glance"),
  reference: w("Reference"),
  method: w("Method"),
  closing: w("Closing date and time"),
  closingFact: (when: string): Words => w(`Closing date and time: ${when}`),
  saleDays: (from: string, until: string): Words => w(`${from} to ${until}`),
  closingNote: w("Hand in before this time."),
  submissionPlace: w("Where to hand in your bid"),
  notStated: w("Not stated"),
  documents: w("Buying the documents"),
  documentsSubtitle: w("Cost, place and dates."),
  fee: w("Fee"),
  feeNotStated: w("The fee is not stated. Ask the procurement office."),
  buyAt: w("Buy at"),
  howToBuy: w("How to buy"),
  boughtOnline: w("Online. Sign in and open My Bids."),
  onSale: w("On sale"),
  payBy: w("Ways to pay"),
  inspect: w("Inspect the documents at"),
  hours: w("Hours"),
  briefings: w("Briefings and site visits"),
  briefingsSubtitle: w("Dates and places to note."),
  noBriefings: w("No briefing or site visit listed."),
  mandatory: w("You must attend"),
  cancelledEvent: w("Cancelled"),
  whoMayBid: w("Who may bid"),
  whoMayBidSubtitle: w("The registrations a bidder must hold."),
  holdIntro: w("A bidder must hold:"),
  holdOneOf: w("One of"),
  noRegistrations: w("No registration is stated for this opportunity."),
  restrictionTitle: w("Restriction on bidders"),
  restrictionFallback: w("Restricted bidders only. See the notice."),
  addenda: w("Addenda"),
  addendaSubtitle: w("Read before you bid."),
  noAddenda: w("No addenda issued."),
  addendumNumber: (n: number | null): Words => (n == null ? w("Addendum") : w(`Addendum ${n}`)),
  issuedOn: (day: string): Words => w(`Issued ${day}`),
  newClosing: (when: string): Words => w(`New closing: ${when}`),
  notice: w("The notice"),
  noticeSubtitle: w("The advertisement as it was published."),
  readNotice: w("Read the notice"),
  noNotice: w("The published notice is not available."),
  paperOnly: w("Bids are handed in on paper."),
};

export type SaleStateKey = "NOT_YET" | "OPEN" | "ENDED";

export const SALE_STATE: Record<SaleStateKey, Words> = {
  NOT_YET: w("Sale has not opened yet"),
  OPEN: w("On sale now"),
  ENDED: w("Sale ended. Bids accepted until the closing."),
};

export const STATE_BANNER: Record<"CLOSED" | "AWARDED" | "CANCELLED", { title: Words; text: (when: string | null) => Words }> = {
  CLOSED: {
    title: w("This opportunity has closed"),
    text: () => w("Bids are no longer accepted."),
  },
  AWARDED: {
    title: w("This opportunity has been awarded"),
    text: () => w("See Results for the winner."),
  },
  CANCELLED: {
    title: w("This opportunity has been cancelled"),
    text: (when) => (when ? w(`It was cancelled on ${when}. Bids are not accepted.`) : w("Bids are not accepted.")),
  },
};

export const SITE_EVENT_KIND_WORDS: Record<"BRIEFING" | "SITE_VISIT", Words> = {
  BRIEFING: w("Briefing"),
  SITE_VISIT: w("Site visit"),
};

/* Results (the public list of awarded exercises) */

export const RESULTS = {
  title: w("Results"),
  subtitle: (organisation: string): Words => w(`Awarded by ${organisation}`),
  info: w(
    "Only advertised exercises that were awarded are listed. Exercises that invited named suppliers are not shown.",
  ),
  valueNotPublished: w("The awarded value is not published."),
  listTitle: w("Awarded exercises"),
  listSubtitle: w("Latest first."),
  search: w("Search by title, reference or awardee"),
  columns: {
    exercise: w("Opportunity"),
    awardee: w("Awarded to"),
    awardedOn: w("Awarded on"),
    method: w("Method"),
    value: w("Awarded value"),
  },
  awardeeNotStated: w("Not stated"),
  emptyTitle: w("No awards to show yet"),
  count: (n: number): Words => w(n === 1 ? "1 award" : `${n} awards`),
  viewResults: w("View results"),
  viewOpportunities: w("View opportunities"),
  notSetUp: {
    title: w("Results are not available yet"),
    body: w(
      "Not set up in the system. Contact the procurement office.",
    ),
  },
};

// ------------------------------------------------------------------ registration application

/// The public application form's words. The duplicate wording never says who holds a number.
export const APPLY = {
  title: w("Register as a supplier"),
  subtitle: (organisation: string): Words => w(`Supplier register of ${organisation}`),
  info: w(
    "Sending this form does not register your company. The procurement office reviews every application.",
  ),
  backToHome: w("Back to the supplier portal"),
  beforeTitle: w("Before you start"),
  beforeItems: [
    w("Registered name, registration number, date incorporated and address, as on the certificate."),
    w("A contact person: a name, and an email or mobile number."),
    w("Nothing is uploaded here. No bank details are asked."),
    w(
      "Contact details are never shown. If awarded, your company's registered name appears on Results.",
    ),
  ] satisfies Words[],
  companyTitle: w("The company"),
  companySubtitle: w("As its registration certificate states it."),
  addressTitle: w("Registered address"),
  addressSubtitle: w("As its registration certificate states it."),
  contactTitle: w("Who we can reach"),
  contactSubtitle: w("A person at the company. This is not a sign-in."),
  fields: {
    registeredName: w("Registered name"),
    registrationNo: w("Registration number"),
    entityType: w("Type of company"),
    country: w("Country"),
    companyEmail: w("Company email"),
    registeredAddress: w("Registered address"),
    addressLine1: w("Street address"),
    addressLine2: w("Street address, second line"),
    city: w("City"),
    postcode: w("Postcode"),
    state: w("State"),
    incorporatedOn: w("Date incorporated"),
    bumiputeraClaim: w("Bumiputera status (declared)"),
    contactName: w("Name"),
    contactDesignation: w("Position"),
    contactEmail: w("Email"),
    contactPhone: w("Telephone"),
    contactMobile: w("Mobile number"),
  },
  bumiputeraHint: w("Declared. Checked against the certificate you send later. Leave blank if none."),
  incorporatedHint: w("As on the certificate."),
  mobileHint: (dialCode: string | null): Words => (dialCode ? w(`Without the ${dialCode}, which is added for you.`) : w("With the country code if it is not local.")),
  reachHintBoth: w("Give both an email address and a mobile number."),
  emailNotVerifiedHint: w("Not emailed. The address is not checked."),
  choose: w("Choose"),
  reachHint: w("Give an email or a telephone number, or both."),
  numberFormatHint: (example: string): Words => w(`For example ${example}.`),
  // SR-01 (R1): step 1 of five is sent for checking; the other four open once the office has checked the company.
  submit: w("Send for checking"),
  laterSteps: (organisation: string): Words => w(`Steps 2 to 5 open after ${organisation} has checked the company.`),
  stepsLabel: w("Registration steps"),
  /// Under the steps on the public form, where nothing has been accepted yet: step 1 is what is being sent, the rest wait on the office's check.
  stepSubFirst: w("Sent for checking"),
  stepSubLater: w("After the company is checked"),
  sending: w("Sending…"),
  cantAccept: w("Nothing was sent. Check each field, or contact the procurement office."),
  nothingSent: w("Nothing was sent. Check the fields marked below and send it again."),
  tooLong: (label: string, max: number): Words => w(`${label} must be ${max} characters or fewer.`),
  closedTitle: w("Online applications are not open yet"),
  closedBody: w(
    "Not set up yet. Come back later or ask the office.",
  ),
  noOrganisation: w("Not set up in the system. Contact the procurement office."),
  closedMissing: w("Still to be set up:"),
  notOpenOnSubmit: w("Online applications are not open yet, so nothing was sent."),
  tryAgainLater: w("Something went wrong. Nothing was sent. Try again in a few minutes."),
  sentTitle: w("Your application was sent"),
  sentNoReference: w("Your application was received."),
  referenceLabel: w("Your reference"),
  keepReference: w(
    "Write this reference down. Quote it when you contact the procurement office.",
  ),
  nextTitle: w("What happens next"),
  nextItems: [
    w("The procurement office reviews your application."),
    w(
      "Once accepted, you complete your registration online: documents, bank details and declarations. Quote your reference with any question.",
    ),
    w(
      "The office then opens an account and hands your contact a one-time code. Not emailed.",
    ),
    w("Applying does not register your company or invite it to bid."),
  ] satisfies Words[],
  officeNoticeTitle: w("A note from the procurement office"),
  /// Every blocking fault the public form can show.
  faults: {
    NAME_REQUIRED: w("Enter the company's registered name."),
    REGISTRATION_NO_REQUIRED: w("Enter the company's registration number."),
    FORMAT_MISMATCH: w("Not in the expected form. Check it against the certificate."),
    ENTITY_TYPE_REQUIRED: w("Choose the type of company."),
    ENTITY_TYPE_NOT_LISTED: w("Choose one of the types of company in the list."),
    COUNTRY_REQUIRED: w("Choose the country."),
    COUNTRY_NOT_LISTED: w("Choose one of the countries in the list."),
    ADDRESS_LINE_REQUIRED: w("Enter the street address."),
    CITY_REQUIRED: w("Enter the city."),
    POSTCODE_REQUIRED: w("Enter the postcode."),
    ADDRESS_STATE_REQUIRED: w("Choose the state."),
    ADDRESS_STATE_NOT_LISTED: w("Choose one of the states in the list."),
    BUMIPUTERA_NOT_LISTED: w("Choose one of the options in the list."),
    INCORPORATED_ON_REQUIRED: w("Enter the date the company was incorporated."),
    INCORPORATED_ON_NOT_A_DAY: w("This is not a date. Write it as year, month and day."),
    INCORPORATED_IN_FUTURE: w("The date incorporated cannot be after today."),
    EMAIL_REQUIRED: w("Enter the company's email address."),
    EMAIL_NOT_VALID: w("This email address does not look right."),
    CONTACT_NAME_REQUIRED: w("Enter the name of the person we can reach."),
    CONTACT_REACH_REQUIRED: w("Give an email address or a telephone number for the contact."),
    CONTACT_EMAIL_REQUIRED: w("Give an email address for the contact."),
    CONTACT_PHONE_REQUIRED: w("Give a mobile number for the contact."),
    CONTACT_EMAIL_NOT_VALID: w("The contact's email address does not look right."),
  },
  /// What the register still lacks before it can take an application, in plain words.
  missing: {
    timeZone: w("the office's time zone"),
    entityTypes: w("the types of company"),
    countries: w("the list of countries"),
    states: w("the list of states"),
    numbering: w("the way application references are numbered"),
    notice: w("the notice about how personal details are used"),
    limits: w("how many applications the form takes"),
    formKey: w("the portal's form key"),
  },
  noticeTitle: w("How your details are used"),
  noticeIntro: w("Read this before you send. Sending means you have read it."),
  noticeEnglish: w("In English"),
  // The personal data notice is legal text held in both languages (PDPA); the heading stays. Founder 2026-10-19 removed the Malay UI, not this notice.
  noticeMalay: w("In Malay"),
  formExpired: w("This form is out of date. Nothing was sent. Reload and send again."),
  busy: w("Too many applications right now. Nothing was sent. Try again later."),
};
