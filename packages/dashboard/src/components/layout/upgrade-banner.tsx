"use client";

import * as React from "react";
import { X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BillingInfo } from "@/lib/api";

const DISMISS_KEY = "bastion-upgrade-banner-dismissed";

// Mock billing data — will be replaced with real API data once the backend is connected.
const mockBilling: BillingInfo = {
  plan: "trial",
  subscriptionStatus: "trialing",
  trialEndsAt: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
  trialDaysRemaining: 12,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

export function UpgradeBanner() {
  const [dismissed, setDismissed] = React.useState(true);
  const billing = mockBilling;

  React.useEffect(() => {
    const wasDismissed = sessionStorage.getItem(DISMISS_KEY) === "true";
    setDismissed(wasDismissed);
  }, []);

  function handleDismiss() {
    setDismissed(true);
    sessionStorage.setItem(DISMISS_KEY, "true");
  }

  const isTrialWarning =
    billing.subscriptionStatus === "trialing" &&
    billing.trialDaysRemaining != null &&
    billing.trialDaysRemaining <= 3;

  const isPastDue = billing.subscriptionStatus === "past_due";

  // Only show the banner if conditions are met and not dismissed
  if (dismissed || (!isTrialWarning && !isPastDue)) {
    return null;
  }

  const bannerClass = isPastDue
    ? "bg-red-600 text-white"
    : "bg-amber-500 text-amber-950";

  const message = isPastDue
    ? "Payment failed. Update your billing to continue using Bastion."
    : `Your free trial expires in ${billing.trialDaysRemaining} day${
        billing.trialDaysRemaining !== 1 ? "s" : ""
      }. Upgrade now.`;

  const actionLabel = isPastDue ? "Update Billing" : "Upgrade";

  return (
    <div
      className={`relative flex items-center justify-between px-6 py-2.5 text-sm font-medium ${bannerClass}`}
    >
      <span>{message}</span>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-3 text-inherit hover:bg-white/20 hover:text-inherit"
          asChild
        >
          <a href="/settings">
            {actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </Button>
        <button
          onClick={handleDismiss}
          className="ml-1 rounded p-1 transition-colors hover:bg-white/20"
          aria-label="Dismiss banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
