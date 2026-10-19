// Every screen of the product now asks who is signed in, so a script that reads the running server needs a session.
//
//   PEROLEHAN_COOKIE="__Host-perolehan-staff=<the token>" node scripts/text-snapshot.mjs <dir>
//
// The token is the value of the cookie a browser holds after signing in (developer tools, Application, Cookies). It is a secret: it is read from
// the environment, never written to a file, and never printed. A script that follows a redirect to sign in has not been signed in, and says so
// rather than quietly recording the sign-in page for every screen.
//
// The supplier portal has its own session. Its screens are read with PEROLEHAN_SUPPLIER_COOKIE="<the supplier cookie's name>=<token>", and `signedInFetch(url, { portal: true })` sends that
// one and no other: a staff cookie is never sent to the portal, and the supplier's never to the staff side. Without it the portal's screens are left out, not crawled signed out.
export async function signedInFetch(url, { portal = false, ...init } = {}) {
  const cookie = process.env[portal ? "PEROLEHAN_SUPPLIER_COOKIE" : "PEROLEHAN_COOKIE"];
  const headers = { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) };
  const res = await fetch(url, { ...init, headers });
  if (res.redirected && /\/sign-in(\?|$)/.test(res.url) && !/\/sign-in(\?|$)/.test(url)) {
    throw new Error(`${url} sent the script to sign in: set ${portal ? "PEROLEHAN_SUPPLIER_COOKIE" : "PEROLEHAN_COOKIE"}="<cookie name>=<token>" from a signed-in session (see scripts/signed-in-fetch.mjs).`);
  }
  return res;
}
