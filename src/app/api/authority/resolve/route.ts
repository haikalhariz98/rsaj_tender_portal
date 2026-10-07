import { staffRoute } from "@/app/_auth/route";
import { loadMatrix, NoActiveMatrixError } from "@/lib/authority/load";
import { resolveApproval } from "@/lib/authority/resolve";
import type { ResolveQuery } from "@/lib/authority/types";
import { ratioOfPercent, type ExactRatio } from "@/lib/percent-band";
import { loadReferenceData } from "@/lib/reference/load";
import { findFundingRoute, fundingPosture, overridesAuthority } from "@/lib/reference/vocabulary";


/// An amount: non-negative, at most two decimal places, no exponents. "1e6" or
/// "10.005" is refused rather than read as a float and rounded into a band.
function amountOrNull(raw: string | null): number | null | "bad" {
  if (raw == null || raw.trim() === "") return null;
  const cleaned = raw.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return "bad";
  return Number(cleaned);
}

/// A percentage: non-negative, at most four decimal places, read exactly as a ratio (ADR 0024 Amendment 1),
/// never as a float: "7" is 7,000,000 / 100,000,000, judged in integers against each band edge.
function percentOrNull(raw: string | null): ExactRatio | null | "bad" {
  if (raw == null || raw.trim() === "") return null;
  if (!/^\d{1,6}(\.\d{1,4})?$/.test(raw.trim())) return "bad";
  return ratioOfPercent(raw.trim());
}

/**
 * Resolve the approval chain for a matter.
 *
 * GET /api/authority/resolve?domain=payment&method=tender&value=620000
 *
 * Against the signed-in person's organisation's matrix only.
 *
 * The response always carries the rule key and its clause, so a caller can trace any
 * routing decision back to the printed manual.
 */
export async function GET(request: Request) {
  const guard = await staffRoute();
  if (!guard.ok) return guard.response;
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
    return Response.json({ error: "pct must be a non-negative percentage, to at most four decimal places" }, { status: 400 });
  }

  // The matrix is the signed-in person's organisation's (ADR 0034 D10). The query once named any organisation by its code; one that names
  // another is answered as if it did not exist, never with that organisation's matrix.
  const organisationCode = guard.actor.organisationCode;
  const named = params.get("org");
  if (named != null && named !== organisationCode) return Response.json({ error: "Not found" }, { status: 404 });
  const fundingCode = params.get("funding");

  try {
    // Whether a funder overrides the matrix is configuration, so the route has to be
    // looked up before the chain is resolved rather than inferred from its code.
    const reference = await loadReferenceData(organisationCode);
    const route = findFundingRoute(reference.fundingRoutes, fundingCode);

    const query: ResolveQuery = {
      domain,
      method: params.get("method"),
      contractTypeCode: params.get("contractType"),
      cond: params.get("cond"),
      value,
      pctRatio: pct,
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
