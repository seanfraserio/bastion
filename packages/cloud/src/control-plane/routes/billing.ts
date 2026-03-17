import { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { query } from "../../db/client.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2025-02-24.acacia",
});

const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID ?? "price_1TC1a2IFGLyh2AD2AUYFYoBL";
const DASHBOARD_URL = process.env.DASHBOARD_URL ?? "https://dashboard.openbastionai.org";

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  // Get billing status
  app.get("/tenants/me/billing", async (request, reply) => {
    const tenant = (request as any).tenant;
    if (!tenant) return reply.code(401).send({ error: "unauthorized" });

    const result = await query(
      "SELECT plan, subscription_status, trial_ends_at, stripe_subscription_id FROM tenants WHERE id = $1",
      [tenant.id]
    );
    const row = result.rows[0];

    const trialEndsAt = row.trial_ends_at ? new Date(row.trial_ends_at) : null;
    const now = new Date();
    const trialDaysRemaining = trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : null;

    let currentPeriodEnd: string | null = null;
    let cancelAtPeriodEnd = false;

    if (row.stripe_subscription_id) {
      try {
        const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
        currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString();
        cancelAtPeriodEnd = sub.cancel_at_period_end;
      } catch {
        // Subscription may not exist
      }
    }

    return {
      plan: row.subscription_status === "active" ? row.plan : "trial",
      subscriptionStatus: row.subscription_status,
      trialEndsAt: row.trial_ends_at,
      trialDaysRemaining,
      currentPeriodEnd,
      cancelAtPeriodEnd,
    };
  });

  // Create checkout session
  app.post("/tenants/me/billing/checkout", async (request, reply) => {
    const tenant = (request as any).tenant;
    if (!tenant) return reply.code(401).send({ error: "unauthorized" });

    // Get or create Stripe customer
    let stripeCustomerId: string;
    const tenantResult = await query(
      "SELECT stripe_customer_id, email, name FROM tenants WHERE id = $1",
      [tenant.id]
    );
    const tenantRow = tenantResult.rows[0];

    if (tenantRow.stripe_customer_id) {
      stripeCustomerId = tenantRow.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: tenantRow.email,
        name: tenantRow.name,
        metadata: { tenantId: tenant.id },
      });
      stripeCustomerId = customer.id;
      await query(
        "UPDATE tenants SET stripe_customer_id = $1 WHERE id = $2",
        [stripeCustomerId, tenant.id]
      );
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${DASHBOARD_URL}/settings?billing=success`,
      cancel_url: `${DASHBOARD_URL}/settings?billing=canceled`,
      metadata: { tenantId: tenant.id },
    });

    return { url: session.url };
  });

  // Create customer portal session
  app.post("/tenants/me/billing/portal", async (request, reply) => {
    const tenant = (request as any).tenant;
    if (!tenant) return reply.code(401).send({ error: "unauthorized" });

    const tenantResult = await query(
      "SELECT stripe_customer_id FROM tenants WHERE id = $1",
      [tenant.id]
    );

    if (!tenantResult.rows[0]?.stripe_customer_id) {
      return reply.code(400).send({ error: "no_billing_account", message: "No billing account found. Please subscribe first." });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: tenantResult.rows[0].stripe_customer_id,
      return_url: `${DASHBOARD_URL}/settings`,
    });

    return { url: session.url };
  });
}
