"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, BookOpen, Mail, Github, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
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

      {/* Support & Documentation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Support & Documentation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <a
              href="https://openbastionai.org"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"
            >
              <BookOpen className="h-5 w-5 text-bastion-purple" />
              <div className="flex-1">
                <p className="text-sm font-medium">Documentation</p>
                <p className="text-xs text-muted-foreground">
                  Guides, tutorials, and reference
                </p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </a>
            <a
              href="https://openbastionai.org"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"
            >
              <BookOpen className="h-5 w-5 text-bastion-purple" />
              <div className="flex-1">
                <p className="text-sm font-medium">API Reference</p>
                <p className="text-xs text-muted-foreground">
                  Full API documentation
                </p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </a>
            <a
              href="mailto:support@openbastionai.org"
              className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"
            >
              <Mail className="h-5 w-5 text-bastion-purple" />
              <div className="flex-1">
                <p className="text-sm font-medium">Support Email</p>
                <p className="text-xs text-muted-foreground">
                  support@openbastionai.org
                </p>
              </div>
            </a>
            <a
              href="https://github.com/seanfraserio/bastion"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"
            >
              <Github className="h-5 w-5 text-bastion-purple" />
              <div className="flex-1">
                <p className="text-sm font-medium">GitHub</p>
                <p className="text-xs text-muted-foreground">
                  Source code and issue tracker
                </p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </a>
          </div>
        </CardContent>
      </Card>

      <DangerZone tenantName={tenantName} onDelete={handleDelete} />
    </div>
  );
}
