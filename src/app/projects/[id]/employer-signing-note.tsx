import { requireStaff } from "@/app/_auth/actor";
import { currentLanguage } from "@/app/_auth/language";
import { CASE_REFUSAL_WORDS as R } from "@/lib/contract/case-page-words";
import { say, sayWith } from "@/lib/i18n/say";
import { db } from "@/lib/db";

/**
 * Which office signs a reconciliation amendment for the employer, read from Contract controls (NFR-SIG-001, the product owner's ruling of 2026-10-07). Unset, it says so in the
 * words the setting's own screen uses and what happens meanwhile: the amendment is still recorded, with the offices its signer held on the day. A server component that reads
 * the setting itself, like `ActedBy`, for the one place the Formation tab needs it.
 */
export async function EmployerSigningNote() {
  const actor = await requireStaff();
  const { language: lang } = await currentLanguage();
  const policy = await db.contractPolicy.findUnique({ where: { organisationId: actor.organisationId }, select: { employerSigningRoleCode: true } });
  const code = policy?.employerSigningRoleCode ?? null;
  const office = code ? await db.authorityRole.findFirst({ where: { organisationId: actor.organisationId, code }, select: { nameEn: true } }) : null;
  return (
    <p className="text-[12.5px] break-words text-ink-3">
      {code ? <>{sayWith(R.employerSignedBy, lang, { office: office?.nameEn ?? say(R.officeNoLongerConfigured, lang) })}</> : <><span className="font-semibold text-ink-2">{say(R.employerSigningNotSet, lang)}.</span> {say(R.employerSigningNotSetWhy, lang)} {say(R.employerSigningSetUnder, lang)}</>}
    </p>
  );
}
