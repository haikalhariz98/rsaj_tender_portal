/**
 * What the sign-in screens say, in both languages. The screens render English; the Malay is kept beside it, as the committee and
 * schedule words are, so that the day the interface is switched nothing is missing. Words only: no code, setting key or enum value reaches a screen.
 */

export interface Words {
  en: string;
}

export const AUTH_WORDS = {
  signInFailed: { en: "Sign-in failed. Check the sign-in name and the password and try again." },
  sessionLimit: {
    en: "This account is already signed in on as many devices as are allowed. Sign out of one of them, then try again.",
  },
  notConfigured: { en: "This copy has no organisation set up yet, so nobody can sign in." },
  noAdministrator: {
    en: "No administrator yet. An operator creates the first one on the server with: npm run auth:bootstrap",
  },
  unsafeDatabaseRole: {
    en: "Sign-in is closed: this copy is connected to its database with too much authority. Tell the operator.",
  },
  policyNotSet: { en: "Sign-in is closed until the organisation sets" },
  policyNotSetHow: {
    en: "These are the organisation's own to choose. The operator sets them when creating the first administrator.",
  },
  codeFailed: {
    en: "That did not work. Check the sign-in name and the code, and that the code has not been used or expired. If it still fails, ask the person who gave it to you.",
  },
  codeUsed: { en: "Your password is set. Sign in with it." },
  passwordChanged: { en: "Your password is changed. Every other sign-in of yours has ended." },
  signedOutEverywhere: { en: "You are signed out everywhere, this device included." },
  notSignedIn: { en: "You are not signed in." },
  portalFormsClosed: {
    en: "This form is closed: the portal has not been set up to sign its forms. Tell the procurement office.",
  },
  formExpired: { en: "This form is out of date. Reload the page and try again." },
  wrongOrigin: { en: "That request did not come from this site, so it was refused." },
  resetNoticeTitle: { en: "Your password was reset" },
  resetNoticeBody: {
    en: "Someone else reset it. If you did not ask, tell an administrator now.",
  },
  mustChangeTitle: { en: "Choose a new password" },
  mustChangeBody: { en: "Set a new password before anything else." },
  previousTitle: { en: "Your last sign-in" },
  previousFirst: { en: "First sign-in on this account." },
  addressUnknown: { en: "address not known" },
  noFailures: { en: "No failed sign-ins since." },
  secondFactorNotBuilt: {
    en: "Password only. No second sign-in step.",
  },
  addressesNotRecorded: {
    en: "Not recorded. Only each account's lock limits guessing.",
  },
  // The staff sign-in page (founder's mock-up, 2026-10-07). Product wording: nothing here names an organisation.
  welcomeTo: { en: "Welcome to" },
  signInSubtitle: { en: "Sign in to access your account." },
  signInButton: { en: "Sign in" },
  showPassword: { en: "Show password" },
  hidePassword: { en: "Hide password" },
  orDivider: { en: "OR" },
  useCodeTitle: { en: "Use a one-time code" },
  useCodeButton: { en: "Use a one-time code from an administrator" },
  forgotHint: { en: "Forgot your password? Ask an administrator for a one-time code." },
  recordedNote: { en: "Every sign-in and failed attempt is recorded." },
  backToSignIn: { en: "Back to sign in" },
} as const satisfies Record<string, Words>;

/// A sign-in account's standing, in words, wherever it is shown: the accounts screen, History and the audit export. A code never reaches a screen.
export const ACCOUNT_STATUS_WORDS: Readonly<Record<string, string>> = { ACTIVE: "Active", PENDING_ACTIVATION: "Waiting for activation", DISABLED: "Disabled" };
