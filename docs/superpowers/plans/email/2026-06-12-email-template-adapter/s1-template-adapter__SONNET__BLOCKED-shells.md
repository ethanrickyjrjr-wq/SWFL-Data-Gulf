# Section 1 — Template Adapter
**Builder: Sonnet**
**Gate: BLOCKED — 5 HTML shells must be committed first**
**Output: `lib/email/templates/token-defaults.ts`, `render-template.ts`, `template-registry.ts`**

---

## Pre-build gate (run before writing any code)

```bash
# 1. Shells present
ls lib/email/templates/shells/*.html   # must return 5 files

# 2. Token audit — this grep IS the source of truth for TokenKey
grep -oh "{{[A-Z_]*}}" lib/email/templates/shells/*.html | sort -u

# 3. Unsubscribe token in every broadcast shell
grep -l "{{{RESEND_UNSUBSCRIBE_URL}}}" lib/email/templates/shells/*.html
# Transactional shells (report-ready, alerts) do NOT need this token

# 4. Brand theme dependency exists
ls lib/deliverable/brand-theme.ts   # must exist — 1B imports from it
```

---

## Sequential build order

**1A and 1B run in parallel. 1C cannot start until both are done.**

```
[1A] token-defaults.ts  ──┐
(parallel)                ├──→  [1C] renderEmailTemplate() body
[1B] types + sig        ──┘
                                  + template-registry.ts (can build alongside 1A/1B)
```

---

## Task 1A — token-defaults.ts (Sonnet)
**Runs in parallel with 1B**

File: `lib/email/templates/token-defaults.ts`

```typescript
import { SWFL_THEME } from '@/scripts/email/types';

// TokenKey union is derived from the pre-build grep — update if grep returns new tokens
export type TokenKey =
  | 'PRIMARY' | 'ACCENT' | 'SURFACE' | 'TEXT'
  | 'FONT_FAMILY' | 'BORDER_RADIUS'
  | 'COMPANY_NAME' | 'LOGO_URL' | 'TAGLINE' | 'WEBSITE_URL'
  | 'SENDER_NAME' | 'SENDER_ADDRESS'
  | 'DISCLAIMER' | 'MAP_URL';

// PRIMARY/ACCENT/LOGO_URL derive from SWFL_THEME — never hardcoded
// SENDER_NAME/SENDER_ADDRESS = "" — NOT env vars, NOT a throw
// (throw guard lives only at broadcast/route.ts:53–54 and the pre-send validation layer)
export const SWFL_TOKEN_DEFAULTS: Record<TokenKey, string> = {
  PRIMARY:        SWFL_THEME.primary,
  ACCENT:         SWFL_THEME.accent,
  LOGO_URL:       SWFL_THEME.logoUrl ?? '',
  SURFACE:        '#ffffff',
  TEXT:           '#111827',
  FONT_FAMILY:    "'Inter', sans-serif",
  BORDER_RADIUS:  '8px',
  COMPANY_NAME:   'SWFL Data Gulf',
  TAGLINE:        'Southwest Florida Intelligence',
  WEBSITE_URL:    'https://www.swfldatagulf.com',
  SENDER_NAME:    '',
  SENDER_ADDRESS: '',
  DISCLAIMER:     'You are receiving this email because you subscribed to SWFL Data Gulf. To unsubscribe, use the link below.',
  MAP_URL:        '',
};

export type TemplateTokens = Partial<Record<TokenKey, string>>;
```

---

## Task 1B — Types + Signature (Sonnet)
**Runs in parallel with 1A**
**Requires `lib/deliverable/brand-theme.ts` to exist (pre-build gate check 4)**

File: `lib/email/templates/render-template.ts` — signature + types only, no body yet

```typescript
import type { BrandTheme } from '@/lib/deliverable/brand-theme';
import type { TemplateTokens, TokenKey } from './token-defaults';
import type { TemplateSlug } from './template-registry';

export interface TemplateData {
  chart?:    string;   // output of renderChart() — fills [ CHART ] placeholder
  body?:     string;   // main copy block — fills [ BODY TEXT ] placeholder
  // add other section slots as needed once shells are reviewed
}

// NULL = no brand on file. Caller must prompt user — never fall back to SWFL colors.
export function brandThemeToTokens(theme: BrandTheme | null | undefined): Partial<TemplateTokens> {
  if (!theme) return {};
  return {
    ...(theme.primary  ? { PRIMARY:  theme.primary  } : {}),
    ...(theme.accent   ? { ACCENT:   theme.accent   } : {}),
    ...(theme.logoUrl  ? { LOGO_URL: theme.logoUrl  } : {}),
  };
}

export function renderEmailTemplate(
  slug:    TemplateSlug,
  tokens?: TemplateTokens,
  data?:   TemplateData,
): string {
  throw new Error('not implemented');
}
```

---

## Task 1C — renderEmailTemplate() Body (Sonnet)
**Cannot start until 1A AND 1B are both done**

Implement the body in `lib/email/templates/render-template.ts`:

1. Read shell file from `EMAIL_TEMPLATES[slug]`
2. Merge tokens: `{ ...SWFL_TOKEN_DEFAULTS, ...tokens }`
3. Replace all `{{TOKEN}}` in the HTML string — single regex pass
4. If data provided, replace section placeholders (`[ CHART ]`, `[ BODY TEXT ]`, etc.)
5. Assert no raw `{{[A-Z_]+}}` remain — throw if any do
6. Return finished HTML string

**Do NOT assert `{{{RESEND_UNSUBSCRIBE_URL}}}` here.** This function renders both broadcast and transactional emails. The triple-brace guard lives only at `broadcast/route.ts:49`. Duplicating it here hard-fails legitimate transactional renders.

---

## template-registry.ts (Sonnet)
**Can build alongside 1A/1B — no dependency**

File: `lib/email/templates/template-registry.ts`

Slug names below are placeholders — update to match actual filenames when shells arrive:

```typescript
export const EMAIL_TEMPLATES = {
  'announcement':   'lib/email/templates/shells/announcement.html',
  'digest':         'lib/email/templates/shells/digest.html',
  'property-alert': 'lib/email/templates/shells/property-alert.html',
  'market-report':  'lib/email/templates/shells/market-report.html',
  'one-liner':      'lib/email/templates/shells/one-liner.html',
} as const;

export type TemplateSlug = keyof typeof EMAIL_TEMPLATES;
```

---

## Verification

```bash
# No raw tokens remain — use a real slug
node -e "
  const { renderEmailTemplate } = require('./lib/email/templates/render-template');
  const out = renderEmailTemplate('digest', {}, {});
  const remaining = out.match(/\{\{[A-Z_]+\}\}/g);
  if (remaining) throw new Error('Unfilled tokens: ' + remaining.join(', '));
  console.log('PASS');
"

# Partial override — only PRIMARY changes, rest default
# renderEmailTemplate('digest', { PRIMARY: '#ff0000' }, {})

# POST to /api/email/broadcast with send: false → confirm draft in Resend dashboard
# Open rendered HTML in browser → zero visible {{TOKEN}} strings
```
