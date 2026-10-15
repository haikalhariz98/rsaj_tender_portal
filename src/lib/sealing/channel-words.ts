import type { SubmissionChannel } from "@/lib/bids/online/types";

/// How bids are submitted, in words, for a pin or a setting: "Not set" where it is not. Staff words; never a code.
export const channelWords = (c: SubmissionChannel | null): string => (c === "PAPER" ? "On paper, in a sealed envelope" : c === "ONLINE" ? "Online, sealed in the portal" : "Not set");
