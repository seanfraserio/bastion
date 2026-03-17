"use client";

import * as React from "react";
import { CreditCard, ExternalLink, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  createCheckoutSession,
  createPortalSession,
  type BillingInfo,
} from "@/lib/api";

// Mock billing data — will be replaced with real API calls once the backend is connected.
const mockBilling: BillingInfo = {
  plan: "trial",
  subscriptionStatus: "trialing",
  trialEndsAt: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
  trialDaysRemaining: 12,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

function planBadgeClass(plan: string): string {
  switch (plan) {
    case "trial":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-500";
    case "team":
      return "border-purple-500/30 bg-purple-500/10 text-purple-500";
    case "enterprise":
      return "border-blue-500/30 bg-blue-500/10 text-blue-500";
    default:
      return "";
  }
}

function planDisplayName(plan: string): string {
  switch (plan) {
    case "trial":
      return "Trial";
    case "team":
      return "Team";
    case "enterprise":
      return "Enterprise";
    default:
      return plan.charAt(0).toUpperCase() + plan.slice(1);
  }
}

function TrialProgress({
  trialEndsAt,
  trialDaysRemaining,
}: {
  trialEndsAt: string;
  trialDaysRemaining: number;
}) {
  // Assume a 14-day trial total
  const totalTrialDays = 14;
  const elapsed = totalTrialDays - trialDaysRemaining;
  const pct = Math.min(100, (elapsed / totalTrialDays) * 100);

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">
          {trialDaysRemaining} day{trialDaysRemaining !== 1 ? "s" : ""}
        </span>{" "}
        remaining in your free trial
      </p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-amber-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Trial ends on{" "}
        {new Date(trialEndsAt).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </p>
    </div>
  );
}

export function BillingSection() {
  const [loading, setLoading] = React.useState(false);
  const billing = mockBilling;

  async function handleUpgrade() {
    setLoading(true);
    try {
      const { url } = await createCheckoutSession("");
      window.location.href = url;
    } catch {
      alert(
        "Connect your billing account in Settings to enable this feature."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleManageBilling() {
    setLoading(true);
    try {
      const { url } = await createPortalSession("");
      window.location.href = url;
    } catch {
      alert(
        "Connect your billing account in Settings to enable this feature."
      );
    } finally {
      setLoading(false);
    }
  }

  const isPastDue = billing.subscriptionStatus === "past_due";
  const isCanceled = billing.subscriptionStatus === "canceled";
  const isTrialing = billing.subscriptionStatus === "trialing";
  const isActive = billing.subscriptionStatus === "active";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Billing</CardTitle>
        </div>
        <CardDescription>
          Manage your subscription and payment method.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Plan info */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-lg font-semibold">
                  {planDisplayName(billing.plan)} Plan
                </p>
                <Badge variant="outline" className={planBadgeClass(billing.plan)}>
                  {planDisplayName(billing.plan)}
                </Badge>
              </div>
              {isActive && billing.currentPeriodEnd && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Next billing date:{" "}
                  {new Date(billing.currentPeriodEnd).toLocaleDateString(
                    "en-US",
                    { month: "long", day: "numeric", year: "numeric" }
                  )}{" "}
                  &middot; $349/month
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Trial progress */}
        {isTrialing &&
          billing.trialEndsAt &&
          billing.trialDaysRemaining != null && (
            <TrialProgress
              trialEndsAt={billing.trialEndsAt}
              trialDaysRemaining={billing.trialDaysRemaining}
            />
          )}

        {/* Past due warning */}
        {isPastDue && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm font-medium text-destructive">
              Payment failed — please update your billing method to avoid
              service interruption.
            </p>
          </div>
        )}

        {/* Canceled warning */}
        {isCanceled && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm font-medium text-destructive">
              Your subscription has been canceled. Resubscribe to restore
              access.
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          {(isTrialing || !billing.subscriptionStatus) && (
            <Button onClick={handleUpgrade} disabled={loading}>
              Upgrade to Team — $349/mo
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          )}

          {isActive && (
            <Button
              variant="outline"
              onClick={handleManageBilling}
              disabled={loading}
            >
              Manage Billing
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          )}

          {isPastDue && (
            <Button
              variant="destructive"
              onClick={handleManageBilling}
              disabled={loading}
            >
              Update Payment Method
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
