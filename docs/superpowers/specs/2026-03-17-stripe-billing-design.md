# Stripe Billing Integration Design Spec

**Date:** 2026-03-17
**Status:** Approved

## Overview

Integrate Stripe billing into Bastion Enterprise. New tenants get a 14-day free trial. After trial, they subscribe to the Team plan ($349/mo) via Stripe Checkout or get blocked. Self-service billing management via Stripe Customer Portal.

## Design Decisions

| Decision | Choice |
|----------|--------|
| Payment flow | Stripe Checkout (hosted) — no PCI scope |
| Billing management | Stripe Customer Portal (hosted) |
| Trial | 14 days, no card required |
| Plans | Team ($349/mo), Enterprise (custom/contact sales) |
| Enforcement | Data plane blocks requests when canceled/unpaid/trial expired |
| Webhooks | Stripe → Control Plane for subscription lifecycle |

## Stripe Configuration

| Item | Value |
|------|-------|
| Price ID (Team) | `price_1TC1a2IFGLyh2AD2AUYFYoBL` |
| Mode | Live |

## Database Changes

Add columns to `tenants` table:

```sql
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trialing'
  CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid'));
```

Also update the inline schema in `db/client.ts` to include these columns for new deployments.

Update `POST /tenants` to set `trial_ends_at = NOW() + INTERVAL '14 days'` and `subscription_status = 'trialing'` on tenant creation.

## Control Plane API — New Endpoints

### `POST /tenants/me/billing/checkout`

Creates a Stripe Checkout Session for the Team plan.

```typescript
// Request: no body needed
// Response: { url: "https://checkout.stripe.com/c/pay/..." }

const session = await stripe.checkout.sessions.create({
  customer: tenant.stripeCustomerId, // create customer if not exists
  mode: "subscription",
  line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
  success_url: `${DASHBOARD_URL}/settings?billing=success`,
  cancel_url: `${DASHBOARD_URL}/settings?billing=canceled`,
  metadata: { tenantId: tenant.id },
});
return { url: session.url };
```

If `stripe_customer_id` is null, create a Stripe customer first:
```typescript
const customer = await stripe.customers.create({
  email: tenant.email,
  name: tenant.name,
  metadata: { tenantId: tenant.id },
});
// UPDATE tenants SET stripe_customer_id = customer.id WHERE id = tenant.id
```

### `POST /tenants/me/billing/portal`

Creates a Stripe Customer Portal session for self-service management (cancel, update payment, view invoices).

```typescript
// Request: no body
// Response: { url: "https://billing.stripe.com/p/session/..." }

const session = await stripe.billingPortal.sessions.create({
  customer: tenant.stripeCustomerId,
  return_url: `${DASHBOARD_URL}/settings`,
});
return { url: session.url };
```

### `GET /tenants/me/billing`

Returns current billing status.

```typescript
// Response:
{
  plan: "team" | "enterprise" | "trial",
  subscriptionStatus: "trialing" | "active" | "past_due" | "canceled" | "unpaid",
  trialEndsAt: "2026-04-01T00:00:00Z" | null,
  trialDaysRemaining: 12 | null,
  currentPeriodEnd: "2026-04-17T00:00:00Z" | null,  // from Stripe subscription
  cancelAtPeriodEnd: false,
}
```

### `POST /webhooks/stripe`

Handles Stripe webhook events. NOT behind tenant auth — verified via Stripe webhook signature.

```typescript
// Verify signature
const event = stripe.webhooks.constructEvent(
  rawBody,
  request.headers["stripe-signature"],
  STRIPE_WEBHOOK_SECRET
);

switch (event.type) {
  case "checkout.session.completed": {
    const session = event.data.object;
    const tenantId = session.metadata.tenantId;
    // UPDATE tenants SET stripe_subscription_id = session.subscription,
    //   subscription_status = 'active' WHERE id = tenantId
    break;
  }
  case "customer.subscription.updated": {
    const subscription = event.data.object;
    // UPDATE tenants SET subscription_status = subscription.status
    //   WHERE stripe_subscription_id = subscription.id
    break;
  }
  case "customer.subscription.deleted": {
    const subscription = event.data.object;
    // UPDATE tenants SET subscription_status = 'canceled'
    //   WHERE stripe_subscription_id = subscription.id
    break;
  }
  case "invoice.payment_failed": {
    const invoice = event.data.object;
    // UPDATE tenants SET subscription_status = 'past_due'
    //   WHERE stripe_customer_id = invoice.customer
    break;
  }
}
```

## Data Plane Enforcement

In `data-plane/server.ts`, after resolving the tenant, check billing status:

```typescript
// After tenant resolution
if (tenant.subscriptionStatus === 'canceled' || tenant.subscriptionStatus === 'unpaid') {
  return reply.code(402).send({
    error: "subscription_required",
    message: "Your subscription is inactive. Please update your billing at dashboard.openbastionai.org/settings"
  });
}

if (tenant.subscriptionStatus === 'trialing' && tenant.trialEndsAt && new Date(tenant.trialEndsAt) < new Date()) {
  return reply.code(402).send({
    error: "trial_expired",
    message: "Your free trial has expired. Please subscribe at dashboard.openbastionai.org/settings"
  });
}
```

## Dashboard Changes

### Settings page — Billing section

Add to `/settings`:
- **Plan info card**: Current plan name, status badge, trial days remaining (if trialing)
- **"Upgrade to Team"** button → calls `POST /billing/checkout`, redirects to Stripe Checkout
- **"Manage Billing"** button → calls `POST /billing/portal`, redirects to Stripe Portal
- Shows after `?billing=success` query param: success toast

### Upgrade banner

When `subscriptionStatus` is `trialing` with < 3 days remaining, or `past_due`:
- Yellow banner across the top of the dashboard
- "Your trial expires in X days. Upgrade now." or "Payment failed. Update your billing."

## Package Changes

### packages/cloud/package.json

Add dependency: `"stripe": "^17.0.0"`

## File Structure (new/modified)

```
packages/cloud/
  src/control-plane/routes/billing.ts    # NEW — checkout, portal, billing status
  src/control-plane/routes/webhooks.ts   # NEW — Stripe webhook handler
  src/control-plane/server.ts            # MODIFY — register billing + webhook routes
  src/data-plane/server.ts               # MODIFY — add billing enforcement
  src/db/client.ts                       # MODIFY — add billing columns to schema

packages/dashboard/
  src/components/settings/billing-section.tsx  # NEW — plan info + upgrade/manage buttons
  src/components/layout/upgrade-banner.tsx     # NEW — trial/past_due warning banner
  src/app/settings/page.tsx                    # MODIFY — add billing section
  src/app/layout.tsx                           # MODIFY — add upgrade banner
  src/lib/api.ts                               # MODIFY — add billing API methods
```

## Environment Variables

| Variable | Where | Value |
|----------|-------|-------|
| `STRIPE_SECRET_KEY` | Cloud Run (control plane) | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Cloud Run (control plane) | `whsec_...` (set after webhook creation) |
| `STRIPE_PRICE_ID` | Cloud Run (control plane) | `price_1TC1a2IFGLyh2AD2AUYFYoBL` |
| `STRIPE_PUBLISHABLE_KEY` | Dashboard (Cloudflare) | `pk_live_...` |
| `DASHBOARD_URL` | Cloud Run (control plane) | `https://dashboard.openbastionai.org` |
