# Bastion Enterprise Dashboard — Phase 1 Design Spec

**Date:** 2026-03-17
**Status:** Approved
**Phase:** 1 of 3 (Auth + Dashboard Shell + Tenant Management)

## Overview

A multi-tenant SaaS dashboard for Bastion Enterprise at `dashboard.openbastionai.org`. Phase 1 covers authentication, the dashboard shell with theme switching, and tenant/key/policy management UI. The dashboard is a thin UI layer calling the existing Cloud Run control plane API.

## Design Decisions

| Decision | Choice |
|----------|--------|
| Framework | Next.js 15 (App Router) |
| Auth | NextAuth.js — Google OAuth, GitHub OAuth, magic link email |
| UI Library | Tailwind CSS + shadcn/ui |
| Charts | Recharts |
| Theme | Dark default, light/dark toggle via next-themes |
| Accent | Purple→Blue gradient (#8b5cf6 → #3b82f6) |
| Deploy | Cloudflare Pages |
| Domain | dashboard.openbastionai.org |
| API Backend | Existing Cloud Run control plane (api.openbastionai.org) |
| Package Location | packages/dashboard/ (private, not published to npm) |

## Architecture

```
Browser → dashboard.openbastionai.org (Cloudflare Pages / Next.js)
              ↓ (API calls via server actions / route handlers)
         api.openbastionai.org (Cloud Run control plane)
              ↓ (queries)
         Cloud SQL (tenants, tenant_configs, usage_logs, team_members)
```

The dashboard contains no business logic — it's a presentation layer. All data CRUD flows through the existing control plane REST API. NextAuth handles session management via Next.js API routes running as Cloudflare Workers.

## Tech Stack

- **Next.js 15** — App Router, server components, server actions
- **NextAuth.js v5** — Auth.js for Next.js
- **Tailwind CSS v4** — utility-first styling
- **shadcn/ui** — accessible component primitives (Card, Table, Dialog, Form, DropdownMenu, Tabs, etc.)
- **Recharts** — charting library for usage graphs
- **next-themes** — dark/light theme switching
- **Zod** — form validation (shared with bastion config schema where possible)

## Authentication

### Providers
1. **Google OAuth** — primary enterprise SSO
2. **GitHub OAuth** — developer-friendly
3. **Magic Link (Email)** — passwordless fallback

### Auth Flow
1. User visits `/login` → chooses auth method
2. NextAuth completes OAuth or sends magic link
3. On first login (no tenant linked):
   - Redirect to `/onboarding`
   - Prompt for tenant name and provider API keys
   - Dashboard calls `POST /tenants` on control plane
   - Store tenant ID + control key in NextAuth session (encrypted JWT)
4. On subsequent logins:
   - Load tenant from session
   - All API calls include `Authorization: Bearer <controlKey>` to control plane

### Session Storage
NextAuth JWT strategy (stateless, no session database needed). The JWT contains:
- `userId` — NextAuth user ID
- `tenantId` — Bastion tenant UUID
- `controlKey` — encrypted control plane API key
- `email`, `name`, `image` — user profile

## Dashboard Pages

### Layout
- **Left sidebar** (240px, collapsible) with navigation links
- **Top bar** with tenant name, theme toggle, user avatar/menu
- **Main content** area fills remaining space
- **Dark theme default**, switchable to light via toggle
- Sidebar highlights active route with purple accent

### Routes

| Route | Page | Components |
|-------|------|------------|
| `/login` | Login | Auth provider buttons, magic link form |
| `/onboarding` | First-run setup | Tenant name, provider keys, first policy |
| `/` | Overview | StatCards, UsageChart, RecentActivity |
| `/keys` | API Keys | KeysTable, GenerateKeyDialog, RotateKeyDialog |
| `/policies` | Policies | PoliciesTable, PolicyEditor, YAMLPreview |
| `/providers` | Providers | ProviderCards, EditProviderDialog |
| `/usage` | Usage Analytics | DateRangePicker, UsageChart, ModelBreakdown, CostTable |
| `/audit` | Audit Log | AuditTable (paginated, filterable, searchable) |
| `/settings` | Settings | TenantForm, PlanInfo, DangerZone |
| `/settings/team` | Team Management | TeamTable, InviteDialog, RoleSelect |

### Page Details

#### Overview (`/`)
- **Stat cards** (4 across): Total Requests, Blocked Requests, Estimated Cost, Cache Hit Rate
- **Usage chart**: Line/bar chart showing requests over time (7d/30d/90d toggle)
- **Recent activity**: Last 10 audit log entries in a compact list
- **Quick actions**: "Generate API Key", "Add Policy" buttons

#### API Keys (`/keys`)
- **Table**: Key prefix (masked), type (control/proxy), created date, last used
- **Generate key**: Dialog to create new proxy or control key
- **Rotate keys**: Confirm dialog, shows new keys once (never again)
- **Copy to clipboard**: One-click copy for key values

#### Policies (`/policies`)
- **Table**: Policy name, trigger (request/response/both), action (block/warn/redact/tag), condition summary
- **Add/Edit policy**: Form with:
  - Name (text input)
  - Trigger (select: request/response/both)
  - Action (select: block/warn/redact/tag)
  - Condition type (select: contains/regex/injection_score/pii_detected/length_exceeds)
  - Condition fields (dynamic based on type)
- **YAML preview**: Live preview of the policy as bastion.yaml YAML alongside the form
- **Delete policy**: Confirm dialog

#### Providers (`/providers`)
- **Provider cards**: One per configured provider (Anthropic, OpenAI, Ollama)
- **Each card shows**: Provider name, status (configured/not configured), model count
- **Edit dialog**: API key input (masked), base URL override, timeout
- **Primary/fallback toggle**: Set which provider is primary vs fallback

#### Usage Analytics (`/usage`)
- **Date range picker**: Last 7d / 30d / 90d / custom
- **Usage chart**: Requests over time, stacked by provider
- **Model breakdown table**: Model name, requests, input/output tokens, estimated cost
- **Provider breakdown**: Pie chart of requests by provider
- **Cost tracking**: Running total, daily average, projected monthly

#### Audit Log (`/audit`)
- **Paginated table**: Timestamp, provider, model, status (success/blocked/error), duration, tokens, cost
- **Filters**: Status, provider, model, date range
- **Search**: Free text search across request metadata
- **Row expansion**: Click to see full policy decisions for that request

#### Settings (`/settings`)
- **Tenant info**: Name (editable), email, plan, created date
- **Plan info**: Current plan (Team $349/mo or Enterprise), usage vs limits
- **Danger zone**: Delete tenant (requires typing tenant name to confirm)

#### Team (`/settings/team`)
- **Team table**: Email, role (admin/member), invited/accepted date
- **Invite**: Email input + role select, sends magic link
- **Change role**: Dropdown to switch admin/member
- **Remove**: Confirm dialog

## Control Plane API Changes

### Existing Endpoints (no changes needed)
- `POST /tenants` — create tenant (signup)
- `GET /tenants/me` — tenant details
- `PUT /tenants/me/config` — update policies/providers/cache/rate limits
- `GET /tenants/me/config` — get current config
- `GET /tenants/me/usage` — usage summary
- `GET /tenants/me/usage/breakdown` — per-model breakdown
- `POST /tenants/me/rotate-keys` — rotate both keys
- `DELETE /tenants/me` — soft delete tenant

### New Endpoints Required

#### `GET /tenants/me/audit`
Paginated audit log entries.

Query params:
- `page` (default: 1)
- `limit` (default: 50, max: 100)
- `status` (filter: success/blocked/error)
- `provider` (filter)
- `model` (filter)
- `start` / `end` (date range)

Response:
```json
{
  "entries": [...],
  "total": 1234,
  "page": 1,
  "limit": 50
}
```

#### `GET /tenants/me/team`
List team members.

Response:
```json
{
  "members": [
    { "id": "uuid", "email": "user@example.com", "role": "admin", "invitedAt": "...", "acceptedAt": "..." }
  ]
}
```

#### `POST /tenants/me/team/invite`
Invite a team member.

Body: `{ "email": "user@example.com", "role": "member" }`
Response: `{ "id": "uuid", "email": "...", "role": "...", "invitedAt": "..." }`

#### `DELETE /tenants/me/team/:memberId`
Remove a team member.

Response: 204 No Content

#### `PUT /tenants/me/team/:memberId`
Update member role.

Body: `{ "role": "admin" }`
Response: `{ "id": "uuid", "email": "...", "role": "admin" }`

## Database Changes

### New Table: `team_members`

```sql
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(tenant_id, user_email)
);

CREATE INDEX IF NOT EXISTS idx_team_members_tenant ON team_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email ON team_members(user_email);
```

### Existing Tables
No changes to `tenants`, `tenant_configs`, or `usage_logs`.

## Package Structure

```
packages/dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout (sidebar, top bar, theme provider)
│   │   ├── page.tsx                # Overview dashboard
│   │   ├── login/
│   │   │   └── page.tsx            # Login page
│   │   ├── onboarding/
│   │   │   └── page.tsx            # First-run setup wizard
│   │   ├── keys/
│   │   │   └── page.tsx            # API key management
│   │   ├── policies/
│   │   │   └── page.tsx            # Policy management
│   │   ├── providers/
│   │   │   └── page.tsx            # Provider configuration
│   │   ├── usage/
│   │   │   └── page.tsx            # Usage analytics
│   │   ├── audit/
│   │   │   └── page.tsx            # Audit log viewer
│   │   ├── settings/
│   │   │   ├── page.tsx            # General settings
│   │   │   └── team/
│   │   │       └── page.tsx        # Team management
│   │   └── api/
│   │       └── auth/
│   │           └── [...nextauth]/
│   │               └── route.ts    # NextAuth API routes
│   ├── components/
│   │   ├── layout/
│   │   │   ├── sidebar.tsx         # Left sidebar navigation
│   │   │   ├── topbar.tsx          # Top bar (tenant name, theme toggle, avatar)
│   │   │   └── theme-toggle.tsx    # Dark/light switch
│   │   ├── dashboard/
│   │   │   ├── stat-card.tsx       # Metric card (requests, cost, etc.)
│   │   │   ├── usage-chart.tsx     # Recharts line/bar chart
│   │   │   └── recent-activity.tsx # Recent audit entries list
│   │   ├── keys/
│   │   │   ├── keys-table.tsx
│   │   │   ├── generate-key-dialog.tsx
│   │   │   └── rotate-key-dialog.tsx
│   │   ├── policies/
│   │   │   ├── policies-table.tsx
│   │   │   ├── policy-editor.tsx   # Form + YAML preview
│   │   │   └── yaml-preview.tsx
│   │   ├── providers/
│   │   │   ├── provider-card.tsx
│   │   │   └── edit-provider-dialog.tsx
│   │   ├── usage/
│   │   │   ├── date-range-picker.tsx
│   │   │   ├── model-breakdown.tsx
│   │   │   └── cost-table.tsx
│   │   ├── audit/
│   │   │   └── audit-table.tsx
│   │   ├── settings/
│   │   │   ├── tenant-form.tsx
│   │   │   ├── plan-info.tsx
│   │   │   └── danger-zone.tsx
│   │   └── team/
│   │       ├── team-table.tsx
│   │       └── invite-dialog.tsx
│   ├── lib/
│   │   ├── api.ts                  # Control plane API client
│   │   ├── auth.ts                 # NextAuth configuration
│   │   └── utils.ts                # Shared utilities
│   └── styles/
│       └── globals.css             # Tailwind imports + custom properties
├── public/
│   └── logo.svg                    # Bastion shield logo
├── next.config.js
├── tailwind.config.ts
├── package.json
└── tsconfig.json
```

## Theme System

### CSS Custom Properties (matching Bastion brand)

**Dark theme (default):**
```
--bg-primary: #1a1d23
--bg-surface: #13161c
--bg-elevated: #1e2128
--border: #2a2e38
--text-primary: #e2e5ed
--text-dimmed: #8690a5
--accent: #8b5cf6
--accent-blue: #3b82f6
```

**Light theme:**
```
--bg-primary: #ffffff
--bg-surface: #f9fafb
--bg-elevated: #ffffff
--border: #e5e7eb
--text-primary: #111827
--text-dimmed: #6b7280
--accent: #8b5cf6
--accent-blue: #3b82f6
```

Accent colors stay the same across themes. Theme toggle stored in localStorage via `next-themes`.

## Deployment

### Cloudflare Pages
- Build command: `cd packages/dashboard && npm run build`
- Output directory: `packages/dashboard/.next`
- Uses `@cloudflare/next-on-pages` for Cloudflare Workers compatibility
- Environment variables set in Cloudflare dashboard:
  - `NEXTAUTH_SECRET`
  - `NEXTAUTH_URL=https://dashboard.openbastionai.org`
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
  - `EMAIL_SERVER` (SMTP for magic links)
  - `CONTROL_PLANE_URL=https://api.openbastionai.org`

### DNS
CNAME: `dashboard` → Cloudflare Pages URL

## Phase 2 Preview (not in scope)
- Policy builder with visual flow editor
- Usage analytics with drill-down
- Alert configuration UI

## Phase 3 Preview (not in scope)
- Stripe billing integration
- Onboarding wizard with guided setup
- Plan upgrade/downgrade flow
