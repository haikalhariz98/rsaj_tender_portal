"use server";

import { revalidatePath } from "next/cache";

import { diffFields } from "@/lib/audit/diff";
import { dayToDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { issueReference, NumberingError } from "@/lib/numbering/issue";
import { APPLICATION_LIMITS, honeypotTripped, HONEYPOT_FIELD, portalApplicationFaults, portalRefusal } from "@/lib/portal/apply";
import { APPLY } from "@/lib/portal/labels";
import { SUPPLIER_ENTITY } from "@/lib/suppliers/audit-view";
import { normaliseRegistrationNo } from "@/lib/suppliers/identity";
import { APPLICATION_KIND_LABEL, CHANNEL_LABEL } from "@/lib/suppliers/labels";
import { supplierApplicationLabel } from "@/lib/suppliers/lock";
import { loadSupplierConfig, supplierOrg } from "@/lib/suppliers/repo";
import { SUPPLIER_SERIES_KEY } from "@/lib/suppliers/types";
import { FormReader } from "@/lib/validate";

import { audit, label, lockOrganisation, stampNow } from "../../suppliers/shared";

/// What the public form is told. Never an echo of what was typed, and never a name from the register.
export interface ApplyState {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
  /// The application's reference. Null on a success that created nothing (a dropped bot).
  reference?: string | null;
}

const closed = (): ApplyState => ({ ok: false, message: APPLY.notOpenOnSubmit.en });

/**
 * A stranger applies to join the supplier register (no sign-in). It makes exactly what an officer's
 * paper application makes (the applicant supplier, its primary contact, the application received, each
 * audited in the same transaction) so it appears in the staff review queue, but with the channel fixed
 * to the portal, the day fixed to the organisation's today, and nobody named as the recorder.
 *
 * Only the identity and contact fields are read. A channel, a recorder, a received day, a declaration
 * day or an E-Payment day posted by hand is ignored: they are not this form's to say (OD-3).
 *
 * The application's reference is the supplier's register reference, returned once to the applicant. No
 * route reads an application back by reference.
 */
export async function submitApplication(_prev: ApplyState, data: FormData): Promise<ApplyState> {
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
    let reference: string | null = null;
    const result = await db.$transaction(
      async (tx): Promise<ApplyState> => {
        const org = await supplierOrg(tx);
        if (!org) return closed();
        await lockOrganisation(tx, org.id);
        const cfg = await loadSupplierConfig(org.id, tx);
        const key = normaliseRegistrationNo(v.registrationNo);
        // Only whether the number is taken is carried forward; who holds it is never read out.
        const taken = key ? (await tx.supplier.count({ where: { organisationId: org.id, registrationNoKey: key } })) > 0 : false;
        const faults = portalApplicationFaults({ ...v, contact }, { today: org.today, formatPattern: cfg.format?.pattern ?? null, entityTypeCodes: cfg.liveCodes("ENTITY_TYPE", org.today), countryCodes: cfg.liveCodes("COUNTRY", org.today), numberTaken: taken });
        const refusal = portalRefusal(faults);
        if (refusal?.closed) return closed();
        if (refusal) return { ok: false, errors: refusal.errors, message: APPLY.nothingSent.en };

        const today = org.today!;
        let issued: string;
        try {
          issued = await issueReference(tx, org.id, SUPPLIER_SERIES_KEY, dayToDate(today));
        } catch (e) {
          if (e instanceof NumberingError) return closed();
          throw e;
        }
        const supplier = await tx.supplier.create({
          data: {
            organisationId: org.id,
            reference: issued,
            registeredName: v.registeredName,
            registrationNo: v.registrationNo.trim(),
            registrationNoKey: key,
            entityTypeCode: v.entityTypeCode!,
            countryCode: v.countryCode!,
            registeredAddress: v.registeredAddress,
            companyEmail: v.companyEmail,
          },
        });
        const c = await tx.supplierContact.create({ data: { organisationId: org.id, supplierId: supplier.id, name: contact.name, designation: contact.designation, email: contact.email, phone: contact.phone, isPrimary: true } });
        const app = await tx.supplierApplication.create({
          data: { organisationId: org.id, supplierId: supplier.id, kind: "NEW", receivedOn: dayToDate(today), channel: "PORTAL", recordedByPersonId: null, recordedAt: now, declarationSignedOn: null, epaymentFormReceivedOn: null },
          include: { supplier: { select: { reference: true } } },
        });
        const words = (kind: "ENTITY_TYPE" | "COUNTRY", code: string) => cfg.listName(kind, code) ?? "A value no longer listed";
        await audit(tx, org.id, SUPPLIER_ENTITY.supplier, supplier.id, label(supplier, supplier.registeredName), "CREATE",
          diffFields(null, { reference: issued, registeredName: supplier.registeredName, registrationNo: supplier.registrationNo, formatChecked: faults.some((f) => f.code === "FORMAT_NOT_CHECKED") ? "Not checked: no format is set" : "Matches the configured format", entityType: words("ENTITY_TYPE", supplier.entityTypeCode), country: words("COUNTRY", supplier.countryCode), registeredAddress: supplier.registeredAddress, companyEmail: supplier.companyEmail, status: "Applicant" }));
        await audit(tx, org.id, SUPPLIER_ENTITY.contact, c.id, label(supplier, "Primary contact"), "CREATE", diffFields(null, { contactName: c.name, contactDesignation: c.designation || null, contactEmail: c.email || null, contactPhone: c.phone || null, primary: true }));
        await audit(tx, org.id, SUPPLIER_ENTITY.application, app.id, supplierApplicationLabel(app), "CREATE",
          diffFields(null, { kind: APPLICATION_KIND_LABEL.NEW.en, receivedOn: today, channel: CHANNEL_LABEL.PORTAL.en, recordedBy: "Nobody: sent by the applicant through the supplier portal", recordedOnBehalf: "not signed", declarationSignedOn: null, epaymentFormReceivedOn: null }));
        reference = issued;
        return { ok: true };
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
    if (!result.ok) return result;
    revalidatePath("/suppliers");
    return { ok: true, reference };
  } catch (e) {
    // The applicant is told nothing of the cause; the server's log holds it.
    console.error("Public supplier application failed", e);
    return { ok: false, message: APPLY.tryAgainLater.en };
  }
}
