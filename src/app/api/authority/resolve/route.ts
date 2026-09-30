import { loadMatrix, NoActiveMatrixError } from "@/lib/authority/load";
import { resolveApproval } from "@/lib/authority/resolve";
import type { ResolveQuery } from "@/lib/authority/types";
import { loadReferenceData } from "@/lib/reference/load";
import { findFundingRoute, fundingPosture, overridesAuthority } from "@/lib/reference/vocabulary";

import { ORGANISATION_CODE } from "@/lib/org";

/// An amount: non-negative, at most two decimal places, no exponents. "1e6" or
/// "10.005" is refused rather than read as a float and rounded into a band.
function amountOrNull(raw: string | null): number | null | "bad" {
  if (raw == null || raw.trim() === "") return null;
  const cleaned = raw.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return "bad";
  return Number(cleaned);
}

/// A percentage: non-negative, plain decimal.
function percentOrNull(raw: string | null): number | null | "bad" {
  if (raw == null || raw.trim() === "") return null;
  if (!/^\d+(\.\d+)?$/.test(raw.trim())) return "bad";
  return Number(raw.trim());
}

/**
 * Resolve the approval chain for a matter.
 *
 * GET /api/authority/resolve?domain=payment&method=tender&value=620000
 *
 * The response always carries the rule key and its clause, so a caller can trace any
 * routing decision back to the printed manual.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const domain = params.get("domain");
  if (!domain) {
    return Response.json({ error: "domain is required" }, { status: 400 });
  }

  const value = amountOrNull(params.get("value"));
  const contractValue = amountOrNull(params.get("contractValue"));
  const pct = percentOrNull(params.get("pct"));
  if (value === "bad" || contractValue === "bad") {
    return Response.json(
      { error: "value and contractValue must be amounts, to at most two decimal places" },
      { status: 400 },
    );
  }
  if (pct === "bad") {
    return Response.json({ error: "pct must be a non-negative number" }, { status: 400 });
  }

  const organisationCode = params.get("org") ?? ORGANISATION_CODE;
  const fundingCode = params.get("funding");

  try {
    // Whether a funder overrides the matrix is configuration, so the route has to be
    // looked up before the chain is resolved rather than inferred from its code.
    const reference = await loadReferenceData(organisationCode);
    const route = findFundingRoute(reference.fundingRoutes, fundingCode);

    const query: ResolveQuery = {
      domain,
      method: params.get("method"),
      cond: params.get("cond"),
      value,
      pct,
      contractValue,
      absentRoleCodes: params.getAll("absent").filter(Boolean),
      actorRoleCode: params.get("actor"),
      funding: fundingCode,
      fundingSupersedesAuthority: overridesAuthority(route),
    };

    const matrix = await loadMatrix(organisationCode);
    const result = resolveApproval(matrix, query);

    return Response.json({
      funding: route && {
        code: route.code,
        label: route.nameEn,
        posture: fundingPosture(route),
        supersedesAuthority: route.supersedesAuthority,
      },
      rule: result.rule && {
        key: result.rule.ruleKey,
        label: result.rule.labelEn,
        clause: result.rule.clause,
        isGap: result.rule.isGap,
        note: result.rule.note || undefined,
      },
      regime: result.regime,
      approver: result.approverCode,
      committee: result.committeeCode,
      nonDelegable: result.nonDelegable,
      chain: result.chain.map((s) => ({
        role: s.roleCode,
        name: matrix.roles[s.roleCode]?.nameEn ?? s.roleCode,
        act: s.act,
        committee: s.committeeCode,
        nonDelegable: s.nonDelegable,
        note: s.note,
      })),
      warnings: result.warnings,
    });
  } catch (error) {
    if (error instanceof NoActiveMatrixError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }
}
