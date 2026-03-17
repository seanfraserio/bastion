"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle } from "lucide-react";
import { TenantForm } from "@/components/settings/tenant-form";
import { PlanInfo } from "@/components/settings/plan-info";
import { BillingSection } from "@/components/settings/billing-section";
import { DangerZone } from "@/components/settings/danger-zone";
import { mockTenant, planDetails } from "@/lib/mock-data";

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const [tenantName, setTenantName] = React.useState(mockTenant.name);
  const [showBillingSuccess, setShowBillingSuccess] = React.useState(false);
  const plan = planDetails[mockTenant.plan];

  React.useEffect(() => {
    if (searchParams.get("billing") === "success") {
      setShowBillingSuccess(true);
      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => setShowBillingSuccess(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  function handleSaveName(name: string) {
    setTenantName(name);
  }

  function handleDelete() {
    // In production, this would call the API and redirect
    console.log("Tenant deletion requested");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your organization settings and subscription.
        </p>
      </div>

      {showBillingSuccess && (
        <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
          <CheckCircle className="h-5 w-5 shrink-0 text-green-500" />
          <p className="text-sm font-medium text-green-500">
            Billing updated successfully! Your subscription is now active.
          </p>
          <button
            onClick={() => setShowBillingSuccess(false)}
            className="ml-auto text-green-500 hover:text-green-400"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      <TenantForm
        name={tenantName}
        email={mockTenant.email}
        onSave={handleSaveName}
      />

      <PlanInfo
        plan={plan.name}
        price={plan.price}
        usage={mockTenant.usage}
      />

      <BillingSection />

      <DangerZone tenantName={tenantName} onDelete={handleDelete} />
    </div>
  );
}
