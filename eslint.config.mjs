import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // A "${…}" inside a plain string is a template that never fills in (6.5 send-back S-1).
  { rules: { "no-template-curly-in-string": "error" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored environment tooling (a patched Prisma adapter), not application code.
    "docs/notes/cloud-build/tools/**",
    // Agent worktrees, each a full checkout linted on its own.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
