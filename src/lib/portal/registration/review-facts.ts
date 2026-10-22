import type { Tx } from "@/lib/audit/record";
import { creditorStanding } from "@/lib/payment/creditor";
import type { FileFacts } from "@/lib/suppliers/review";
import type { ApplicationChannel } from "@/lib/suppliers/types";
import { inOrder } from "@/lib/series";

/**
 * What the officer's approval needs to know of a registration the supplier sent itself (Phase 4b), read for one application: how it came in, the declaration its supplier signed online
 * (the false-declaration acknowledgement, FR-VND-006) and whether the organisation has said that stands in for the paper, and whether the supplier's bank details have been checked
 * (BD-613-44). Judged by `approveFaults`; one reader, so the page that previews an approval and the act that makes it ask the same.
 */
export async function reviewFacts(client: Tx, organisationId: string, supplierId: string, application: { id: string; channel: ApplicationChannel; /** ADR 0041 D6: the whole online application it was approved from, whose agreements stay on it. */ portalApplicationId?: string | null }): Promise<Pick<FileFacts, "channel" | "onlineDeclaration" | "onlineDeclarationReplacesPaper" | "creditorProfile">> {
  const [declaration, policy, profiles] = await inOrder(
    () => client.registrationDeclaration.findFirst({ where: { organisationId, kind: "FALSE_DECLARATION", OR: [{ applicationId: application.id }, ...(application.portalApplicationId ? [{ portalApplicationId: application.portalApplicationId }] : [])] }, select: { signedAt: true } }),
    () => client.supplierPolicy.findUnique({ where: { organisationId }, select: { onlineDeclarationReplacesPaper: true } }),
    () => client.creditorProfile.findMany({ where: { supplierId, organisationId }, select: { version: true, submittedAt: true, verification: true } }));
  const facts = profiles.map((p) => ({ version: p.version, sent: p.submittedAt != null, verification: p.verification as "NOT_CHECKED" | "VERIFIED" | "NOT_IN_ORDER" }));
  return {
    channel: application.channel,
    onlineDeclaration: declaration ? { signedAt: declaration.signedAt.toISOString() } : null,
    onlineDeclarationReplacesPaper: policy?.onlineDeclarationReplacesPaper ?? null,
    creditorProfile: !facts.some((p) => p.sent) ? "NOT_ENTERED" : creditorStanding(facts).state === "IN_FORCE" ? "VERIFIED" : "NOT_VERIFIED",
  };
}
