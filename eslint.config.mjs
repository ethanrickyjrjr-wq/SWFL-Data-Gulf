// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import allow from "./verification/supabase-untyped-allowlist.json" with { type: "json" };

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Allow _-prefixed identifiers as intentionally unused (TypeScript/pack convention).
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Claude Code worktrees — each contains its own .next/ build artifacts and
    // hook scripts that are not authored code; never lint them.
    ".claude/**",
    // Third-party toolkit — CJS Node scripts; not app code.
    "awesome-claude-code-toolkit/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Design reference / vendor anime.js examples / beautified bundles —
    // not shipped code, not authored here, intentionally outside lint scope.
    "app/_design/**",
    "docs/design-reference/**",
    // bklit-ui chart primitives — verbatim vendor (MIT, pinned commit, see
    // NOTICE.md) except two documented forks (staticSize/initialLoaded).
    // Same reasoning as components/viz/** below: third-party-authored code,
    // not worth carrying our lint rules into someone else's source.
    "components/charts/vendor/bklit/**",
    // /ops is a separate Vercel project with its own toolchain — isolated from
    // the main app's lint/build (see _AUDIT_AND_ROADMAP/ops-build-spec.md).
    "ops/**",
    // Archived plan docs — historical code snippets, not shipped.
    "docs/**/_FINISHED/**",
    "docs/_FINISHED/**",
    // Gitignored local scratch — one-off session debug harnesses (.gitignore
    // covers both patterns); never committed, never shipped, keep them out of
    // lint and the editor Problems panel.
    "tmp/**",
    "scripts/email/tmp-*.mts",
  ]),
  // Fiverr-delivered viz components use Recharts tooltip prop typing
  // (`any` is the library default) and a setState-in-effect default-select
  // pattern. Both are functional; not worth blocking CI on. Relax these two
  // rules for the viz folder only — refactor backlog.
  {
    files: ["components/viz/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Ban the untyped Supabase client factories. Every new caller must use the typed
  // factory or add the file to verification/supabase-untyped-allowlist.json with a KNOWN-DEBT comment.
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/utils/supabase/server",
              importNames: ["createClientUntyped"],
              message:
                "createClientUntyped is the deferred-fix hatch. Use the typed createClient; if a fix is genuinely deferred, add the file to verification/supabase-untyped-allowlist.json + a KNOWN-DEBT comment.",
            },
            {
              name: "@/utils/supabase/service-role",
              importNames: ["createServiceRoleClientUntyped"],
              message:
                "createServiceRoleClientUntyped is the deferred-fix hatch. Use the typed createServiceRoleClient; if a fix is genuinely deferred, add the file to verification/supabase-untyped-allowlist.json + a KNOWN-DEBT comment.",
            },
          ],
        },
      ],
    },
  },
  // Allowlist: files that still use a hatch (shrinking — KNOWN-DEBT). Overrides the ban above.
  // Escape glob special characters ([ ]) that appear in Next.js dynamic-route directory names.
  {
    files: allow.map((p) => p.replace(/\[/g, "\\[").replace(/\]/g, "\\]")),
    rules: {
      "no-restricted-imports": "off",
    },
  },
  // ── NO RAW HEX ON THE SOCIAL CANVAS ────────────────────────────────────────
  //
  // A canvas/SVG renderer cannot read `var(--gulf-teal)`, so for years every one
  // re-typed the palette by hand. That is how the social canvas ended up rendering
  // `#0ea5b7` — a teal that is not our teal — in four files at once, and how the
  // house navy came to exist as both #0f1d24 and #0a1419 depending on the path.
  //
  // `lib/brand/tokens.ts` is the importable palette; `lib/social/design/system.ts`
  // resolves it per theme and per role. In this lane a raw hex is NEVER correct, so
  // the ban is clean — no allowlist, and none is expected. (Contrast with magic
  // NUMBERS, which are legitimate everywhere and are governed by the TYPE ladder's
  // union type instead — a compile error beats a lint rule.)
  //
  // This ban is fast local feedback, not the safety net. The net is the render-time
  // contrast + floor assertions in lib/social/design/system.test.ts, which catch a
  // wrong value that no source-level rule can see (an ABSENT lineHeight is the bug
  // that clipped every email stat, and it is invisible to a linter).
  {
    files: ["lib/social/design/**/*.{ts,tsx}", "components/email-lab/social/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
          message:
            "Raw hex on the social canvas. Import the palette instead: BRAND.* (lib/brand/tokens.ts) " +
            "for a token, or ink()/accent()/decor()/THEMES (lib/social/design/system.ts) for a color " +
            "resolved by theme + role. A hand-typed hex is how the canvas shipped the wrong brand teal.",
        },
      ],
    },
  },
  ...storybook.configs["flat/recommended"],
]);

export default eslintConfig;
