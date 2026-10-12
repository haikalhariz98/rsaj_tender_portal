import type { Tx } from "@/lib/audit/record";
import { effectiveCap } from "@/lib/documents/limits";
import { supplierAcceptedTypes } from "@/lib/documents/media";
import { loadStorePolicy } from "@/lib/documents/service";
import { deploymentCeiling } from "@/lib/documents/store";

import type { RegistrationSettings } from "./context-store";
import type { UploadPolicy, UploadStore } from "./upload";

/**
 * What a signed-in supplier's upload is judged by, read (Phase 4b): the organisation's file types and size and the deployment's ceiling (the smaller wins), and, for each kind of upload,
 * the class it takes and the quota. Each is the customer's, shipped unset: an unset one closes the upload and `uploadSettingFault` names it. One reader, so the page that says "uploads are
 * closed" and the route that refuses one cannot disagree.
 */

export interface UploadSettings {
  store: UploadStore;
  document: UploadPolicy;
  statement: UploadPolicy;
}

export async function loadUploadSettings(client: Tx, organisationId: string, settings: RegistrationSettings): Promise<UploadSettings> {
  const [storePolicy, classes] = await Promise.all([
    loadStorePolicy(organisationId, client),
    client.documentClass.findMany({
      where: { organisationId, id: { in: [settings.policy.supplierUploadClassId, settings.policy.supplierBankStatementClassId].filter((x): x is string => !!x) } },
      select: { id: true, classification: true },
    }),
  ]);
  const cap = effectiveCap(storePolicy, deploymentCeiling());
  const store: UploadStore = { // Ruling 12a: the Office types in the upload rules are staff-only, so a supplier is neither told nor judged by them.
    allowedTypes: supplierAcceptedTypes(storePolicy.allowedMediaTypes), capBytes: "fault" in cap ? null : cap.cap };
  const policyFor = (classId: string | null): UploadPolicy => {
    const cls = classId ? classes.find((c) => c.id === classId) : undefined;
    return { classId: cls ? classId : null, classIsSulit: cls ? cls.classification === "SULIT" : undefined, maxFiles: settings.policy.uploadMaxFilesPerApplication, maxBytes: settings.policy.uploadMaxBytesPerApplication };
  };
  return { store, document: policyFor(settings.policy.supplierUploadClassId), statement: policyFor(settings.policy.supplierBankStatementClassId) };
}
