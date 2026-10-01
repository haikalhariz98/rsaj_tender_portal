import type { NextConfig } from "next";

import { headerRules } from "./src/lib/security-headers";

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
    },
  },
};

export default nextConfig;
