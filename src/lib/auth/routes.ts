/// Where the sign-in screens send people. In one place so a screen and an action cannot disagree.
export const SIGN_IN_PATH = "/sign-in";
/// The page a person lands on after signing in: the one that shows them their last sign-in (ruling O-2).
export const AFTER_SIGN_IN = "/welcome";
/// Whether a path belongs to the sign-in screens, which are shown without the staff frame (no navigation, no counts).
export const isSignInPath = (pathname: string) => pathname === SIGN_IN_PATH || pathname.startsWith(`${SIGN_IN_PATH}/`);
