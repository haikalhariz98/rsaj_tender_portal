import type { NextConfig } from "next";

import { allowedOriginsOrThrow } from "./src/lib/auth/allowed-origins";
import { headerRules } from "./src/lib/security-headers";

/**
 * `serverActions.allowedOrigins`: the extra origins a server action may be called from (Phase 1b, threat model F9). Next compares a server action's Origin with
 * the Host it was sent to and refuses a mismatch; behind a reverse proxy that rewrites the host the two differ, and the proxy's public host has to be named here
 * or every form is refused. Deployment configuration, not customer policy: `SERVER_ACTION_ALLOWED_ORIGINS`, a comma-separated list of EXACT hosts
 * (`perolehan.example.org`). The product's own guard on the sign-in and account actions (`refuseForeignPost`) reads the same list through the same parser.
 * A pattern (`*.example.org`) is refused and the server does not start: Next would accept it for every server action, and a sibling subdomain is the same site.
 * Unset: none beyond the request's own host, which is right for a copy with no proxy in front of it and for development.
 */
const allowedOrigins = allowedOriginsOrThrow(process.env.SERVER_ACTION_ALLOWED_ORIGINS);

const nextConfig: NextConfig = {
  async headers() {
    return headerRules();
  },
  experimental: {
    serverActions: {
      // Next reads and parses a Server Action's whole body before the action runs, and
      // refuses one over this limit with its own error. The largest body any action
      // takes is a logo upload, capped at 512 KB (src/lib/organisation/logo-limits.ts):
      // this leaves room for the multipart overhead so a logo up to that cap reaches
      // the action, whose own check refuses one between 512 KB and here with a clear
      // message. Anything larger is stopped by the form before it is sent.
      bodySizeLimit: "600kb",
      allowedOrigins,
    },
  },
};

export default nextConfig;
