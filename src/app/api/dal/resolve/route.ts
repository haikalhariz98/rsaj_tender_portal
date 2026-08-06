import { loadMatrix, NoActiveDalVersionError } from "@/lib/dal/load";
import { resolveApproval } from "@/lib/dal/resolve";
import type { ResolveQuery } from "@/lib/dal/types";

const DEFAULT_ORG = "RSAJ";

function numberOrNull(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve the approval chain for a matter.
 *
 * GET /api/dal/resolve?domain=payment&method=tender&value=620000
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

  const rawValue = params.get("value");
  if (rawValue != null && rawValue.trim() !== "" && numberOrNull(rawValue) == null) {
    return Response.json({ error: "value must be a number" }, { status: 400 });
  }

  const query: ResolveQuery = {
    domain,
    method: params.get("method"),
    cond: params.get("cond"),
    value: numberOrNull(rawValue),
    pct: numberOrNull(params.get("pct")),
    contractValue: numberOrNull(params.get("contractValue")),
    absentRoleCodes: params.getAll("absent").filter(Boolean),
    actorRoleCode: params.get("actor"),
    funding: params.get("funding"),
  };

  try {
    const matrix = await loadMatrix(params.get("org") ?? DEFAULT_ORG);
    const result = resolveApproval(matrix, query);

    return Response.json({
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
    if (error instanceof NoActiveDalVersionError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }
}
