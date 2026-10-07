/**
 * What the sign-in screens say, in both languages. The screens render English; the Malay is kept beside it, as the committee and
 * schedule words are, so that the day the interface is switched nothing is missing. Words only: no code, setting key or enum value reaches a screen.
 */

export interface Words {
  en: string;
  ms: string;
}

export const AUTH_WORDS = {
  signInFailed: { en: "Sign-in failed. Check the sign-in name and the password and try again.", ms: "Log masuk gagal. Semak nama log masuk dan kata laluan, kemudian cuba lagi." },
  sessionLimit: {
    en: "This account is already signed in on as many devices as are allowed. Sign out of one of them, then try again.",
    ms: "Akaun ini sudah log masuk pada bilangan peranti maksimum yang dibenarkan. Log keluar daripada salah satu, kemudian cuba lagi.",
  },
  notConfigured: { en: "This copy has no organisation set up yet, so nobody can sign in.", ms: "Salinan ini belum mempunyai organisasi, jadi tiada sesiapa boleh log masuk." },
  noAdministrator: {
    en: "No administrator yet. An operator creates the first one on the server with: npm run auth:bootstrap",
    ms: "Belum ada pentadbir. Operator mencipta yang pertama di pelayan dengan: npm run auth:bootstrap",
  },
  unsafeDatabaseRole: {
    en: "Sign-in is closed: this copy is connected to its database with too much authority. Tell the operator.",
    ms: "Log masuk ditutup: salinan ini disambungkan ke pangkalan datanya dengan kuasa yang terlalu luas. Maklumkan kepada operator.",
  },
  policyNotSet: { en: "Sign-in is closed until the organisation sets", ms: "Log masuk ditutup sehingga organisasi menetapkan" },
  policyNotSetHow: {
    en: "These are the organisation's own to choose. The operator sets them when creating the first administrator.",
    ms: "Ini ialah pilihan organisasi sendiri. Operator menetapkannya semasa mencipta pentadbir pertama.",
  },
  codeFailed: {
    en: "That did not work. Check the sign-in name and the code, and that the code has not been used or expired. If it still fails, ask the person who gave it to you.",
    ms: "Itu tidak berjaya. Semak nama log masuk dan kod, dan pastikan kod belum digunakan atau tamat tempoh. Jika masih gagal, tanya orang yang memberikannya.",
  },
  codeUsed: { en: "Your password is set. Sign in with it.", ms: "Kata laluan anda telah ditetapkan. Log masuk dengannya." },
  passwordChanged: { en: "Your password is changed. Every other sign-in of yours has ended.", ms: "Kata laluan anda telah ditukar. Semua log masuk anda yang lain telah ditamatkan." },
  signedOutEverywhere: { en: "You are signed out everywhere, this device included.", ms: "Anda telah log keluar di mana-mana, termasuk peranti ini." },
  notSignedIn: { en: "You are not signed in.", ms: "Anda belum log masuk." },
  wrongOrigin: { en: "That request did not come from this site, so it was refused.", ms: "Permintaan itu tidak datang daripada laman ini, jadi ia ditolak." },
  resetNoticeTitle: { en: "Your password was reset", ms: "Kata laluan anda telah ditetapkan semula" },
  resetNoticeBody: {
    en: "This account's password was reset by someone else: with a one-time code from an administrator, or by an operator on the server. If that was not you, or you did not ask for it, tell an administrator now.",
    ms: "Kata laluan akaun ini telah ditetapkan semula oleh orang lain: dengan kod sekali guna daripada pentadbir, atau oleh operator di pelayan. Jika itu bukan anda, atau anda tidak memintanya, beritahu pentadbir sekarang.",
  },
  mustChangeTitle: { en: "Choose a new password", ms: "Pilih kata laluan baharu" },
  mustChangeBody: { en: "This account must have a new password before anything else is done with it.", ms: "Akaun ini mesti mempunyai kata laluan baharu sebelum apa-apa dilakukan." },
  previousTitle: { en: "Your last sign-in", ms: "Log masuk terakhir anda" },
  previousFirst: { en: "This is the first time this account has signed in.", ms: "Ini kali pertama akaun ini log masuk." },
  addressUnknown: { en: "address not known", ms: "alamat tidak diketahui" },
  noFailures: { en: "Nobody has tried and failed to sign in to your account since.", ms: "Tiada sesiapa cuba dan gagal log masuk ke akaun anda sejak itu." },
  secondFactorNotBuilt: {
    en: "Second sign-in step not built — approvers sign in with a password only (NFR-SEC-005 not met).",
    ms: "Langkah log masuk kedua belum dibina — pelulus log masuk dengan kata laluan sahaja (NFR-SEC-005 tidak dipenuhi).",
  },
  addressesNotRecorded: {
    en: "Source addresses are not recorded: this copy has not been told how many proxies sit in front of it, so a request's address cannot be trusted. The limit on failed sign-ins from one address is therefore not applied, and only the lock on each account holds back guessing, until it is set.",
    ms: "Alamat sumber tidak direkodkan: salinan ini belum diberitahu bilangan proksi di hadapannya, jadi alamat permintaan tidak boleh dipercayai. Had log masuk gagal dari satu alamat itu tidak dikenakan, dan hanya kunci pada setiap akaun yang menyekat tekaan, sehingga ia ditetapkan.",
  },
} as const satisfies Record<string, Words>;

/// A sign-in account's standing, in words, wherever it is shown: the accounts screen, History and the audit export. A code never reaches a screen.
export const ACCOUNT_STATUS_WORDS: Readonly<Record<string, string>> = { ACTIVE: "Active", PENDING_ACTIVATION: "Waiting for activation", DISABLED: "Disabled" };
