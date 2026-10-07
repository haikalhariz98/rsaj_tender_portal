import { dayToDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { issueReference, NumberingError } from "@/lib/numbering/issue";
import {
  APPLICATION_LIMITS,
  honeypotTripped,
  HONEYPOT_FIELD,
  portalApplicationFaults,
  portalCapacity,
  PORTAL_APPLICATION_SERIES_KEY,
  portalRefusal,
  type ApplyState,
} from "@/lib/portal/apply";
import { APPLY } from "@/lib/portal/labels";
import { normaliseRegistrationNo } from "@/lib/suppliers/identity";
import { loadSupplierConfig, supplierOrg } from "@/lib/suppliers/repo";
import { FormReader } from "@/lib/validate";

import { stampNow } from "../../suppliers/shared";
import { deploymentOrganisation } from "@/lib/portal/deployment";

const closed = (): ApplyState => ({ ok: false, message: APPLY.notOpenOnSubmit.en });

/// A refusal thrown from inside the transaction, so the reference it took is given back with everything else.
class Turned extends Error {
  constructor(readonly state: ApplyState) {
    super("Turned away");
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A stranger applies to join the supplier register (no sign-in). The application is staged: it is a
 * `PortalApplication`, not a supplier, so it holds no registration number's place on the register,
 * spends no supplier reference, and writes nothing to the audit trail. An officer checks it against
 * the certificate and records the supplier from it, or discards it.
 *
 * Whatever the register holds is never asked here. A number already on the register gets the same
 * reply as any other, so the form cannot be used to find out who is registered; the officer is shown
 * the clash when they record the supplier.
 *
 * It is open only when the organisation has set the applicant notice and both limits. The limits are
 * counted from what has been received (any 24 hours, and for one registration number), under the lock
 * of the application series, so two sends at once cannot both take the last place. No lock is taken
 * on the organisation: staff writes are never made to wait behind a stranger.
 *
 * Only the identity and contact fields are read. A channel, a recorder, a received day or a paper day
 * posted by hand is ignored: they are not this form's to say (OD-3).
 */
export async function receiveApplication(data: FormData): Promise<ApplyState> {
  // A filled bait field is a script: drop it, create nothing, and say only that it was received.
  if (honeypotTripped(data.get(HONEYPOT_FIELD))) return { ok: true, reference: null };

  const now = stampNow();
  const r = new FormReader(data);
  const t = (name: keyof typeof APPLICATION_LIMITS, label: string) => r.text(name, label, { max: APPLICATION_LIMITS[name] });
  const v = {
    registeredName: t("registeredName", APPLY.fields.registeredName.en),
    registrationNo: t("registrationNo", APPLY.fields.registrationNo.en),
    entityTypeCode: r.optionalText("entityTypeCode"),
    countryCode: r.optionalText("countryCode"),
    registeredAddress: t("registeredAddress", APPLY.fields.registeredAddress.en),
    companyEmail: t("companyEmail", APPLY.fields.companyEmail.en),
  };
  const contact = {
    name: t("contactName", APPLY.fields.contactName.en),
    designation: t("contactDesignation", APPLY.fields.contactDesignation.en),
    email: t("contactEmail", APPLY.fields.contactEmail.en),
    phone: t("contactPhone", APPLY.fields.contactPhone.en),
  };
  if (r.failed) return { ok: false, errors: r.errors, message: APPLY.nothingSent.en };

  try {
    // A public application is to the deployment's one organisation (ADR 0034 D10): nobody is signed in to name one.
    const deployment = await deploymentOrganisation();
    const org = deployment ? await supplierOrg(deployment.id) : null;
    if (!org) return closed();
    const cfg = await loadSupplierConfig(org.id);
    const policy = cfg.policy;
    // The form is open only on a notice in both languages and both limits: nothing is assumed (see whatIsMissing).
    if (!policy?.personalDataNoticeEn?.trim() || !policy.personalDataNoticeMs?.trim() || policy.portalDailyLimit == null || policy.portalDailyLimitPerNumber == null) return closed();

    const faults = portalApplicationFaults({ ...v, contact }, { today: org.today, formatPattern: cfg.format?.pattern ?? null, entityTypeCodes: cfg.liveCodes("ENTITY_TYPE", org.today), countryCodes: cfg.liveCodes("COUNTRY", org.today) });
    const refusal = portalRefusal(faults);
    if (refusal?.closed) return closed();
    if (refusal) return { ok: false, errors: refusal.errors, message: refusal.message };

    const today = org.today!;
    const key = normaliseRegistrationNo(v.registrationNo);
    const limits = { daily: policy.portalDailyLimit, perNumber: policy.portalDailyLimitPerNumber };
    let reference: string | null = null;
    try {
      await db.$transaction(
        async (tx) => {
          // The series row is the lock: issuing takes it, and the counts below are read while it is held.
          const issued = await issueReference(tx, org.id, PORTAL_APPLICATION_SERIES_KEY, dayToDate(today));
          const since = new Date(now.getTime() - DAY_MS);
          const [lastDay, forNumber] = await Promise.all([
            tx.portalApplication.count({ where: { organisationId: org.id, receivedAt: { gte: since } } }),
            tx.portalApplication.count({ where: { organisationId: org.id, registrationNoKey: key, receivedAt: { gte: since } } }),
          ]);
          const capacity = portalCapacity({ lastDay, forNumber }, limits);
          if (capacity === "NOT_SET") throw new Turned(closed());
          // Alike for both limits, so the form never says that this particular number has been sent before.
          if (capacity === "BUSY") throw new Turned({ ok: false, message: APPLY.busy.en });
          await tx.portalApplication.create({
            data: {
              organisationId: org.id,
              reference: issued,
              receivedOn: dayToDate(today),
              receivedAt: now,
              registeredName: v.registeredName,
              registrationNo: v.registrationNo.trim(),
              registrationNoKey: key,
              entityTypeCode: v.entityTypeCode!,
              countryCode: v.countryCode!,
              registeredAddress: v.registeredAddress,
              companyEmail: v.companyEmail,
              contactName: contact.name,
              contactDesignation: contact.designation,
              contactEmail: contact.email,
              contactPhone: contact.phone,
            },
          });
          reference = issued;
        },
        { timeout: 10_000, maxWait: 5_000 },
      );
    } catch (e) {
      if (e instanceof Turned) return e.state;
      if (e instanceof NumberingError) return closed();
      throw e;
    }
    return { ok: true, reference };
  } catch (e) {
    // The applicant is told nothing of the cause; the server's log holds it.
    console.error("Public supplier application failed", e);
    return { ok: false, message: APPLY.tryAgainLater.en };
  }
}
