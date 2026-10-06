// Every screen of the product now asks who is signed in, so a script that reads the running server needs a session.
//
//   PEROLEHAN_COOKIE="__Host-perolehan-staff=<the token>" node scripts/text-snapshot.mjs <dir>
//
// The token is the value of the cookie a browser holds after signing in (developer tools, Application, Cookies). It is a secret: it is read from
// the environment, never written to a file, and never printed. A script that follows a redirect to sign in has not been signed in, and says so
// rather than quietly recording the sign-in page for every screen.
export async function signedInFetch(url, init = {}) {
  const cookie = process.env.PEROLEHAN_COOKIE;
  const headers = { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) };
  const res = await fetch(url, { ...init, headers });
  if (res.redirected && /\/sign-in(\?|$)/.test(res.url) && !/\/sign-in(\?|$)/.test(url)) {
    throw new Error(`${url} sent the script to sign in: set PEROLEHAN_COOKIE="__Host-perolehan-staff=<token>" from a signed-in session (see scripts/signed-in-fetch.mjs).`);
  }
  return res;
}
