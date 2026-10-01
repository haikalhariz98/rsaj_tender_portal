import type { MalwareScanner } from "./types";

/// The scanner this build ships: none. Every file is NOT_SCANNED and the screens say so (OD-4).
export const NotConfiguredScanner: MalwareScanner = {
  configured: false,
  async scan() {
    return "NOT_SCANNED";
  },
};
