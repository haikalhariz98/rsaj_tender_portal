/// The logo's limits, apart from the byte checks so a client component can read them.
export const LOGO_MAX_BYTES = 512 * 1024;
/// Suggested, not enforced: a logo shorter than this looks soft on a high-density screen.
export const LOGO_SUGGESTED_HEIGHT = 128;

/// The sign-in page's image. A technical limit, the same as the logo's: Next refuses a server action's body over `serverActions.bodySizeLimit` in
/// next.config.ts before the action runs, and that is set just above this. Raising one means raising the other.
export const SIGN_IN_IMAGE_MAX_BYTES = 512 * 1024;
/// Suggested, not enforced: narrower than this looks soft on the left half of a wide screen.
export const SIGN_IN_IMAGE_SUGGESTED_WIDTH = 1600;
