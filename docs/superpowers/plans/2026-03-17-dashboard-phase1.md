# Bastion Enterprise Dashboard — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-tenant SaaS dashboard for Bastion Enterprise with auth, tenant management, policy editor, usage analytics, and audit log viewer.

**Architecture:** Next.js 15 App Router deployed to Cloudflare Pages. NextAuth.js handles Google/GitHub OAuth + magic link. Dashboard calls existing Cloud Run control plane API. shadcn/ui components with dark/light theme toggle.

**Tech Stack:** Next.js 15, NextAuth.js v5, Tailwind CSS, shadcn/ui, Recharts, next-themes, @cloudflare/next-on-pages

---

## Chunk 1: Scaffolding & Auth

### Task 1: Scaffold Next.js project

**Files:**
- Create: `packages/dashboard/package.json`
- Create: `packages/dashboard/next.config.js`
- Create: `packages/dashboard/tsconfig.json`
- Create: `packages/dashboard/tailwind.config.ts`
- Create: `packages/dashboard/postcss.config.js`
- Create: `packages/dashboard/src/styles/globals.css`
- Create: `packages/dashboard/.gitignore`

- [ ] **Step 1:** Create `packages/dashboard/package.json` with dependencies:
  ```json
  {
    "name": "@openbastion-ai/dashboard",
    "version": "0.1.0",
    "private": true,
    "scripts": {
      "dev": "next dev",
      "build": "next build",
      "start": "next start",
      "typecheck": "tsc --noEmit"
    },
    "dependencies": {
      "next": "^15.0.0",
      "react": "^19.0.0",
      "react-dom": "^19.0.0",
      "next-auth": "^5.0.0",
      "next-themes": "^0.4.0",
      "recharts": "^2.15.0",
      "zod": "^3.23.0",
      "class-variance-authority": "^0.7.0",
      "clsx": "^2.1.0",
      "tailwind-merge": "^2.6.0",
      "lucide-react": "^0.460.0",
      "@radix-ui/react-dialog": "^1.1.0",
      "@radix-ui/react-dropdown-menu": "^2.1.0",
      "@radix-ui/react-select": "^2.1.0",
      "@radix-ui/react-tabs": "^1.1.0",
      "@radix-ui/react-slot": "^1.1.0"
    },
    "devDependencies": {
      "@types/node": "^22.0.0",
      "@types/react": "^19.0.0",
      "typescript": "^5.5.0",
      "tailwindcss": "^4.0.0",
      "postcss": "^8.4.0",
      "autoprefixer": "^10.4.0"
    }
  }
  ```

- [ ] **Step 2:** Create `next.config.js`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`

- [ ] **Step 3:** Create `src/styles/globals.css` with Tailwind imports and Bastion CSS custom properties for both dark and light themes

- [ ] **Step 4:** Create `.gitignore` with `.next/`, `node_modules/`, `out/`

- [ ] **Step 5:** Run `pnpm install` from root, verify `pnpm --filter @openbastion-ai/dashboard dev` starts

- [ ] **Step 6:** Commit: `"feat(dashboard): scaffold Next.js project"`

### Task 2: shadcn/ui component setup

**Files:**
- Create: `packages/dashboard/src/lib/utils.ts` (cn utility)
- Create: `packages/dashboard/src/components/ui/button.tsx`
- Create: `packages/dashboard/src/components/ui/card.tsx`
- Create: `packages/dashboard/src/components/ui/input.tsx`
- Create: `packages/dashboard/src/components/ui/dialog.tsx`
- Create: `packages/dashboard/src/components/ui/dropdown-menu.tsx`
- Create: `packages/dashboard/src/components/ui/select.tsx`
- Create: `packages/dashboard/src/components/ui/table.tsx`
- Create: `packages/dashboard/src/components/ui/tabs.tsx`
- Create: `packages/dashboard/src/components/ui/badge.tsx`

- [ ] **Step 1:** Create `src/lib/utils.ts`:
  ```typescript
  import { type ClassValue, clsx } from "clsx";
  import { twMerge } from "tailwind-merge";
  export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
  }
  ```

- [ ] **Step 2:** Create all shadcn/ui component files (Button, Card, Input, Dialog, DropdownMenu, Select, Table, Tabs, Badge) following shadcn/ui patterns with Bastion's purple accent

- [ ] **Step 3:** Verify components render in a test page

- [ ] **Step 4:** Commit: `"feat(dashboard): add shadcn/ui components"`

### Task 3: NextAuth configuration

**Files:**
- Create: `packages/dashboard/src/lib/auth.ts`
- Create: `packages/dashboard/src/app/api/auth/[...nextauth]/route.ts`
- Create: `packages/dashboard/src/middleware.ts`

- [ ] **Step 1:** Create `src/lib/auth.ts` with NextAuth config:
  - Google OAuth provider (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
  - GitHub OAuth provider (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET)
  - Email provider for magic links (EMAIL_SERVER)
  - JWT strategy with tenantId and controlKey in session
  - Callbacks: signIn, jwt, session

- [ ] **Step 2:** Create `src/app/api/auth/[...nextauth]/route.ts`:
  ```typescript
  import { handlers } from "@/lib/auth";
  export const { GET, POST } = handlers;
  ```

- [ ] **Step 3:** Create `src/middleware.ts` — protect all routes except `/login`, `/api/auth`, and public assets. Redirect unauthenticated users to `/login`.

- [ ] **Step 4:** Commit: `"feat(dashboard): configure NextAuth with Google, GitHub, magic link"`

### Task 4: Login page

**Files:**
- Create: `packages/dashboard/src/app/login/page.tsx`

- [ ] **Step 1:** Create login page with:
  - Bastion logo centered
  - "Sign in to Bastion" heading
  - Google OAuth button
  - GitHub OAuth button
  - Divider "or"
  - Email input + "Send magic link" button
  - Dark theme, purple accent
  - Responsive (works on mobile)

- [ ] **Step 2:** Verify login flow works with at least one provider

- [ ] **Step 3:** Commit: `"feat(dashboard): add login page"`

### Task 5: Control plane API client

**Files:**
- Create: `packages/dashboard/src/lib/api.ts`

- [ ] **Step 1:** Create typed API client for the control plane:
  ```typescript
  const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || "https://api.openbastionai.org";

  export async function apiClient(path: string, options: {
    method?: string;
    body?: unknown;
    controlKey: string;
  }) {
    const res = await fetch(`${CONTROL_PLANE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${options.controlKey}`,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json();
  }
  ```
  Plus typed wrapper functions:
  - `getTenant(controlKey)` → GET /tenants/me
  - `getConfig(controlKey)` → GET /tenants/me/config
  - `updateConfig(controlKey, config)` → PUT /tenants/me/config
  - `getUsage(controlKey, start?, end?)` → GET /tenants/me/usage
  - `getUsageBreakdown(controlKey, start?, end?)` → GET /tenants/me/usage/breakdown
  - `rotateKeys(controlKey)` → POST /tenants/me/rotate-keys
  - `createTenant(body)` → POST /tenants
  - `deleteTenant(controlKey)` → DELETE /tenants/me
  - `getAuditLog(controlKey, params)` → GET /tenants/me/audit
  - `getTeam(controlKey)` → GET /tenants/me/team
  - `inviteTeamMember(controlKey, body)` → POST /tenants/me/team/invite
  - `removeTeamMember(controlKey, id)` → DELETE /tenants/me/team/:id
  - `updateTeamMember(controlKey, id, body)` → PUT /tenants/me/team/:id

- [ ] **Step 2:** Commit: `"feat(dashboard): add control plane API client"`

---

## Chunk 2: Layout & Theme

### Task 6: Root layout with sidebar and topbar

**Files:**
- Create: `packages/dashboard/src/app/layout.tsx`
- Create: `packages/dashboard/src/components/layout/sidebar.tsx`
- Create: `packages/dashboard/src/components/layout/topbar.tsx`
- Create: `packages/dashboard/src/components/layout/theme-toggle.tsx`
- Create: `packages/dashboard/src/components/layout/theme-provider.tsx`
- Create: `packages/dashboard/public/logo.svg`

- [ ] **Step 1:** Create `theme-provider.tsx` wrapping `next-themes` ThemeProvider

- [ ] **Step 2:** Create `sidebar.tsx`:
  - 240px wide, collapsible
  - Logo + "Bastion" wordmark at top
  - Nav links: Overview, API Keys, Policies, Providers, Usage, Audit Log
  - Bottom section: Settings, Team
  - Active route highlighted with purple accent
  - Icons from lucide-react (LayoutDashboard, Key, Shield, Server, BarChart3, ScrollText, Settings, Users)

- [ ] **Step 3:** Create `topbar.tsx`:
  - Tenant name display
  - Theme toggle button (sun/moon icon)
  - User avatar dropdown (profile, sign out)

- [ ] **Step 4:** Create `theme-toggle.tsx` — button that cycles dark/light using next-themes

- [ ] **Step 5:** Create `src/app/layout.tsx`:
  - Import globals.css
  - Wrap in ThemeProvider
  - SessionProvider from NextAuth
  - Sidebar + Topbar + main content area
  - Conditionally hide sidebar/topbar on /login route

- [ ] **Step 6:** Copy `site/logo.svg` to `public/logo.svg`

- [ ] **Step 7:** Verify dark/light toggle works, sidebar navigation works

- [ ] **Step 8:** Commit: `"feat(dashboard): add layout with sidebar, topbar, theme toggle"`

### Task 7: Onboarding page

**Files:**
- Create: `packages/dashboard/src/app/onboarding/page.tsx`

- [ ] **Step 1:** Create onboarding wizard for first-time users:
  - Step 1: "Name your organization" — text input
  - Step 2: "Add your LLM provider" — API key inputs for Anthropic/OpenAI
  - Step 3: "Your keys" — display generated control + proxy keys with copy buttons
  - Calls `POST /tenants` on submit
  - Stores controlKey in session
  - Redirect to `/` on complete

- [ ] **Step 2:** Commit: `"feat(dashboard): add onboarding wizard"`

---

## Chunk 3: Core Dashboard Pages

### Task 8: Overview page

**Files:**
- Create: `packages/dashboard/src/app/page.tsx`
- Create: `packages/dashboard/src/components/dashboard/stat-card.tsx`
- Create: `packages/dashboard/src/components/dashboard/usage-chart.tsx`
- Create: `packages/dashboard/src/components/dashboard/recent-activity.tsx`

- [ ] **Step 1:** Create `stat-card.tsx` — reusable card showing label, value, optional trend indicator
- [ ] **Step 2:** Create `usage-chart.tsx` — Recharts BarChart of requests over time with 7d/30d/90d toggle
- [ ] **Step 3:** Create `recent-activity.tsx` — compact list of last 10 audit entries
- [ ] **Step 4:** Create overview page with:
  - 4 stat cards: Total Requests, Blocked, Estimated Cost, Cache Hit Rate
  - Usage chart below
  - Recent activity below that
  - "Generate Key" and "Add Policy" quick action buttons
  - Fetches data via server components calling API client

- [ ] **Step 5:** Commit: `"feat(dashboard): add overview page with stats, chart, activity"`

### Task 9: API Keys page

**Files:**
- Create: `packages/dashboard/src/app/keys/page.tsx`
- Create: `packages/dashboard/src/components/keys/keys-table.tsx`
- Create: `packages/dashboard/src/components/keys/generate-key-dialog.tsx`
- Create: `packages/dashboard/src/components/keys/rotate-key-dialog.tsx`

- [ ] **Step 1:** Create `keys-table.tsx` — table with key prefix (masked), type, created, last used, copy button
- [ ] **Step 2:** Create `generate-key-dialog.tsx` — dialog to create new key, shows plaintext once
- [ ] **Step 3:** Create `rotate-key-dialog.tsx` — confirm dialog, calls rotate-keys API, shows new keys
- [ ] **Step 4:** Create keys page assembling all components

- [ ] **Step 5:** Commit: `"feat(dashboard): add API keys management page"`

### Task 10: Policies page

**Files:**
- Create: `packages/dashboard/src/app/policies/page.tsx`
- Create: `packages/dashboard/src/components/policies/policies-table.tsx`
- Create: `packages/dashboard/src/components/policies/policy-editor.tsx`
- Create: `packages/dashboard/src/components/policies/yaml-preview.tsx`

- [ ] **Step 1:** Create `policies-table.tsx` — table with name, trigger, action, condition summary, edit/delete buttons
- [ ] **Step 2:** Create `yaml-preview.tsx` — renders a policy object as syntax-highlighted YAML
- [ ] **Step 3:** Create `policy-editor.tsx` — form with:
  - Name (text)
  - Trigger (select: request/response/both)
  - Action (select: block/warn/redact/tag)
  - Condition type (select: contains/regex/injection_score/pii_detected/length_exceeds)
  - Dynamic condition fields based on type (value, threshold, entities, case_sensitive)
  - Live YAML preview panel alongside form
  - Save button calls `PUT /tenants/me/config` (merges with existing config)

- [ ] **Step 4:** Create policies page with table + "Add Policy" button opening editor in a dialog

- [ ] **Step 5:** Commit: `"feat(dashboard): add policy management with visual editor"`

### Task 11: Providers page

**Files:**
- Create: `packages/dashboard/src/app/providers/page.tsx`
- Create: `packages/dashboard/src/components/providers/provider-card.tsx`
- Create: `packages/dashboard/src/components/providers/edit-provider-dialog.tsx`

- [ ] **Step 1:** Create `provider-card.tsx` — card showing provider name, status badge (configured/not), primary/fallback indicator
- [ ] **Step 2:** Create `edit-provider-dialog.tsx` — form with API key input (masked), base URL override, timeout, save button
- [ ] **Step 3:** Create providers page with card grid + primary/fallback selector

- [ ] **Step 4:** Commit: `"feat(dashboard): add provider configuration page"`

---

## Chunk 4: Analytics, Audit & Settings

### Task 12: Usage Analytics page

**Files:**
- Create: `packages/dashboard/src/app/usage/page.tsx`
- Create: `packages/dashboard/src/components/usage/date-range-picker.tsx`
- Create: `packages/dashboard/src/components/usage/model-breakdown.tsx`
- Create: `packages/dashboard/src/components/usage/cost-table.tsx`

- [ ] **Step 1:** Create `date-range-picker.tsx` — preset buttons (7d/30d/90d) + custom date inputs
- [ ] **Step 2:** Create `model-breakdown.tsx` — table with model, requests, tokens, cost
- [ ] **Step 3:** Create `cost-table.tsx` — running total, daily average, projected monthly
- [ ] **Step 4:** Create usage page with:
  - Date range picker at top
  - Recharts area chart (requests over time, colored by provider)
  - Model breakdown table
  - Cost summary cards

- [ ] **Step 5:** Commit: `"feat(dashboard): add usage analytics page"`

### Task 13: Audit Log page

**Files:**
- Create: `packages/dashboard/src/app/audit/page.tsx`
- Create: `packages/dashboard/src/components/audit/audit-table.tsx`

- [ ] **Step 1:** Create `audit-table.tsx`:
  - Paginated table: timestamp, provider, model, status (badge), duration, tokens, cost
  - Filter bar: status dropdown, provider dropdown, date range
  - Search input for free text
  - Expandable rows showing policy decisions
  - Pagination controls (prev/next, page size)

- [ ] **Step 2:** Create audit page — needs new `GET /tenants/me/audit` endpoint (Task 15)

- [ ] **Step 3:** Commit: `"feat(dashboard): add audit log viewer"`

### Task 14: Settings & Team pages

**Files:**
- Create: `packages/dashboard/src/app/settings/page.tsx`
- Create: `packages/dashboard/src/app/settings/team/page.tsx`
- Create: `packages/dashboard/src/components/settings/tenant-form.tsx`
- Create: `packages/dashboard/src/components/settings/plan-info.tsx`
- Create: `packages/dashboard/src/components/settings/danger-zone.tsx`
- Create: `packages/dashboard/src/components/team/team-table.tsx`
- Create: `packages/dashboard/src/components/team/invite-dialog.tsx`

- [ ] **Step 1:** Create `tenant-form.tsx` — editable tenant name
- [ ] **Step 2:** Create `plan-info.tsx` — current plan, usage vs limits
- [ ] **Step 3:** Create `danger-zone.tsx` — delete tenant with confirmation (type tenant name)
- [ ] **Step 4:** Create settings page assembling all components
- [ ] **Step 5:** Create `team-table.tsx` — member list with role badges and actions
- [ ] **Step 6:** Create `invite-dialog.tsx` — email + role select + invite button
- [ ] **Step 7:** Create team page — needs new team endpoints (Task 15)

- [ ] **Step 8:** Commit: `"feat(dashboard): add settings and team management pages"`

---

## Chunk 5: Control Plane API Extensions & Deployment

### Task 15: Add new control plane endpoints

**Files:**
- Modify: `packages/cloud/src/control-plane/routes/tenants.ts`
- Create: `packages/cloud/src/control-plane/routes/audit.ts`
- Create: `packages/cloud/src/control-plane/routes/team.ts`
- Modify: `packages/cloud/src/control-plane/server.ts`
- Modify: `packages/cloud/src/db/client.ts` (add team_members table to schema)

- [ ] **Step 1:** Add `team_members` table to the inline schema in `db/client.ts`

- [ ] **Step 2:** Create `routes/audit.ts`:
  - `GET /tenants/me/audit` — paginated, filterable audit log from usage_logs table
  - Query params: page, limit, status, provider, model, start, end
  - Returns: { entries, total, page, limit }

- [ ] **Step 3:** Create `routes/team.ts`:
  - `GET /tenants/me/team` — list team members
  - `POST /tenants/me/team/invite` — insert into team_members
  - `PUT /tenants/me/team/:memberId` — update role
  - `DELETE /tenants/me/team/:memberId` — remove member

- [ ] **Step 4:** Register new routes in `server.ts` (inside authenticated scope)

- [ ] **Step 5:** Build and test: `pnpm --filter @openbastion-ai/cloud build && pnpm --filter @openbastion-ai/cloud typecheck`

- [ ] **Step 6:** Rebuild Docker images and redeploy control plane to Cloud Run

- [ ] **Step 7:** Commit: `"feat(cloud): add audit, team API endpoints"`

### Task 16: Deploy dashboard to Cloudflare Pages

**Files:**
- Modify: `packages/dashboard/next.config.js` (add @cloudflare/next-on-pages config if needed)

- [ ] **Step 1:** Build dashboard: `cd packages/dashboard && pnpm build`

- [ ] **Step 2:** Create Cloudflare Pages project:
  ```bash
  wrangler pages project create openbastionai-dashboard --production-branch main
  ```

- [ ] **Step 3:** Deploy:
  ```bash
  wrangler pages deploy packages/dashboard/.next --project-name openbastionai-dashboard
  ```

- [ ] **Step 4:** Set environment variables in Cloudflare dashboard:
  - NEXTAUTH_SECRET, NEXTAUTH_URL
  - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
  - GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
  - EMAIL_SERVER
  - CONTROL_PLANE_URL

- [ ] **Step 5:** Add custom domain: `dashboard.openbastionai.org`

- [ ] **Step 6:** Verify login → onboarding → dashboard flow works end-to-end

- [ ] **Step 7:** Commit all remaining changes, push to GitHub

- [ ] **Step 8:** Final commit: `"feat(dashboard): deploy Phase 1 to Cloudflare Pages"`
