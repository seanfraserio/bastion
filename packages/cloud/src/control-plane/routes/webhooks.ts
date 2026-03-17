import { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { query } from "../../db/client.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2025-02-24.acacia",
});

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // Stripe webhook — NOT behind tenant auth
  // Need raw body for signature verification
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    done(null, body);
  });

  app.post("/webhooks/stripe", async (request, reply) => {
    const sig = request.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      return reply.code(400).send({ error: "Missing signature or webhook secret" });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(request.body as Buffer, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", (err as Error).message);
      return reply.code(400).send({ error: "Invalid signature" });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.metadata?.tenantId;
        if (tenantId && session.subscription) {
          await query(
            "UPDATE tenants SET stripe_subscription_id = $1, subscription_status = 'active' WHERE id = $2",
            [session.subscription as string, tenantId]
          );
          console.log(`Tenant ${tenantId} subscription activated`);
        }
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const status = subscription.status;
        // Map Stripe status to our status
        const mappedStatus = ["active", "past_due", "canceled", "unpaid"].includes(status) ? status : "active";
        await query(
          "UPDATE tenants SET subscription_status = $1 WHERE stripe_subscription_id = $2",
          [mappedStatus, subscription.id]
        );
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await query(
          "UPDATE tenants SET subscription_status = 'canceled' WHERE stripe_subscription_id = $1",
          [subscription.id]
        );
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.customer) {
          await query(
            "UPDATE tenants SET subscription_status = 'past_due' WHERE stripe_customer_id = $1",
            [invoice.customer as string]
          );
        }
        break;
      }
    }

    return { received: true };
  });
}
